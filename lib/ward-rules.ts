import { dateFromKey, getDateRangeDates, toDateKey, type WeekdayNumber } from "@/lib/date-utils";
import { TIME_SLOT, type TimeSlotValue } from "@/lib/schedule-rules";

export const REQUIREMENT_SOURCE = {
  MANUAL: "MANUAL",
  WEEKLY_TEMPLATE: "WEEKLY_TEMPLATE",
  DATE_OVERRIDE: "DATE_OVERRIDE"
} as const;

export const SPECIAL_DATE_TYPES = {
  PUBLIC_HOLIDAY: "PUBLIC_HOLIDAY",
  MAKEUP_WORKDAY: "MAKEUP_WORKDAY",
  CUSTOM_REST_DAY: "CUSTOM_REST_DAY",
  CUSTOM_SPECIAL_DAY: "CUSTOM_SPECIAL_DAY"
} as const;

export type WardShiftType = {
  id: string;
  name: string;
  category: string;
  isNight: boolean;
  active?: boolean;
};

export type WeeklyTemplateRule = {
  weekday: number;
  shiftTypeId: string;
  enabled?: boolean;
  requiredDoctors: number;
};

export type DateOverrideRule = {
  date: string;
  shiftTypeId: string;
  dateType?: string | null;
  note?: string | null;
  overrideEnabled?: boolean;
  enabled?: boolean;
  requiredDoctors: number;
};

export type ExpandedWardRequirement = {
  departmentId: string;
  scheduleTaskId: string;
  date: Date;
  weekday: number;
  timeSlot: TimeSlotValue;
  shiftTypeId: string;
  enabled: boolean;
  roomNumber: number;
  requiredDoctors: number;
  source: string;
  sourceWeekday?: number | null;
};

export function normalizeSpecialDateType(value: unknown) {
  const text = String(value ?? "").trim().toUpperCase();
  if (
    text === SPECIAL_DATE_TYPES.PUBLIC_HOLIDAY ||
    text === SPECIAL_DATE_TYPES.MAKEUP_WORKDAY ||
    text === SPECIAL_DATE_TYPES.CUSTOM_REST_DAY ||
    text === SPECIAL_DATE_TYPES.CUSTOM_SPECIAL_DAY
  ) {
    return text;
  }
  return null;
}

export function isDayShiftType(shiftType: WardShiftType) {
  const category = shiftType.category.toUpperCase();
  return !shiftType.isNight && (category === "DAY" || shiftType.name.includes("白班") || shiftType.name.toLowerCase().includes("day"));
}

export function isNightShiftType(shiftType: WardShiftType) {
  const category = shiftType.category.toUpperCase();
  return shiftType.isNight || category === "NIGHT" || shiftType.name.includes("夜班") || shiftType.name.toLowerCase().includes("night");
}

export function sortWardShiftTypes(shiftTypes: WardShiftType[]) {
  return [...shiftTypes].sort((a, b) => {
    const rank = (item: WardShiftType) => (isDayShiftType(item) ? 0 : isNightShiftType(item) ? 1 : 2);
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });
}

export function defaultWeeklyCount(weekday: number, shiftType: WardShiftType) {
  if (isNightShiftType(shiftType)) return 1;
  if (isDayShiftType(shiftType)) return weekday <= 5 ? 4 : 2;
  return 0;
}

export function expandWardRequirements(input: {
  taskId: string;
  departmentId: string;
  startDate: Date | string;
  endDate: Date | string;
  shiftTypes: WardShiftType[];
  weeklyTemplates: WeeklyTemplateRule[];
  dateOverrides: DateOverrideRule[];
}) {
  const shiftTypes = sortWardShiftTypes(input.shiftTypes.filter((item) => item.active !== false));
  const hasTemplateRows = input.weeklyTemplates.length > 0;
  const weeklyMap = new Map<string, WeeklyTemplateRule>();
  for (const item of input.weeklyTemplates) {
    weeklyMap.set(`${item.weekday}:${item.shiftTypeId}`, item);
  }

  const overrideByDate = new Map<string, Map<string, DateOverrideRule>>();
  for (const item of input.dateOverrides) {
    if (!item.overrideEnabled) continue;
    const dateKey = toDateKey(item.date);
    if (!overrideByDate.has(dateKey)) overrideByDate.set(dateKey, new Map());
    overrideByDate.get(dateKey)!.set(item.shiftTypeId, item);
  }

  const requirements: ExpandedWardRequirement[] = [];
  for (const day of getDateRangeDates(input.startDate, input.endDate)) {
    const overrideMap = overrideByDate.get(day.dateKey);
    shiftTypes.forEach((shiftType, index) => {
      const override = overrideMap?.get(shiftType.id);
      const source = overrideMap ? REQUIREMENT_SOURCE.DATE_OVERRIDE : REQUIREMENT_SOURCE.WEEKLY_TEMPLATE;
      const template = weeklyMap.get(`${day.weekday}:${shiftType.id}`);
      const rawCount = overrideMap
        ? Number(override?.requiredDoctors ?? 0)
        : hasTemplateRows
          ? Number(template?.requiredDoctors ?? 0)
          : defaultWeeklyCount(day.weekday, shiftType);
      const requiredDoctors = Math.max(0, Math.min(50, Math.floor(Number.isFinite(rawCount) ? rawCount : 0)));
      const enabled = overrideMap
        ? Boolean(override?.enabled ?? requiredDoctors > 0)
        : Boolean(template?.enabled ?? requiredDoctors > 0);
      if (!enabled || requiredDoctors <= 0) return;
      requirements.push({
        departmentId: input.departmentId,
        scheduleTaskId: input.taskId,
        date: dateFromKey(day.dateKey),
        weekday: day.weekday,
        timeSlot: TIME_SLOT.FULL_DAY,
        shiftTypeId: shiftType.id,
        enabled: true,
        roomNumber: index + 1,
        requiredDoctors,
        source,
        sourceWeekday: source === REQUIREMENT_SOURCE.WEEKLY_TEMPLATE ? (day.weekday as WeekdayNumber) : null
      });
    });
  }
  return requirements;
}
