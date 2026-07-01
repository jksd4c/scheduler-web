export const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

export type WeekdayNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function toDateKey(value: Date | string) {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

export function toLocalDateKey(value: Date) {
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
}

export function dateFromKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function addDays(date: Date | string, days: number) {
  const start = typeof date === "string" ? dateFromKey(date) : new Date(date);
  const next = new Date(start);
  next.setUTCDate(start.getUTCDate() + days);
  return next;
}

export function getWeekdayLabel(weekday: number) {
  return WEEKDAY_LABELS[Math.max(1, Math.min(7, weekday)) - 1];
}

export function getWeekDates(weekStartDate: Date | string) {
  const startKey = toDateKey(weekStartDate);
  return WEEKDAY_LABELS.map((label, index) => {
    const date = addDays(startKey, index);
    return {
      date,
      dateKey: toDateKey(date),
      weekday: (index + 1) as WeekdayNumber,
      label
    };
  });
}

export function getNextMonday(reference = new Date()) {
  const local = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const jsDay = local.getDay();
  const daysUntilNextMonday = jsDay === 1 ? 7 : (8 - jsDay) % 7 || 7;
  local.setDate(local.getDate() + daysUntilNextMonday);
  return toLocalDateKey(local);
}

export function getWeekEndDateKey(weekStartDateKey: string) {
  return toDateKey(addDays(weekStartDateKey, 6));
}
