import Link from "next/link";
import { AdminUsersClient } from "@/components/admin-users-client";
import { requirePageSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminUsersPage() {
  const user = await requirePageSuperAdmin();
  if (!user) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">无权限访问</div>;
  }

  const [users, units] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        hospital: true,
        department: true,
        unit: true,
        _count: { select: { createdTasks: true, feedback: true } }
      }
    }),
    prisma.unit.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      include: { hospital: true, department: true }
    })
  ]);

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm font-medium text-slate-600 hover:text-slate-950">
        返回最高管理员后台
      </Link>
      <AdminUsersClient users={users} units={units} />
    </div>
  );
}
