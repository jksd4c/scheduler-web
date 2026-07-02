import { NextResponse } from "next/server";
import { nowMs, withApiTiming } from "@/lib/api-timing";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { dateFromKey, getWeekDates } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import {
  SCHEDULE_MODE,
  SCHEDULE_STATUS,
  TIME_SLOT,
  asScheduleMode,
  asTaskScheduleMode,
  clampRequiredDoctors,
  clampRoomCount,
  TASK_SCHEDULE_MODE,
  type TimeSlotValue
} from "@/lib/schedule-rules";
import { getTaskDetail } from "@/lib/tasks";

export const runtime = "nodejs";

type IncomingRequirement = {
  date?: string;
  weekday?: number;
  timeSlot?: TimeSlotValue;
  shiftTypeId?: string | null;
  enabled?: boolean;
  roomNumber?: number;
  requiredDoctors?: number;
};

const VALID_SLOTS = new Set<string>([TIME_SLOT.FULL_DAY, TIME_SLOT.MORNING, TIME_SLOT.AFTERNOON]);

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const start = nowMs();
  let role: string | null = null;
  try {
    const { user } = await requireScheduleTaskAccess(params.id);
    role = user.role;
    const body = await request.json();
    const records = Array.isArray(body.records) ? (body.records as IncomingRequirement[]) : [];
    const task = await prisma.scheduleTask.findUnique({
      where: { id: params.id },
      include: { assignments: true }
    });

    if (!task) {
      return withApiTiming(NextResponse.json({ message: "排班任务不存在" }, { status: 404 }), {
        route: "PUT /api/tasks/[id]/requirements",
        start,
        role
      });
    }

    const mode = asScheduleMode(task.mode);
    const taskScheduleMode = asTaskScheduleMode((task as any).scheduleMode);
    const requestedShiftTypeIds = Array.from(new Set(records.map((record) => String(record.shiftTypeId ?? "")).filter(Boolean)));
    const validShiftTypes = requestedShiftTypeIds.length
      ? await prisma.shiftType.findMany({
          where: { id: { in: requestedShiftTypeIds }, unitId: task.unitId ?? "__none__", active: true },
          select: { id: true }
        })
      : [];
    const validShiftTypeIds = new Set(validShiftTypes.map((item) => item.id));
    const weekDays = getWeekDates(task.weekStartDate);
    const weekdayByDate = new Map(weekDays.map((day) => [day.dateKey, day.weekday]));
    const dedupe = new Set<string>();
    const data: Array<{
      departmentId: string;
      scheduleTaskId: string;
      date: Date;
      weekday: number;
      timeSlot: TimeSlotValue;
      shiftTypeId?: string | null;
      enabled: boolean;
      roomNumber: number;
      requiredDoctors: number;
    }> = [];

    for (const record of records) {
      const date = String(record.date ?? "").slice(0, 10);
      const timeSlot = record.timeSlot;
      if (!date || !timeSlot || !VALID_SLOTS.has(timeSlot)) continue;
      if (mode === SCHEDULE_MODE.FULL_DAY && timeSlot !== TIME_SLOT.FULL_DAY) continue;
      if (mode === SCHEDULE_MODE.HALF_DAY && timeSlot === TIME_SLOT.FULL_DAY) continue;

      const weekday = weekdayByDate.get(date);
      if (!weekday) continue;

      const roomNumber = clampRoomCount(Number(record.roomNumber ?? 0));
      const requestedRequiredDoctors = Number(record.requiredDoctors ?? 1);
      const requiredDoctors =
        taskScheduleMode === TASK_SCHEDULE_MODE.MEDTECH_ROOM
          ? clampRequiredDoctors(requestedRequiredDoctors)
          : Math.max(1, Math.min(50, Math.floor(Number.isFinite(requestedRequiredDoctors) ? requestedRequiredDoctors : 1)));
      const enabled = Boolean(record.enabled) && roomNumber > 0 && requiredDoctors > 0;
      if (!enabled) continue;

      const key = `${date}:${timeSlot}:${roomNumber}`;
      if (dedupe.has(key)) continue;
      dedupe.add(key);

      data.push({
        departmentId: task.departmentId,
        scheduleTaskId: task.id,
        date: dateFromKey(date),
        weekday,
        timeSlot,
        shiftTypeId: validShiftTypeIds.has(String(record.shiftTypeId ?? "")) ? String(record.shiftTypeId) : null,
        enabled: true,
        roomNumber,
        requiredDoctors
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.scheduleRequirement.deleteMany({ where: { scheduleTaskId: task.id } });
      await tx.scheduleAssignment.deleteMany({ where: { scheduleTaskId: task.id } });
      await tx.scheduleConflict.deleteMany({ where: { scheduleTaskId: task.id } });
      if (data.length > 0) {
        await tx.scheduleRequirement.createMany({ data });
      }
      await tx.scheduleTask.update({
        where: { id: task.id },
        data: { status: data.length ? SCHEDULE_STATUS.RULES_SET : SCHEDULE_STATUS.DRAFT }
      });
    });

    const updated = await getTaskDetail(task.id);
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: task.hospitalId,
      departmentId: task.departmentId,
      unitId: task.unitId,
      action: "UPDATE_SCHEDULE_REQUIREMENTS",
      targetType: "ScheduleTask",
      targetId: task.id,
      afterJson: { requirementCount: data.length },
      request
    });
    return withApiTiming(NextResponse.json({ task: updated }), {
      route: "PUT /api/tasks/[id]/requirements",
      start,
      role
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const response = authErrorResponse(error);
      return withApiTiming(response, { route: "PUT /api/tasks/[id]/requirements", start, role });
    }
    console.error(error);
    return withApiTiming(NextResponse.json({ message: "保存排班规则失败" }, { status: 500 }), {
      route: "PUT /api/tasks/[id]/requirements",
      start,
      role
    });
  }
}
