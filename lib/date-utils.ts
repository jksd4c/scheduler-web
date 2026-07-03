export const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

export type WeekdayNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type PeriodType = "DAYS_7" | "DAYS_30" | "CALENDAR_MONTH" | "QUARTER" | "YEAR" | "CUSTOM";

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

export function getTodayDateKey(reference = new Date()) {
  return toLocalDateKey(new Date(reference.getFullYear(), reference.getMonth(), reference.getDate()));
}

export function getWeekdayNumber(date: Date | string): WeekdayNumber {
  const value = typeof date === "string" ? dateFromKey(date) : date;
  const jsDay = value.getUTCDay();
  return (jsDay === 0 ? 7 : jsDay) as WeekdayNumber;
}

export function getWeekdayLabel(weekday: number) {
  return WEEKDAY_LABELS[Math.max(1, Math.min(7, weekday)) - 1];
}

export function getWeekDates(weekStartDate: Date | string) {
  return getDateRangeDates(weekStartDate, addDays(weekStartDate, 6));
}

export function getDateRangeDates(startDate: Date | string, endDate: Date | string) {
  const startKey = toDateKey(startDate);
  const endKey = toDateKey(endDate);
  const days: Array<{ date: Date; dateKey: string; weekday: WeekdayNumber; label: string; isWeekend: boolean; monthKey: string }> = [];
  let current = dateFromKey(startKey);
  const end = dateFromKey(endKey);
  while (current.getTime() <= end.getTime()) {
    const dateKey = toDateKey(current);
    const weekday = getWeekdayNumber(current);
    days.push({
      date: new Date(current),
      dateKey,
      weekday,
      label: getWeekdayLabel(weekday),
      isWeekend: weekday === 6 || weekday === 7,
      monthKey: dateKey.slice(0, 7)
    });
    current = addDays(current, 1);
  }
  return days;
}

export function getDateRangeKeys(startDate: Date | string, endDate: Date | string) {
  return getDateRangeDates(startDate, endDate).map((day) => day.dateKey);
}

export function getDateRangeDayCount(startDate: Date | string, endDate: Date | string) {
  return getDateRangeDates(startDate, endDate).length;
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

export function getMonthEndDateKey(year: number, month: number) {
  return toDateKey(new Date(Date.UTC(year, month, 0)));
}

export function getPeriodRange(periodType: PeriodType, startDateKey: string, options?: { year?: number; month?: number; quarter?: number; endDate?: string }) {
  const start = startDateKey || getTodayDateKey();
  if (periodType === "DAYS_7") return { startDate: start, endDate: toDateKey(addDays(start, 6)) };
  if (periodType === "DAYS_30") return { startDate: start, endDate: toDateKey(addDays(start, 29)) };
  if (periodType === "CALENDAR_MONTH") {
    const year = options?.year ?? Number(start.slice(0, 4));
    const month = options?.month ?? Number(start.slice(5, 7));
    const monthStart = `${year}-${pad2(month)}-01`;
    return { startDate: monthStart, endDate: getMonthEndDateKey(year, month) };
  }
  if (periodType === "QUARTER") {
    const year = options?.year ?? Number(start.slice(0, 4));
    const quarter = Math.max(1, Math.min(4, options?.quarter ?? Math.floor((Number(start.slice(5, 7)) - 1) / 3) + 1));
    const firstMonth = (quarter - 1) * 3 + 1;
    return { startDate: `${year}-${pad2(firstMonth)}-01`, endDate: getMonthEndDateKey(year, firstMonth + 2) };
  }
  if (periodType === "YEAR") {
    const year = options?.year ?? Number(start.slice(0, 4));
    return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  }
  return { startDate: start, endDate: options?.endDate || start };
}
