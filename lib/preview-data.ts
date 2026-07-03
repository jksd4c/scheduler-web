import { isDoctorUnavailable } from "@/lib/availability";
import { addDays, dateFromKey, getWeekdayLabel, toDateKey } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import {
  SLOT_LABELS,
  TASK_SCHEDULE_MODE,
  TIME_SLOT,
  asTaskScheduleMode,
  asTimeSlot,
  requirementsToCells,
  type RequiredScheduleCell,
  type TimeSlotValue
} from "@/lib/schedule-rules";
import { parseEffectivePolicy, parseTagSnapshot, STAFF_SCHEDULING_MODE, SHIFT_TAG_REQUIREMENT, SHIFT_TYPE_CATEGORY } from "@/lib/staff-policy";
import { getTaskDetail } from "@/lib/tasks";

const GLOBAL_MAX_CONSECUTIVE_WORK_DAYS = 5;

export type PreviewCandidate = {
  doctorId: string;
  name: string;
  compliant: boolean;
  reasons: string[];
};

export async function getSchedulePreviewData(taskId: string) {
  const task = await getTaskDetail(taskId);
  if (!task) return null;
  const effectiveUnavailableTimes = [...task.unavailableTimes, ...(await getEffectiveFeedbackUnavailableTimes(task.id, task.doctors))];
  const cells = requirementsToCells(task.requirements);
  const scheduleMode = asTaskScheduleMode(task.scheduleMode);
  const startDate = (task as any).startDate ?? task.weekStartDate;
  const endDate = (task as any).endDate ?? task.weekEndDate;
  const dateKeys = getDateRangeKeys(startDate, endDate);
  const specialDates = await prisma.specialDate.findMany({
    where: {
      date: { gte: dateFromKey(toDateKey(startDate)), lte: dateFromKey(toDateKey(endDate)) },
      OR: [
        { unitId: task.unitId },
        { unitId: null, departmentId: task.departmentId },
        { unitId: null, departmentId: null, hospitalId: task.hospitalId }
      ]
    },
    orderBy: [{ date: "asc" }, { createdAt: "desc" }]
  });
  const specialDateByKey = buildSpecialDateMap(specialDates);
  const cellsByDate = new Map<string, any[]>();
  const conflictsByCell = new Map<string, any[]>();
  const conflictsByDate = new Map<string, any[]>();

  for (const conflict of task.conflicts) {
    const dateKey = toDateKey(conflict.date);
    const key = cellKey(dateKey, asTimeSlot(conflict.timeSlot), conflict.roomNumber);
    conflictsByCell.set(key, [...(conflictsByCell.get(key) ?? []), conflict]);
    conflictsByDate.set(dateKey, [...(conflictsByDate.get(dateKey) ?? []), conflict]);
  }

  for (const cell of cells) {
    const key = cellKey(cell.dateKey, cell.timeSlot, cell.roomNumber);
    const assignments = task.assignments.filter(
      (assignment) => toDateKey(assignment.date) === cell.dateKey && asTimeSlot(assignment.timeSlot) === cell.timeSlot && assignment.roomNumber === cell.roomNumber
    );
    const item = {
      key,
      dateKey: cell.dateKey,
      weekday: cell.weekday,
      timeSlot: cell.timeSlot,
      timeSlotLabel: SLOT_LABELS[cell.timeSlot],
      roomNumber: cell.roomNumber,
      shiftTypeId: cell.shiftTypeId ?? null,
      label: requirementLabel(cell, scheduleMode),
      requiredDoctors: cell.requiredDoctors,
      assignments,
      locked: assignments.some((assignment) => assignment.locked),
      manualOverride: assignments.some((assignment) => assignment.manualOverride),
      conflicts: conflictsByCell.get(key) ?? [],
      candidates: buildCandidates({ task, cell, currentAssignments: assignments, effectiveUnavailableTimes })
    };
    cellsByDate.set(cell.dateKey, [...(cellsByDate.get(cell.dateKey) ?? []), item]);
  }

  const calendarDays = dateKeys.map((dateKey) => {
    const weekday = weekdayFromDateKey(dateKey);
    const specialDate = specialDateByKey.get(dateKey);
    const dateType = normalizeDateType(specialDate?.dateType) ?? dateTypeForWeekday(weekday);
    return {
      dateKey,
      weekday,
      weekdayLabel: getWeekdayLabel(weekday),
      dateType,
      dateTypeLabel: specialDate?.name || dateTypeLabel(dateType),
      cells: cellsByDate.get(dateKey) ?? [],
      conflicts: conflictsByDate.get(dateKey) ?? []
    };
  });

  const manualOverrideCount = task.assignments.filter((assignment) => assignment.manualOverride).length;
  const summary = {
    expectedAssignments: task.stats.overall.expectedAssignments,
    actualAssignments: task.stats.overall.actualAssignments,
    unfilledAssignments: task.stats.overall.unfilledAssignments,
    conflictCount: task.conflicts.length,
    manualOverrideCount
  };

  return { task, calendarDays, summary };
}

export function cellKey(dateKey: string, timeSlot: TimeSlotValue, roomNumber: number) {
  return `${dateKey}:${timeSlot}:${roomNumber}`;
}

export function requirementLabel(cell: Pick<RequiredScheduleCell, "roomNumber" | "shiftType" | "shiftTypeId">, scheduleMode: string) {
  return scheduleMode === TASK_SCHEDULE_MODE.MEDTECH_ROOM
    ? `单元${cell.roomNumber}`
    : cell.shiftType?.name || `班次${cell.roomNumber}`;
}

export async function getEffectiveFeedbackUnavailableTimes(taskId: string, doctors: Array<{ id: string; staffProfileId?: string | null }>) {
  const feedback = await prisma.memberFeedback.findMany({
    where: { scheduleTaskId: taskId, effective: true, status: { not: "REJECTED" } },
    include: { unavailableTimes: true }
  });
  if (!feedback.length) return [];
  const rosterIds = Array.from(new Set(feedback.map((item) => item.rosterEntryId).filter(Boolean))) as string[];
  const rosterEntries = rosterIds.length
    ? await prisma.rosterEntry.findMany({ where: { id: { in: rosterIds }, status: "CONFIRMED", includeInScheduling: true } })
    : [];
  const rosterById = new Map(rosterEntries.map((item) => [item.id, item]));
  const doctorByStaffProfileId = new Map(doctors.filter((doctor) => doctor.staffProfileId).map((doctor) => [doctor.staffProfileId!, doctor]));
  const output: Array<{ doctorId: string; date: Date; timeSlot: string; reason?: string | null }> = [];
  for (const item of feedback) {
    const roster = item.rosterEntryId ? rosterById.get(item.rosterEntryId) : null;
    if (!roster?.staffProfileId) continue;
    const doctor = doctorByStaffProfileId.get(roster.staffProfileId);
    if (!doctor) continue;
    for (const unavailable of item.unavailableTimes) {
      output.push({ doctorId: doctor.id, date: unavailable.date, timeSlot: unavailable.timeSlot, reason: unavailable.reason });
    }
  }
  return output;
}

function buildCandidates(input: {
  task: any;
  cell: RequiredScheduleCell;
  currentAssignments: any[];
  effectiveUnavailableTimes: Array<{ doctorId: string; date: Date | string; timeSlot: string }>;
}): PreviewCandidate[] {
  const currentDoctorIds = new Set(input.currentAssignments.map((assignment) => assignment.doctorId));
  return input.task.doctors
    .map((doctor: any) => {
      const reasons = candidateReasons({ ...input, doctor, currentDoctorIds });
      return { doctorId: doctor.id, name: doctor.name, compliant: reasons.length === 0, reasons };
    })
    .sort((a: PreviewCandidate, b: PreviewCandidate) => {
      if (a.compliant !== b.compliant) return a.compliant ? -1 : 1;
      return a.name.localeCompare(b.name, "zh-Hans-CN");
    });
}

export function candidateReasons(input: {
  task: any;
  doctor: any;
  cell: RequiredScheduleCell;
  currentDoctorIds?: Set<string>;
  effectiveUnavailableTimes: Array<{ doctorId: string; date: Date | string; timeSlot: string }>;
}) {
  const reasons: string[] = [];
  const { doctor, cell, task } = input;
  const currentDoctorIds = input.currentDoctorIds ?? new Set<string>();
  if (doctor.active === false) reasons.push("人员未启用");

  const duplicate = task.assignments.find(
    (assignment: any) =>
      assignment.doctorId === doctor.id &&
      !isSameCellAssignment(assignment, cell) &&
      toDateKey(assignment.date) === cell.dateKey &&
      asTimeSlot(assignment.timeSlot) === cell.timeSlot
  );
  if (duplicate) reasons.push("同一时间已在其他单元/班次");

  if (isDoctorUnavailable(input.effectiveUnavailableTimes, doctor.id, cell.date, cell.timeSlot)) {
    reasons.push("该时间存在硬性不可排");
  }

  const tagIds = new Set(parseTagSnapshot(doctor.tagSnapshotJson).map((tag) => tag.id));
  const policy = parseEffectivePolicy(doctor.policySnapshotJson);
  if (!policy.participatesInScheduling || policy.schedulingMode === STAFF_SCHEDULING_MODE.EXCLUDED) {
    reasons.push("身份策略不参与自动排班");
  }

  const rules = cell.shiftType?.requiredTags ?? [];
  for (const rule of rules.filter((item) => item.requirementType === SHIFT_TAG_REQUIREMENT.FORBIDDEN)) {
    if (tagIds.has(rule.staffTagId)) reasons.push(`拥有禁排身份：${rule.staffTag?.name ?? "未命名身份"}`);
  }
  for (const rule of rules.filter((item) => item.requirementType === SHIFT_TAG_REQUIREMENT.REQUIRED)) {
    if (!tagIds.has(rule.staffTagId)) reasons.push(`缺少必需身份：${rule.staffTag?.name ?? "未命名身份"}`);
  }
  const allowed = rules.filter((item) => item.requirementType === SHIFT_TAG_REQUIREMENT.ALLOWED);
  if (allowed.length && !allowed.some((rule) => tagIds.has(rule.staffTagId))) reasons.push("不在允许身份范围内");

  const doctorAssignments = task.assignments.filter((assignment: any) => assignment.doctorId === doctor.id && !isSameCellAssignment(assignment, cell));
  const totalAfter = doctorAssignments.length + (currentDoctorIds.has(doctor.id) ? 0 : 1);
  if (policy.schedulingMode === STAFF_SCHEDULING_MODE.FIXED_TARGET && policy.targetShiftsPerPeriod != null && totalAfter > policy.targetShiftsPerPeriod) {
    reasons.push(`超过身份目标班次：${policy.targetShiftsPerPeriod}`);
  }
  if (policy.maxShiftsPerPeriod != null && totalAfter > policy.maxShiftsPerPeriod) {
    reasons.push(`超过身份最大班次：${policy.maxShiftsPerPeriod}`);
  }

  const category = cell.shiftType?.category ?? "";
  const isNightShift = Boolean(cell.shiftType?.isNight) || category === SHIFT_TYPE_CATEGORY.NIGHT;
  const previousDateKey = toDateKey(addDays(cell.dateKey, -1));
  const previousNight = task.assignments.some((assignment: any) => {
    if (assignment.doctorId !== doctor.id || toDateKey(assignment.date) !== previousDateKey) return false;
    const requirement = task.requirements.find(
      (item: any) =>
        toDateKey(item.date) === previousDateKey &&
        asTimeSlot(item.timeSlot) === asTimeSlot(assignment.timeSlot) &&
        item.roomNumber === assignment.roomNumber
    );
    const previousCategory = requirement?.shiftType?.category ?? "";
    return Boolean(requirement?.shiftType?.isNight) || previousCategory === SHIFT_TYPE_CATEGORY.NIGHT;
  });
  if (isNightShift && previousNight) reasons.push("连续夜班冲突");
  if (!isNightShift && previousNight) reasons.push("夜班后白班/日班冲突");

  if (wouldExceedConsecutiveLimit(new Set(doctorAssignments.map((assignment: any) => toDateKey(assignment.date))), cell.dateKey, GLOBAL_MAX_CONSECUTIVE_WORK_DAYS)) {
    reasons.push(`连续上班超过 ${GLOBAL_MAX_CONSECUTIVE_WORK_DAYS} 天`);
  }

  return Array.from(new Set(reasons));
}

function isSameCellAssignment(assignment: any, cell: RequiredScheduleCell) {
  return toDateKey(assignment.date) === cell.dateKey && asTimeSlot(assignment.timeSlot) === cell.timeSlot && assignment.roomNumber === cell.roomNumber;
}

function wouldExceedConsecutiveLimit(workedDates: Set<string>, dateKey: string, maxDays: number) {
  if (workedDates.has(dateKey)) return false;
  const dates = new Set(workedDates);
  dates.add(dateKey);
  let current = 0;
  let max = 0;
  for (let offset = -14; offset <= 14; offset += 1) {
    const key = toDateKey(addDays(dateKey, offset));
    if (dates.has(key)) {
      current += 1;
      max = Math.max(max, current);
    } else {
      current = 0;
    }
  }
  return max > maxDays;
}

function getDateRangeKeys(start: Date | string, end: Date | string) {
  const keys: string[] = [];
  let current = toDateKey(start);
  const endKey = toDateKey(end);
  while (current <= endKey && keys.length < 370) {
    keys.push(current);
    current = toDateKey(addDays(current, 1));
  }
  return keys;
}

function weekdayFromDateKey(dateKey: string) {
  const jsDay = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return (jsDay === 0 ? 7 : jsDay) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

function dateTypeForWeekday(weekday: number) {
  return weekday === 6 || weekday === 7 ? "WEEKEND" : "WORKDAY";
}

function normalizeDateType(value?: string | null) {
  if (!value) return null;
  if (value === "HOLIDAY") return "PUBLIC_HOLIDAY";
  if (value === "CUSTOM_REST") return "CUSTOM_REST_DAY";
  if (value === "CUSTOM_SPECIAL") return "CUSTOM_SPECIAL_DAY";
  if (
    value === "WORKDAY" ||
    value === "WEEKEND" ||
    value === "PUBLIC_HOLIDAY" ||
    value === "MAKEUP_WORKDAY" ||
    value === "CUSTOM_REST_DAY" ||
    value === "CUSTOM_SPECIAL_DAY"
  ) {
    return value;
  }
  return null;
}

function dateTypeLabel(value: string) {
  if (value === "WEEKEND") return "周末";
  if (value === "HOLIDAY" || value === "PUBLIC_HOLIDAY") return "法定节假日";
  if (value === "MAKEUP_WORKDAY") return "调休上班";
  if (value === "CUSTOM_REST" || value === "CUSTOM_REST_DAY") return "自定义休息";
  if (value === "CUSTOM_SPECIAL" || value === "CUSTOM_SPECIAL_DAY") return "特殊日期";
  return "工作日";
}

function buildSpecialDateMap<T extends { date: Date; dateType: string }>(items: T[]) {
  const output = new Map<string, T>();
  for (const item of items) {
    const key = toDateKey(item.date);
    const current = output.get(key);
    if (!current || specialDatePriority(item.dateType) > specialDatePriority(current.dateType)) {
      output.set(key, item);
    }
  }
  return output;
}

function specialDatePriority(type: string) {
  if (type === "MAKEUP_WORKDAY") return 40;
  if (type === "PUBLIC_HOLIDAY" || type === "HOLIDAY") return 30;
  if (type === "CUSTOM_REST_DAY" || type === "CUSTOM_REST") return 20;
  if (type === "CUSTOM_SPECIAL_DAY" || type === "CUSTOM_SPECIAL") return 10;
  return 0;
}
