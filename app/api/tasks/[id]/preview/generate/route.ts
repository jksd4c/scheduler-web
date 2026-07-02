import { NextResponse } from "next/server";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getSchedulePreviewData } from "@/lib/preview-data";
import { generateSchedulePreviewForTask } from "@/lib/scheduler";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, task } = await requireScheduleTaskAccess(params.id);
    const existingAssignments = await prisma.scheduleAssignment.count({ where: { scheduleTaskId: params.id } });
    await generateSchedulePreviewForTask(params.id);
    const preview = await getSchedulePreviewData(params.id);
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: task.hospitalId,
      departmentId: task.departmentId,
      unitId: task.unitId,
      action: existingAssignments ? "REGENERATE_SCHEDULE_PREVIEW" : "GENERATE_SCHEDULE_PREVIEW",
      targetType: "ScheduleTask",
      targetId: params.id,
      request
    });
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
    console.error(error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "生成预览失败" }, { status: 500 });
  }
}
