import { NextResponse } from "next/server";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { createScheduleWorkbook } from "@/lib/excel-export";
import { toDateKey } from "@/lib/date-utils";
import { getTaskDetail } from "@/lib/tasks";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireScheduleTaskAccess(params.id);
    const task = await getTaskDetail(params.id);
    if (!task) {
      return NextResponse.json({ message: "排班任务不存在" }, { status: 404 });
    }

    const workbook = await createScheduleWorkbook(task);
    const buffer = await workbook.xlsx.writeBuffer();
    const start = toDateKey(task.weekStartDate);
    const end = toDateKey(task.weekEndDate);
    const filename = `心电图室排班表_${start}至${end}.xlsx`;

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
      }
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
