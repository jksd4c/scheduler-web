import { NextResponse } from "next/server";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { createScheduleWorkbook } from "@/lib/excel-export";
import { toDateKey } from "@/lib/date-utils";
import { getTaskDetail } from "@/lib/tasks";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, task: accessTask } = await requireScheduleTaskAccess(params.id);
    const task = await getTaskDetail(params.id);
    if (!task) {
      return NextResponse.json({ message: "排班任务不存在" }, { status: 404 });
    }

    const workbook = await createScheduleWorkbook(task);
    const buffer = await workbook.xlsx.writeBuffer();
    const start = toDateKey(task.weekStartDate);
    const end = toDateKey(task.weekEndDate);
    const filename = `公平排班表_${start}至${end}.xlsx`;

    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: accessTask.hospitalId,
      departmentId: accessTask.departmentId,
      unitId: accessTask.unitId,
      action: "EXPORT_EXCEL",
      targetType: "ScheduleTask",
      targetId: task.id,
      afterJson: { filename },
      request
    });

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
