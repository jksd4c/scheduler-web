import { NextResponse } from "next/server";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTaskDetail } from "@/lib/tasks";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireScheduleTaskAccess(params.id);
    const task = await getTaskDetail(params.id);
    if (!task) {
      return NextResponse.json({ message: "排班任务不存在" }, { status: 404 });
    }
    return NextResponse.json({ task });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { task } = await requireScheduleTaskAccess(params.id);

    await prisma.$transaction([
      prisma.scheduleAssignment.deleteMany({ where: { scheduleTaskId: task.id } }),
      prisma.scheduleConflict.deleteMany({ where: { scheduleTaskId: task.id } }),
      prisma.doctorUnavailableTime.deleteMany({ where: { scheduleTaskId: task.id } }),
      prisma.scheduleRequirement.deleteMany({ where: { scheduleTaskId: task.id } }),
      prisma.scheduleDoctor.deleteMany({ where: { scheduleTaskId: task.id } }),
      prisma.scheduleTask.delete({ where: { id: task.id } })
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
