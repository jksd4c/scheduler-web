import { NextResponse } from "next/server";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { dateFromKey } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { getSchedulePreviewData } from "@/lib/preview-data";
import { asTimeSlot } from "@/lib/schedule-rules";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, task } = await requireScheduleTaskAccess(params.id);
    const body = await request.json();
    const dateKey = String(body.date ?? "").slice(0, 10);
    const timeSlot = asTimeSlot(String(body.timeSlot ?? ""));
    const roomNumber = Number(body.roomNumber);
    const locked = body.locked !== false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !roomNumber) {
      return NextResponse.json({ message: "日期或单元无效" }, { status: 400 });
    }

    const before = await prisma.scheduleAssignment.findMany({
      where: { scheduleTaskId: params.id, date: dateFromKey(dateKey), timeSlot, roomNumber }
    });
    await prisma.scheduleAssignment.updateMany({
      where: { scheduleTaskId: params.id, date: dateFromKey(dateKey), timeSlot, roomNumber },
      data: { locked }
    });
    const preview = await getSchedulePreviewData(params.id);
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: task.hospitalId,
      departmentId: task.departmentId,
      unitId: task.unitId,
      action: locked ? "LOCK_PREVIEW_CELL" : "UNLOCK_PREVIEW_CELL",
      targetType: "ScheduleAssignment",
      targetId: params.id,
      beforeJson: before,
      afterJson: { date: dateKey, timeSlot, roomNumber, locked },
      request
    });
    return NextResponse.json(preview);
  } catch (error) {
    return authErrorResponse(error);
  }
}
