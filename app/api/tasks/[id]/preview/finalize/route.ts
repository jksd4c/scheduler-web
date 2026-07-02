import { NextResponse } from "next/server";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getSchedulePreviewData } from "@/lib/preview-data";
import { SCHEDULE_STATUS } from "@/lib/schedule-rules";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, task } = await requireScheduleTaskAccess(params.id);
    const [conflictCount, manualOverrideCount] = await Promise.all([
      prisma.scheduleConflict.count({ where: { scheduleTaskId: params.id } }),
      prisma.scheduleAssignment.count({ where: { scheduleTaskId: params.id, manualOverride: true } })
    ]);
    await prisma.scheduleTask.update({ where: { id: params.id }, data: { status: SCHEDULE_STATUS.GENERATED } });
    const preview = await getSchedulePreviewData(params.id);
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: task.hospitalId,
      departmentId: task.departmentId,
      unitId: task.unitId,
      action: "FINALIZE_SCHEDULE_PREVIEW",
      targetType: "ScheduleTask",
      targetId: params.id,
      afterJson: { conflictCount, manualOverrideCount },
      request
    });
    return NextResponse.json(preview);
  } catch (error) {
    return authErrorResponse(error);
  }
}
