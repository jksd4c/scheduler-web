import { NextResponse } from "next/server";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { SCHEDULE_STATUS } from "@/lib/schedule-rules";
import { getTaskDetail } from "@/lib/tasks";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, task } = await requireScheduleTaskAccess(params.id);
    const fullTask = await prisma.scheduleTask.findUnique({
      where: { id: task.id },
      include: { requirements: true }
    });

    if (!fullTask) {
      return NextResponse.json({ message: "排班任务不存在" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.scheduleAssignment.deleteMany({ where: { scheduleTaskId: fullTask.id } });
      await tx.scheduleConflict.deleteMany({ where: { scheduleTaskId: fullTask.id } });
      await tx.scheduleTask.update({
        where: { id: fullTask.id },
        data: { status: fullTask.requirements.length ? SCHEDULE_STATUS.RULES_SET : SCHEDULE_STATUS.DRAFT }
      });
    });

    const updated = await getTaskDetail(fullTask.id);
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: fullTask.hospitalId,
      departmentId: fullTask.departmentId,
      unitId: fullTask.unitId,
      action: "CLEAR_SCHEDULE_RESULT",
      targetType: "ScheduleTask",
      targetId: fullTask.id,
      request
    });
    return NextResponse.json({ task: updated });
  } catch (error) {
    return authErrorResponse(error);
  }
}
