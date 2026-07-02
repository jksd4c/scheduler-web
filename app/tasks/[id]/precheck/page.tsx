import Link from "next/link";
import { AuthError, requireScheduleTaskAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

const labels: Record<string, string> = {
  CORE: "固定",
  ROTATION: "轮转",
  WAITING_JOIN: "待加入",
  CLAIMED: "已申请",
  CONFIRMED: "已确认",
  REJECTED: "已驳回",
  NO_SHOW: "未报到",
  PENDING: "待审核",
  APPROVED: "已通过",
  EXACT: "完全匹配",
  PHONE_MATCH: "手机号匹配",
  NAME_MATCH: "姓名匹配",
  FUZZY: "模糊匹配",
  UNMATCHED: "未匹配",
  WAITING_IDENTITY_CONFIRMATION: "身份未确认",
  ACTIVE: "已生效",
  NEEDS_REVIEW: "待审核"
};

export default async function TaskPrecheckPage({ params }: { params: { id: string } }) {
  try {
    await requireScheduleTaskAccess(params.id);
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) redirect("/login");
    return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">无权限访问</div>;
  }
  const [task, roster, claims, feedback] = await Promise.all([
    prisma.scheduleTask.findUnique({ where: { id: params.id }, select: { weekStartDate: true, weekEndDate: true } }),
    prisma.rosterEntry.findMany({ where: { scheduleTaskId: params.id }, orderBy: { createdAt: "asc" } }),
    prisma.joinClaim.findMany({ where: { scheduleTaskId: params.id }, orderBy: { createdAt: "desc" } }),
    prisma.memberFeedback.findMany({ where: { scheduleTaskId: params.id }, include: { unavailableTimes: true }, orderBy: { createdAt: "desc" } })
  ]);
  const claimsByRoster = new Map(claims.filter((claim) => claim.rosterEntryId).map((claim) => [claim.rosterEntryId!, claim]));
  const feedbackByRoster = new Map<string, typeof feedback>();
  for (const item of feedback) {
    if (!item.rosterEntryId) continue;
    feedbackByRoster.set(item.rosterEntryId, [...(feedbackByRoster.get(item.rosterEntryId) ?? []), item]);
  }
  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href={`/tasks/${params.id}`} className="text-sm text-slate-600 hover:text-slate-950">返回任务详情</Link>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">排班前检查 / 冲突处理</h2>
          <p className="mt-1 text-sm text-slate-600">
            {task ? `${task.weekStartDate.toISOString().slice(0, 10)} 至 ${task.weekEndDate.toISOString().slice(0, 10)}` : ""}
            只有身份已确认且反馈已生效的硬性不可排会进入自动排班。
          </p>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
        <div className="table-scroll">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>{["姓名", "手机号", "人员池", "身份", "匹配状态", "审核状态", "反馈状态", "异常", "纳入排班", "不可排摘要", "留言"].map((header) => <th key={header} className="border-b border-slate-200 px-3 py-3 font-medium">{header}</th>)}</tr>
            </thead>
            <tbody>
              {roster.length ? roster.map((entry) => {
                const claim = claimsByRoster.get(entry.id);
                const feedbackItems = feedbackByRoster.get(entry.id) ?? [];
                return (
                  <tr key={entry.id} className="align-top">
                    <td className="border-b border-slate-100 px-3 py-3 font-medium text-slate-900">{entry.expectedName}</td>
                    <td className="border-b border-slate-100 px-3 py-3">{entry.expectedPhone || claim?.inputPhone || "-"}</td>
                    <td className="border-b border-slate-100 px-3 py-3">{labels[entry.poolType] ?? entry.poolType}</td>
                    <td className="border-b border-slate-100 px-3 py-3">{entry.staffType || "-"}</td>
                    <td className="border-b border-slate-100 px-3 py-3">{claim ? labels[claim.matchStatus] ?? claim.matchStatus : "未加入"}</td>
                    <td className="border-b border-slate-100 px-3 py-3">{claim ? labels[claim.reviewStatus] ?? claim.reviewStatus : labels[entry.status] ?? entry.status}</td>
                    <td className="border-b border-slate-100 px-3 py-3">{feedbackItems.map((item) => labels[item.status] ?? item.status).join("；") || "无反馈"}</td>
                    <td className="border-b border-slate-100 px-3 py-3">{feedbackItems.map((item) => item.anomalyStatus).filter(Boolean).join("；") || "无"}</td>
                    <td className="border-b border-slate-100 px-3 py-3">{entry.includeInScheduling ? "是" : "否"}</td>
                    <td className="border-b border-slate-100 px-3 py-3">{feedbackItems.flatMap((item) => item.unavailableTimes.map((u) => `${u.date.toISOString().slice(0, 10)} ${u.timeSlot}`)).join("；") || "无"}</td>
                    <td className="border-b border-slate-100 px-3 py-3 max-w-xs whitespace-pre-wrap">{feedbackItems.map((item) => item.message).filter(Boolean).join("；") || "-"}</td>
                  </tr>
                );
              }) : <tr><td colSpan={11} className="px-3 py-8 text-center text-slate-500">暂无预录名单</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
