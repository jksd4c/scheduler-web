import Link from "next/link";
import { AdminHospitalsClient } from "@/components/admin-hospitals-client";
import { requirePageSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminHospitalsPage() {
  const user = await requirePageSuperAdmin();
  if (!user) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">无权限访问</div>;
  }

  const hospitals = await prisma.hospital.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { departments: true, units: true, users: true, scheduleTasks: true } } }
  });

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm font-medium text-slate-600 hover:text-slate-950">
        返回最高管理员后台
      </Link>
      <AdminHospitalsClient hospitals={hospitals} />
    </div>
  );
}
