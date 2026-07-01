import { NextResponse } from "next/server";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { dateFromKey, getWeekDates } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import {
  SCHEDULE_MODE,
  SCHEDULE_STATUS,
  TIME_SLOT,
  asScheduleMode,
  clampRequiredDoctors,
  clampRoomCount,
  type TimeSlotValue
} from "@/lib/schedule-rules";
import { getTaskDetail } from "@/lib/tasks";

export const runtime = "nodejs";

type IncomingRequirement = {
  date?: string;
  weekday?: number;
  timeSlot?: TimeSlotValue;
  enabled?: boolean;
  roomNumber?: number;
  requiredDoctors?: number;
};

const VALID_SLOTS = new Set<string>([TIME_SLOT.FULL_DAY, TIME_SLOT.MORNING, TIME_SLOT.AFTERNOON]);

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireScheduleTaskAccess(params.id);
    const body = await request.json();
    const records = Array.isArray(body.records) ? (body.records as IncomingRequirement[]) : [];
    const task = await prisma.scheduleTask.findUnique({
      where: { id: params.id },
      include: { assignments: true }
    });

    if (!task) {
      return NextResponse.json({ message: "排班任务不存在" }, { status: 404 });
    }

    const mode = asScheduleMode(task.mode);
    const weekDays = getWeekDates(task.weekStartDate);
    const weekdayByDate = new Map(weekDays.map((day) => [day.dateKey, day.weekday]));
    const dedupe = new Set<string>();
    const data: Array<{
      departmentId: string;
      scheduleTaskId: string;
      date: Date;
      weekday: number;
      timeSlot: TimeSlotValue;
      enabled: boolean;
      roomNumber: number;
      requiredDoctors: number;
    }> = [];

    for (const record of records) {
      const date = String(record.date ?? "").slice(0, 10);
      const timeSlot = record.timeSlot;
      if (!date || !timeSlot || !VALID_SLOTS.has(timeSlot)) {
        continue;
      }
      if (mode === SCHEDULE_MODE.FULL_DAY && timeSlot !== TIME_SLOT.FULL_DAY) {
        continue;
      }
      if (mode === SCHEDULE_MODE.HALF_DAY && timeSlot === TIME_SLOT.FULL_DAY) {
        continue;
      }

      const weekday = weekdayByDate.get(date);
      if (!weekday) {
        continue;
      }

      const roomNumber = clampRoomCount(Number(record.roomNumber ?? 0));
      const requiredDoctors = clampRequiredDoctors(Number(record.requiredDoctors ?? 1));
      const enabled = Boolean(record.enabled) && roomNumber > 0 && requiredDoctors > 0;
      if (!enabled) {
        continue;
      }

      const key = `${date}:${timeSlot}:${roomNumber}`;
      if (dedupe.has(key)) {
        continue;
      }
      dedupe.add(key);

      data.push({
        departmentId: task.departmentId,
        scheduleTaskId: task.id,
        date: dateFromKey(date),
        weekday,
        timeSlot,
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
    return NextResponse.json({ task: updated });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    console.error(error);
    return NextResponse.json({ message: "保存排班规则失败" }, { status: 500 });
  }
}
