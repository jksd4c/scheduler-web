import { NextResponse } from "next/server";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { dateFromKey, getWeekDates } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { SCHEDULE_STATUS, TIME_SLOT, type TimeSlotValue } from "@/lib/schedule-rules";
import { getTaskDetail } from "@/lib/tasks";

export const runtime = "nodejs";

const VALID_SLOTS = new Set<string>([TIME_SLOT.FULL_DAY, TIME_SLOT.MORNING, TIME_SLOT.AFTERNOON]);

type IncomingUnavailableRecord = {
  doctorId?: string;
  date?: string;
  timeSlot?: TimeSlotValue;
  reason?: string;
};

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireScheduleTaskAccess(params.id);
    const body = await request.json();
    const records = Array.isArray(body.records) ? (body.records as IncomingUnavailableRecord[]) : [];
    const task = await prisma.scheduleTask.findUnique({
      where: { id: params.id },
      include: { doctors: true, requirements: true }
    });

    if (!task) {
      return NextResponse.json({ message: "排班任务不存在" }, { status: 404 });
    }

    const doctorIds = new Set(task.doctors.map((doctor) => doctor.id));
    const weekDays = getWeekDates(task.weekStartDate);
    const weekdayByDate = new Map(weekDays.map((day) => [day.dateKey, day.weekday]));
    const dedupe = new Set<string>();
    const data: Array<{
      departmentId: string;
      scheduleTaskId: string;
      doctorId: string;
      date: Date;
      weekday: number;
      timeSlot: TimeSlotValue;
      reason: string | null;
    }> = [];

    for (const record of records) {
      const doctorId = String(record.doctorId ?? "");
      const date = String(record.date ?? "").slice(0, 10);
      const timeSlot = record.timeSlot;

      if (!doctorIds.has(doctorId) || !date || !timeSlot || !VALID_SLOTS.has(timeSlot)) {
        continue;
      }

      const weekday = weekdayByDate.get(date);
      if (!weekday) {
        continue;
      }

      const key = `${doctorId}:${date}:${timeSlot}`;
      if (dedupe.has(key)) {
        continue;
      }
      dedupe.add(key);

      data.push({
        departmentId: task.departmentId,
        scheduleTaskId: task.id,
        doctorId,
        date: dateFromKey(date),
        weekday,
        timeSlot,
        reason: record.reason?.trim() || null
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.doctorUnavailableTime.deleteMany({ where: { scheduleTaskId: task.id } });
      await tx.scheduleAssignment.deleteMany({ where: { scheduleTaskId: task.id } });
      await tx.scheduleConflict.deleteMany({ where: { scheduleTaskId: task.id } });

      if (data.length > 0) {
        await tx.doctorUnavailableTime.createMany({ data });
      }

      await tx.scheduleTask.update({
        where: { id: task.id },
        data: { status: task.requirements.length ? SCHEDULE_STATUS.RULES_SET : SCHEDULE_STATUS.DRAFT }
      });
    });

    const updated = await getTaskDetail(task.id);
    return NextResponse.json({ task: updated });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    console.error(error);
    return NextResponse.json({ message: "保存不可排班时间失败" }, { status: 500 });
  }
}
