import { NextResponse } from "next/server";
import { nowMs, withApiTiming } from "@/lib/api-timing";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getTaskDetail } from "@/lib/tasks";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const start = nowMs();
  let role: string | null = null;
  try {
    const { user } = await requireScheduleTaskAccess(params.id);
    role = user.role;
    const task = await getTaskDetail(params.id);
    if (!task) {
      return withApiTiming(NextResponse.json({ message: "排班任务不存在" }, { status: 404 }), {
        route: "GET /api/tasks/[id]",
        start,
        role
      });
    }
    return withApiTiming(NextResponse.json({ task }), { route: "GET /api/tasks/[id]", start, role });
  } catch (error) {
    const response = authErrorResponse(error);
    return withApiTiming(response, { route: "GET /api/tasks/[id]", start, role });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const start = nowMs();
  let role: string | null = null;
  try {
    const { user, task } = await requireScheduleTaskAccess(params.id);
    role = user.role;

    await prisma.$transaction([
      prisma.scheduleAssignment.deleteMany({ where: { scheduleTaskId: task.id } }),
      prisma.scheduleConflict.deleteMany({ where: { scheduleTaskId: task.id } }),
      prisma.doctorUnavailableTime.deleteMany({ where: { scheduleTaskId: task.id } }),
      prisma.scheduleRequirement.deleteMany({ where: { scheduleTaskId: task.id } }),
      prisma.scheduleParticipant.deleteMany({ where: { scheduleTaskId: task.id } }),
      prisma.scheduleDoctor.deleteMany({ where: { scheduleTaskId: task.id } }),
      prisma.scheduleTask.delete({ where: { id: task.id } })
    ]);

    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: task.hospitalId,
      departmentId: task.departmentId,
      unitId: task.unitId,
      action: "DELETE_SCHEDULE_TASK",
      targetType: "ScheduleTask",
      targetId: task.id,
      request
    });

    return withApiTiming(NextResponse.json({ ok: true }), { route: "DELETE /api/tasks/[id]", start, role });
  } catch (error) {
    const response = authErrorResponse(error);
    return withApiTiming(response, { route: "DELETE /api/tasks/[id]", start, role });
  }
}
