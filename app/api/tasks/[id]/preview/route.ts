import { NextResponse } from "next/server";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { getSchedulePreviewData } from "@/lib/preview-data";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireScheduleTaskAccess(params.id);
    const preview = await getSchedulePreviewData(params.id);
    if (!preview) return NextResponse.json({ message: "排班任务不存在" }, { status: 404 });
    return NextResponse.json(preview);
  } catch (error) {
    return authErrorResponse(error);
  }
}
