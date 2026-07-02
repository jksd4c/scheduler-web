import { toDateKey, type WeekdayNumber } from "@/lib/date-utils";

export type ScheduleModeValue = "FULL_DAY" | "HALF_DAY";
export type ScheduleStatusValue = "DRAFT" | "RULES_SET" | "GENERATED" | "PUBLISHED" | "LOCKED";
export type DoctorTypeValue = "RESIDENT" | "INTERN";
export type TimeSlotValue = "FULL_DAY" | "MORNING" | "AFTERNOON";
export type ConflictSeverityValue = "INFO" | "WARNING" | "ERROR";

export const SCHEDULE_MODE = {
  FULL_DAY: "FULL_DAY",
  HALF_DAY: "HALF_DAY"
} as const;

export const SCHEDULE_STATUS = {
  DRAFT: "DRAFT",
  RULES_SET: "RULES_SET",
  GENERATED: "GENERATED",
  PUBLISHED: "PUBLISHED",
  LOCKED: "LOCKED"
} as const;

export const DOCTOR_TYPE = {
  RESIDENT: "RESIDENT",
  INTERN: "INTERN"
} as const;

export const TIME_SLOT = {
  FULL_DAY: "FULL_DAY",
  MORNING: "MORNING",
  AFTERNOON: "AFTERNOON"
} as const;

export const CONFLICT_SEVERITY = {
  INFO: "INFO",
  WARNING: "WARNING",
  ERROR: "ERROR"
} as const;

export const SLOT_LABELS: Record<TimeSlotValue, string> = {
  FULL_DAY: "\u5168\u5929",
  MORNING: "\u4e0a\u5348",
  AFTERNOON: "\u4e0b\u5348"
};

export const MODE_LABELS: Record<ScheduleModeValue, string> = {
  FULL_DAY: "\u5168\u5929\u73ed",
  HALF_DAY: "\u534a\u5929\u73ed"
};

export const STATUS_LABELS: Record<ScheduleStatusValue, string> = {
  DRAFT: "\u8349\u7a3f",
  RULES_SET: "\u5df2\u8bbe\u7f6e\u89c4\u5219",
  GENERATED: "\u5df2\u751f\u6210",
  PUBLISHED: "\u5df2\u53d1\u5e03",
  LOCKED: "\u5df2\u9501\u5b9a"
};

export type ScheduleRequirementLike = {
  id?: string;
  scheduleTaskId?: string;
  date: Date | string;
  weekday: number;
  timeSlot: string;
  shiftTypeId?: string | null;
  shiftType?: {
    id: string;
    name: string;
    category: string;
    isNight: boolean;
    workloadWeight: number;
    requiredTags?: Array<{
      requirementType: string;
      staffTagId: string;
      staffTag?: {
        id: string;
        name: string;
      } | null;
    }>;
  } | null;
  enabled: boolean;
  roomNumber: number;
  requiredDoctors: number;
};

export type RequiredScheduleCell = {
  date: Date;
  dateKey: string;
  weekday: WeekdayNumber;
  roomNumber: number;
  timeSlot: TimeSlotValue;
  shiftTypeId?: string | null;
  shiftType?: ScheduleRequirementLike["shiftType"];
  requiredDoctors: number;
};

export const MAX_ROOMS_PER_SLOT = 20;
export const MAX_DOCTORS_PER_ROOM = 5;

export function asScheduleMode(value: string): ScheduleModeValue {
  return value === SCHEDULE_MODE.HALF_DAY ? SCHEDULE_MODE.HALF_DAY : SCHEDULE_MODE.FULL_DAY;
}

export function asScheduleStatus(value: string): ScheduleStatusValue {
  if (
    value === SCHEDULE_STATUS.RULES_SET ||
    value === SCHEDULE_STATUS.GENERATED ||
    value === SCHEDULE_STATUS.PUBLISHED ||
    value === SCHEDULE_STATUS.LOCKED
  ) {
    return value;
  }
  return SCHEDULE_STATUS.DRAFT;
}

export function asDoctorType(value: string): DoctorTypeValue {
  return value === DOCTOR_TYPE.INTERN ? DOCTOR_TYPE.INTERN : DOCTOR_TYPE.RESIDENT;
}

export function asTimeSlot(value: string): TimeSlotValue {
  if (value === TIME_SLOT.MORNING || value === TIME_SLOT.AFTERNOON) {
    return value;
  }
  return TIME_SLOT.FULL_DAY;
}

export function asConflictSeverity(value: string): ConflictSeverityValue {
  if (value === CONFLICT_SEVERITY.INFO || value === CONFLICT_SEVERITY.ERROR) {
    return value;
  }
  return CONFLICT_SEVERITY.WARNING;
}

export function clampRoomCount(value: number) {
  return Math.max(0, Math.min(MAX_ROOMS_PER_SLOT, Math.floor(Number.isFinite(value) ? value : 0)));
}

export function clampRequiredDoctors(value: number) {
  return Math.max(1, Math.min(MAX_DOCTORS_PER_ROOM, Math.floor(Number.isFinite(value) ? value : 1)));
}

export function getTimeSlotsForMode(mode: ScheduleModeValue): TimeSlotValue[] {
  return mode === SCHEDULE_MODE.FULL_DAY
    ? [TIME_SLOT.FULL_DAY]
    : [TIME_SLOT.MORNING, TIME_SLOT.AFTERNOON];
}

export function buildDefaultRequirements(mode: ScheduleModeValue, weekStartDate: Date | string, scheduleTaskId?: string) {
  const _unused = { mode, weekStartDate, scheduleTaskId };
  void _unused;
  return [] as Array<{
    scheduleTaskId?: string;
    date: Date;
    weekday: WeekdayNumber;
    timeSlot: TimeSlotValue;
    enabled: boolean;
    roomNumber: number;
    requiredDoctors: number;
  }>;
}

export function requirementsToCells(requirements: ScheduleRequirementLike[]): RequiredScheduleCell[] {
  return requirements
    .filter((item) => item.enabled && item.requiredDoctors > 0 && item.roomNumber > 0)
    .map((item) => ({
      date: typeof item.date === "string" ? new Date(item.date) : item.date,
      dateKey: toDateKey(item.date),
      weekday: Math.max(1, Math.min(7, item.weekday)) as WeekdayNumber,
      roomNumber: item.roomNumber,
      timeSlot: asTimeSlot(item.timeSlot),
      shiftTypeId: item.shiftTypeId ?? null,
      shiftType: item.shiftType ?? null,
      requiredDoctors: item.requiredDoctors
    }))
    .sort((a, b) => {
      if (a.dateKey !== b.dateKey) {
        return a.dateKey.localeCompare(b.dateKey);
      }
      const slotOrder: Record<TimeSlotValue, number> = { FULL_DAY: 0, MORNING: 1, AFTERNOON: 2 };
      if (a.timeSlot !== b.timeSlot) {
        return slotOrder[a.timeSlot] - slotOrder[b.timeSlot];
      }
      return a.roomNumber - b.roomNumber;
    });
}

export function getExpectedAssignmentCountFromRequirements(requirements: ScheduleRequirementLike[]) {
  return requirementsToCells(requirements).reduce((sum, item) => sum + item.requiredDoctors, 0);
}

export function getMaxRoomNumberFromRequirements(requirements: ScheduleRequirementLike[]) {
  return requirementsToCells(requirements).reduce((max, item) => Math.max(max, item.roomNumber), 0);
}

export function hasEnabledRequirements(requirements: ScheduleRequirementLike[]) {
  return getExpectedAssignmentCountFromRequirements(requirements) > 0;
}

export function isWeekend(weekday: number) {
  return weekday === 6 || weekday === 7;
}

export function isPeakDay(weekday: number) {
  return weekday === 1 || weekday === 2;
}
