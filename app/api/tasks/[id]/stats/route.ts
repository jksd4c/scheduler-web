import { NextResponse } from "next/server";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { getTaskDetail } from "@/lib/tasks";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireScheduleTaskAccess(params.id);
    const task = await getTaskDetail(params.id);
    if (!task) {
      return NextResponse.json({ message: "排班任务不存在" }, { status: 404 });
    }
    return NextResponse.json({ stats: task.stats });
  } catch (error) {
    return authErrorResponse(error);
  }
}
