import { NextResponse } from "next/server";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { generateScheduleForTask } from "@/lib/scheduler";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireScheduleTaskAccess(params.id);
    const task = await generateScheduleForTask(params.id);
    return NextResponse.json({ task });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    console.error(error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "生成排班失败" }, { status: 500 });
  }
}
