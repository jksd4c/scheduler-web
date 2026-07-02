import Link from "next/link";
import { AdminOrganizationRequestsClient } from "@/components/admin-organization-requests-client";
import { requirePageSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminOrganizationRequestsPage() {
  const user = await requirePageSuperAdmin();
  if (!user) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">无权限访问</div>;
  }

  const requests = await prisma.organizationRequest.findMany({
    orderBy: { createdAt: "desc" }
  });

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm font-medium text-slate-600 hover:text-slate-950">
        返回最高管理员后台
      </Link>
      <AdminOrganizationRequestsClient requests={requests} />
    </div>
  );
}
