import Link from "next/link";
import { AdminDepartmentsClient } from "@/components/admin-departments-client";
import { requirePageSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminDepartmentsPage() {
  const user = await requirePageSuperAdmin();
  if (!user) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">无权限访问</div>;
  }

  const departments = await prisma.department.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: {
        select: { users: true, scheduleTasks: true }
      }
    }
  });

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm font-medium text-slate-600 hover:text-slate-950">
        返回最高管理员后台
      </Link>
      <AdminDepartmentsClient departments={departments} />
    </div>
  );
}
