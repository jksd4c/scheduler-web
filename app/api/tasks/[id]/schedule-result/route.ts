import { NextResponse } from "next/server";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SCHEDULE_STATUS } from "@/lib/schedule-rules";
import { getTaskDetail } from "@/lib/tasks";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { task } = await requireScheduleTaskAccess(params.id);
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
    return NextResponse.json({ task: updated });
  } catch (error) {
    return authErrorResponse(error);
  }
}
