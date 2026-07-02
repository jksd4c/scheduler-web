import Link from "next/link";
import { PaginationLinks } from "@/components/pagination-links";
import { requirePageSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 30;

export default async function AdminAuditLogsPage({ searchParams }: { searchParams?: { page?: string } }) {
  const user = await requirePageSuperAdmin();
  if (!user) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">无权限访问</div>;
  }

  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);
  const [logs, totalLogs] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        reason: true,
        createdAt: true,
        actorUser: { select: { username: true, displayName: true } },
        hospital: { select: { name: true } },
        department: { select: { name: true } },
        unit: { select: { name: true } }
      }
    }),
    prisma.auditLog.count()
  ]);

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm font-medium text-slate-600 hover:text-slate-950">
        返回最高管理员后台
      </Link>
      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">审计日志</h2>
          <p className="mt-1 text-sm text-slate-600">按时间分页查看关键操作记录，默认每页 {PAGE_SIZE} 条。</p>
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
          <div className="table-scroll">
            <table className="min-w-[960px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="border-b border-slate-200 px-4 py-3 font-medium">时间</th>
                  <th className="border-b border-slate-200 px-4 py-3 font-medium">操作者</th>
                  <th className="border-b border-slate-200 px-4 py-3 font-medium">组织</th>
                  <th className="border-b border-slate-200 px-4 py-3 font-medium">动作</th>
                  <th className="border-b border-slate-200 px-4 py-3 font-medium">对象</th>
                  <th className="border-b border-slate-200 px-4 py-3 font-medium">原因</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      暂无审计日志
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-600">{log.createdAt.toLocaleString("zh-CN")}</td>
                      <td className="border-b border-slate-100 px-4 py-3">{log.actorUser?.displayName || log.actorUser?.username || "-"}</td>
                      <td className="border-b border-slate-100 px-4 py-3">{[log.hospital?.name, log.department?.name, log.unit?.name].filter(Boolean).join(" / ") || "-"}</td>
                      <td className="border-b border-slate-100 px-4 py-3 font-medium text-slate-900">{log.action}</td>
                      <td className="border-b border-slate-100 px-4 py-3">{[log.targetType, log.targetId].filter(Boolean).join(" / ")}</td>
                      <td className="border-b border-slate-100 px-4 py-3">{log.reason || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <PaginationLinks basePath="/admin/audit-logs" page={page} pageSize={PAGE_SIZE} total={totalLogs} label="审计日志" />
      </section>
    </div>
  );
}
