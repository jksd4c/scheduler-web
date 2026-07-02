import Link from "next/link";
import { AdminUsersClient } from "@/components/admin-users-client";
import { PaginationLinks } from "@/components/pagination-links";
import { requirePageSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 30;

export default async function AdminUsersPage({ searchParams }: { searchParams?: { page?: string } }) {
  const user = await requirePageSuperAdmin();
  if (!user) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">无权限访问</div>;
  }

  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);
  const [users, totalUsers, units] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        username: true,
        displayName: true,
        phone: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        lastLoginAt: true,
        hospital: { select: { name: true } },
        department: { select: { name: true } },
        unit: { select: { id: true, name: true } },
        _count: { select: { createdTasks: true, feedback: true } }
      }
    }),
    prisma.user.count(),
    prisma.unit.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        hospital: { select: { name: true } },
        department: { select: { name: true } }
      }
    })
  ]);

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm font-medium text-slate-600 hover:text-slate-950">
        返回最高管理员后台
      </Link>
      <AdminUsersClient users={users} units={units} />
      <PaginationLinks basePath="/admin/users" page={page} pageSize={PAGE_SIZE} total={totalUsers} label="用户" />
    </div>
  );
}
