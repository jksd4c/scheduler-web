import { AuthError, requirePageUser, USER_ROLE } from "@/lib/auth";
import { getWeekdayLabel, toDateKey } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { SLOT_LABELS, asTimeSlot } from "@/lib/schedule-rules";
import { redirect } from "next/navigation";

export default async function MySchedulePage() {
  let user;
  try {
    user = await requirePageUser();
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) redirect("/login");
    throw error;
  }
  if (user.role !== USER_ROLE.MEMBER) redirect("/dashboard");
  const staffProfiles = await prisma.staffProfile.findMany({ where: { userId: user.id }, select: { id: true, displayName: true } });
  const assignments = staffProfiles.length
    ? await prisma.scheduleAssignment.findMany({
        where: { doctor: { staffProfileId: { in: staffProfiles.map((item) => item.id) } } },
        include: { doctor: true, scheduleTask: { select: { startDate: true, endDate: true, weekStartDate: true, weekEndDate: true } } },
        orderBy: [{ date: "desc" }]
      })
    : [];
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">我的排班</h2>
        <p className="mt-1 text-sm text-slate-600">仅显示已经由管理员确认并绑定到你的人员档案后的排班。</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
        <div className="table-scroll">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>{["周期", "日期", "星期", "时段", "单元/班次"].map((header) => <th key={header} className="border-b border-slate-200 px-3 py-3 font-medium">{header}</th>)}</tr>
            </thead>
            <tbody>
              {assignments.length ? assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td className="border-b border-slate-100 px-3 py-3">{toDateKey(assignment.scheduleTask.startDate ?? assignment.scheduleTask.weekStartDate)} 至 {toDateKey(assignment.scheduleTask.endDate ?? assignment.scheduleTask.weekEndDate)}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{toDateKey(assignment.date)}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{getWeekdayLabel(assignment.weekday)}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{SLOT_LABELS[asTimeSlot(assignment.timeSlot)]}</td>
                  <td className="border-b border-slate-100 px-3 py-3">单元{assignment.roomNumber}</td>
                </tr>
              )) : <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">暂无排班</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
