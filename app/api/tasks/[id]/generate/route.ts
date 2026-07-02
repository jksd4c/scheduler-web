import { NextResponse } from "next/server";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { generateScheduleForTask } from "@/lib/scheduler";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, task: accessTask } = await requireScheduleTaskAccess(params.id);
    const task = await generateScheduleForTask(params.id);
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: accessTask.hospitalId,
      departmentId: accessTask.departmentId,
      unitId: accessTask.unitId,
      action: "GENERATE_SCHEDULE",
      targetType: "ScheduleTask",
      targetId: params.id,
      request
    });
    return NextResponse.json({ task });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    console.error(error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "生成排班失败" }, { status: 500 });
  }
}
