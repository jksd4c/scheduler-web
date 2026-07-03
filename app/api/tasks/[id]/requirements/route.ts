import { NextResponse } from "next/server";
import { nowMs, withApiTiming } from "@/lib/api-timing";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { dateFromKey, getDateRangeDates, toDateKey } from "@/lib/date-utils";
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
import { expandWardRequirements, normalizeSpecialDateType } from "@/lib/ward-rules";

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
type IncomingWeeklyTemplate = {
  weekday?: number;
  shiftTypeId?: string | null;
  enabled?: boolean;
  requiredDoctors?: number;
};
type IncomingDateOverride = {
  date?: string;
  shiftTypeId?: string | null;
  dateType?: string | null;
  note?: string | null;
  overrideEnabled?: boolean;
  enabled?: boolean;
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
    const weeklyTemplates = Array.isArray(body.weeklyTemplates) ? (body.weeklyTemplates as IncomingWeeklyTemplate[]) : [];
    const dateOverrides = Array.isArray(body.dateOverrides) ? (body.dateOverrides as IncomingDateOverride[]) : [];
    const usesWardTemplatePayload = weeklyTemplates.length > 0 || dateOverrides.length > 0 || body.ruleMode === "WARD_WEEKLY_TEMPLATE";
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
    const requestedShiftTypeIds = Array.from(
      new Set([
        ...records.map((record) => String(record.shiftTypeId ?? "")).filter(Boolean),
        ...weeklyTemplates.map((record) => String(record.shiftTypeId ?? "")).filter(Boolean),
        ...dateOverrides.map((record) => String(record.shiftTypeId ?? "")).filter(Boolean)
      ])
    );
    const validShiftTypes = requestedShiftTypeIds.length
      ? await prisma.shiftType.findMany({
          where: { id: { in: requestedShiftTypeIds }, unitId: task.unitId ?? "__none__", active: true },
          select: { id: true, name: true, category: true, isNight: true, active: true }
        })
      : [];
    const validShiftTypeIds = new Set(validShiftTypes.map((item) => item.id));
    const rangeDays = getDateRangeDates((task as any).startDate ?? task.weekStartDate, (task as any).endDate ?? task.weekEndDate);
    const weekdayByDate = new Map(rangeDays.map((day) => [day.dateKey, day.weekday]));
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
      source?: string;
      sourceWeekday?: number | null;
    }> = [];

    const templateData = weeklyTemplates
      .map((record) => {
        const weekday = Math.max(1, Math.min(7, Math.floor(Number(record.weekday ?? 0))));
        const shiftTypeId = String(record.shiftTypeId ?? "");
        const requiredDoctors = Math.max(0, Math.min(50, Math.floor(Number(record.requiredDoctors ?? 0))));
        if (!weekday || !validShiftTypeIds.has(shiftTypeId)) return null;
        return {
          scheduleTaskId: task.id,
          weekday,
          shiftTypeId,
          enabled: record.enabled !== false,
          requiredDoctors
        };
      })
      .filter(Boolean) as Array<{ scheduleTaskId: string; weekday: number; shiftTypeId: string; enabled: boolean; requiredDoctors: number }>;

    const overrideData = dateOverrides
      .map((record) => {
        const date = String(record.date ?? "").slice(0, 10);
        const shiftTypeId = String(record.shiftTypeId ?? "");
        const requiredDoctors = Math.max(0, Math.min(50, Math.floor(Number(record.requiredDoctors ?? 0))));
        if (!weekdayByDate.has(date) || !validShiftTypeIds.has(shiftTypeId)) return null;
        return {
          scheduleTaskId: task.id,
          date: dateFromKey(date),
          shiftTypeId,
          dateType: normalizeSpecialDateType(record.dateType),
          note: nullableString(record.note),
          overrideEnabled: Boolean(record.overrideEnabled),
          enabled: record.enabled !== false,
          requiredDoctors
        };
      })
      .filter(Boolean) as Array<{
        scheduleTaskId: string;
        date: Date;
        shiftTypeId: string;
        dateType: string | null;
        note: string | null;
        overrideEnabled: boolean;
        enabled: boolean;
        requiredDoctors: number;
      }>;

    if (usesWardTemplatePayload && taskScheduleMode === TASK_SCHEDULE_MODE.WARD_SHIFT) {
      data.push(
        ...expandWardRequirements({
          taskId: task.id,
          departmentId: task.departmentId,
          startDate: (task as any).startDate ?? task.weekStartDate,
          endDate: (task as any).endDate ?? task.weekEndDate,
          shiftTypes: validShiftTypes,
          weeklyTemplates: templateData,
          dateOverrides: overrideData.map((item) => ({
            ...item,
            date: toDateKey(item.date)
          }))
        })
      );
    }

    if (!usesWardTemplatePayload) for (const record of records) {
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
        requiredDoctors,
        source: "MANUAL",
        sourceWeekday: null
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.scheduleRequirement.deleteMany({ where: { scheduleTaskId: task.id } });
      await tx.scheduleAssignment.deleteMany({ where: { scheduleTaskId: task.id } });
      await tx.scheduleConflict.deleteMany({ where: { scheduleTaskId: task.id } });
      if (usesWardTemplatePayload && taskScheduleMode === TASK_SCHEDULE_MODE.WARD_SHIFT) {
        await tx.scheduleWeeklyTemplate.deleteMany({ where: { scheduleTaskId: task.id } });
        await tx.scheduleDateOverride.deleteMany({ where: { scheduleTaskId: task.id } });
        if (templateData.length) await tx.scheduleWeeklyTemplate.createMany({ data: templateData });
        if (overrideData.length) await tx.scheduleDateOverride.createMany({ data: overrideData });
        const specialDates = new Map<string, { dateType: string; name: string | null; note: string | null }>();
        for (const item of overrideData) {
          if (!item.dateType) continue;
          specialDates.set(toDateKey(item.date), {
            dateType: item.dateType,
            name: dateTypeLabel(item.dateType),
            note: item.note
          });
        }
        if (task.unitId) {
          for (const [dateKey, item] of specialDates) {
            await tx.specialDate.deleteMany({ where: { unitId: task.unitId, date: dateFromKey(dateKey), dateType: { not: item.dateType } } });
            await tx.specialDate.upsert({
              where: { unitId_date_dateType: { unitId: task.unitId, date: dateFromKey(dateKey), dateType: item.dateType } },
              update: { hospitalId: task.hospitalId, departmentId: task.departmentId, name: item.name, note: item.note },
              create: { hospitalId: task.hospitalId, departmentId: task.departmentId, unitId: task.unitId, date: dateFromKey(dateKey), dateType: item.dateType, name: item.name, note: item.note }
            });
          }
        }
      }
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
      afterJson: {
        requirementCount: data.length,
        weeklyTemplateCount: templateData.length,
        dateOverrideCount: overrideData.filter((item) => item.overrideEnabled).length
      },
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

function nullableString(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function dateTypeLabel(value: string) {
  if (value === "PUBLIC_HOLIDAY") return "法定节假日";
  if (value === "MAKEUP_WORKDAY") return "调休上班";
  if (value === "CUSTOM_REST_DAY") return "自定义休息";
  if (value === "CUSTOM_SPECIAL_DAY") return "特殊日期";
  return null;
}
