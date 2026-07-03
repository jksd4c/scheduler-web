import { redirect } from "next/navigation";
import { getCurrentGuest } from "@/lib/auth";
import { getWeekdayLabel, toDateKey } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { MODE_LABELS, SLOT_LABELS, asScheduleMode, asTimeSlot } from "@/lib/schedule-rules";

export default async function GuestSchedulePage() {
  const guest = await getCurrentGuest();
  if (!guest) {
    redirect("/guest");
  }

  const tasks = await prisma.scheduleTask.findMany({
    where: {
      departmentId: guest.departmentId,
      status: { in: ["GENERATED", "PUBLISHED", "LOCKED"] }
    },
    orderBy: { startDate: "desc" },
    include: {
      assignments: {
        include: { doctor: true },
        orderBy: [{ date: "asc" }, { timeSlot: "asc" }, { roomNumber: "asc" }, { createdAt: "asc" }]
      },
      conflicts: {
        orderBy: [{ severity: "desc" }, { date: "asc" }, { timeSlot: "asc" }, { roomNumber: "asc" }]
      }
    }
  });

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">{guest.department.name}排班查看</h2>
        <p className="mt-1 text-sm text-slate-600">只读查看仅可查看已生成排班，不能编辑、删除、重新生成或导出。</p>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">暂无可查看的已生成排班。</div>
      ) : (
        tasks.map((task) => {
          const rows = task.assignments.map((assignment) => ({
            id: assignment.id,
            date: toDateKey(assignment.date),
            weekday: getWeekdayLabel(assignment.weekday),
            timeSlot: SLOT_LABELS[asTimeSlot(assignment.timeSlot)],
            room: `单元${assignment.roomNumber}`,
            doctor: assignment.doctor.name,
            doctorType: assignment.doctor.doctorType === "INTERN" ? "轮转" : "固定"
          }));
          return (
            <div key={task.id} className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-table">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">
                    {toDateKey((task as any).startDate ?? task.weekStartDate)} 至 {toDateKey((task as any).endDate ?? task.weekEndDate)}
                  </h3>
                  <p className="text-sm text-slate-600">{MODE_LABELS[asScheduleMode(task.mode)]}</p>
                </div>
                {task.conflicts.length ? <span className="text-sm font-medium text-hospital-red">存在 {task.conflicts.length} 条冲突</span> : null}
              </div>
              <div className="table-scroll">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2 font-medium">日期</th>
                      <th className="border-b border-slate-200 px-3 py-2 font-medium">星期</th>
                      <th className="border-b border-slate-200 px-3 py-2 font-medium">时段</th>
                      <th className="border-b border-slate-200 px-3 py-2 font-medium">单元</th>
                      <th className="border-b border-slate-200 px-3 py-2 font-medium">人员</th>
                      <th className="border-b border-slate-200 px-3 py-2 font-medium">类型</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="border-b border-slate-100 px-3 py-2">{row.date}</td>
                        <td className="border-b border-slate-100 px-3 py-2">{row.weekday}</td>
                        <td className="border-b border-slate-100 px-3 py-2">{row.timeSlot}</td>
                        <td className="border-b border-slate-100 px-3 py-2">{row.room}</td>
                        <td className="border-b border-slate-100 px-3 py-2 font-medium text-slate-900">{row.doctor}</td>
                        <td className="border-b border-slate-100 px-3 py-2">{row.doctorType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
