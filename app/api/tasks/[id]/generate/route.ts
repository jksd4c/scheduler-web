import { NextResponse } from "next/server";
import { nowMs, withApiTiming } from "@/lib/api-timing";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { generateScheduleForTask } from "@/lib/scheduler";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const start = nowMs();
  let role: string | null = null;
  try {
    const { user, task: accessTask } = await requireScheduleTaskAccess(params.id);
    role = user.role;
    const effectiveFeedbackCount = await prisma.memberFeedback.count({
      where: { scheduleTaskId: params.id, effective: true, status: { not: "REJECTED" } }
    });
    const task = await generateScheduleForTask(params.id);
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: accessTask.hospitalId,
      departmentId: accessTask.departmentId,
      unitId: accessTask.unitId,
      action: "GENERATE_SCHEDULE",
      targetType: "ScheduleTask",
      targetId: params.id,
      afterJson: { effectiveFeedbackCount },
      request
    });
    return withApiTiming(NextResponse.json({ task }), { route: "POST /api/tasks/[id]/generate", start, role });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const response = authErrorResponse(error);
      return withApiTiming(response, { route: "POST /api/tasks/[id]/generate", start, role });
    }
    console.error(error);
    return withApiTiming(NextResponse.json({ message: error instanceof Error ? error.message : "生成排班失败" }, { status: 500 }), {
      route: "POST /api/tasks/[id]/generate",
      start,
      role
    });
  }
}
