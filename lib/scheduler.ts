import type { ScheduleDoctor } from "@prisma/client";
import { isDoctorUnavailable } from "@/lib/availability";
import { addDays, dateFromKey, getWeekdayLabel, toDateKey } from "@/lib/date-utils";
import { preferenceStrengthWeight, normalizePreferredShiftType, PREFERRED_SHIFT_TYPE } from "@/lib/preferences";
import { prisma } from "@/lib/prisma";
import {
  CONFLICT_SEVERITY,
  asScheduleMode,
  asTimeSlot,
  isWeekend,
  requirementsToCells,
  SCHEDULE_MODE,
  SCHEDULE_STATUS,
  SLOT_LABELS,
  TASK_SCHEDULE_MODE,
  TIME_SLOT,
  asTaskScheduleMode,
  type ConflictSeverityValue,
  type RequiredScheduleCell,
  type ScheduleModeValue,
  type TimeSlotValue
} from "@/lib/schedule-rules";
import {
  parseEffectivePolicy,
  parseTagSnapshot,
  STAFF_SCHEDULING_MODE,
  SHIFT_TAG_REQUIREMENT,
  SHIFT_TYPE_CATEGORY
} from "@/lib/staff-policy";
import { getTaskDetail } from "@/lib/tasks";

type DoctorScoreState = {
  total: number;
  fullDay: number;
  morning: number;
  afternoon: number;
  day: number;
  night: number;
  postNight: number;
  weekend: number;
  weekendDay: number;
  weekendNight: number;
  holidayDay: number;
  holidayNight: number;
  highBurdenNight: number;
  saturdayNight: number;
  sundayNight: number;
  goldenNight: number;
  peak: number;
  firstLine: number;
  secondLine: number;
  emergency: number;
  onCall: number;
  backup: number;
  workload: number;
  manualOverride: number;
  workedDates: Set<string>;
  nightDates: Set<string>;
};

type InMemoryAssignment = {
  departmentId?: string | null;
  scheduleTaskId: string;
  date: Date;
  weekday: number;
  roomNumber: number;
  timeSlot: TimeSlotValue;
  doctorId: string;
  locked: boolean;
};

type InMemoryConflict = {
  departmentId?: string | null;
  scheduleTaskId: string;
  date: Date;
  weekday: number;
  roomNumber: number;
  timeSlot: TimeSlotValue;
  conflictType: string;
  missingCount?: number | null;
  description: string;
  severity: ConflictSeverityValue;
};

type AttemptMetrics = {
  hardViolationCount: number;
  unfilledCount: number;
  totalShiftSpread: number;
  workloadSpread: number;
  nightShiftSpread: number;
  postNightSpread: number;
  weekendDaySpread: number;
  weekendNightSpread: number;
  holidayDaySpread: number;
  holidayNightSpread: number;
  specialShiftSpread: number;
  preferencePenalty: number;
  randomSeed: number;
};

type ScheduleAttempt = {
  assignments: InMemoryAssignment[];
  conflicts: InMemoryConflict[];
  metrics: AttemptMetrics;
};

const GLOBAL_MAX_CONSECUTIVE_WORK_DAYS = 5;
const FAIR_ATTEMPT_COUNT = 48;

function slotKey(dateKey: string, timeSlot: TimeSlotValue) {
  return `${dateKey}:${timeSlot}`;
}

function createInitialDoctorState(doctors: ScheduleDoctor[]) {
  const state = new Map<string, DoctorScoreState>();
  for (const doctor of doctors) {
    state.set(doctor.id, {
      total: 0,
      fullDay: 0,
      morning: 0,
      afternoon: 0,
      day: 0,
      night: 0,
      postNight: 0,
      weekend: 0,
      weekendDay: 0,
      weekendNight: 0,
      holidayDay: 0,
      holidayNight: 0,
      highBurdenNight: 0,
      saturdayNight: 0,
      sundayNight: 0,
      goldenNight: 0,
      peak: 0,
      firstLine: 0,
      secondLine: 0,
      emergency: 0,
      onCall: 0,
      backup: 0,
      workload: 0,
      manualOverride: 0,
      workedDates: new Set(),
      nightDates: new Set()
    });
  }
  return state;
}

function findCellForAssignment(cells: RequiredScheduleCell[], assignment: Pick<InMemoryAssignment, "date" | "timeSlot" | "roomNumber">) {
  const dateKey = toDateKey(assignment.date);
  return cells.find((cell) => cell.dateKey === dateKey && cell.timeSlot === assignment.timeSlot && cell.roomNumber === assignment.roomNumber) ?? null;
}

function recordState(
  state: Map<string, DoctorScoreState>,
  takenBySlot: Map<string, Set<string>>,
  assignment: Pick<InMemoryAssignment, "doctorId" | "date" | "weekday" | "timeSlot">,
  cell: RequiredScheduleCell | null | undefined,
  specialDateTypes: Map<string, string>
) {
  const dateKey = toDateKey(assignment.date);
  const doctorState = state.get(assignment.doctorId);
  if (!doctorState) return;

  const category = cell?.shiftType?.category ?? "";
  const isNightShift = isNightCell(cell);
  const dateType = getEffectiveDateType(dateKey, assignment.weekday, specialDateTypes);
  const isWeekendDay = dateType === "WEEKEND";
  const isHolidayDay = dateType === "PUBLIC_HOLIDAY";
  const workload = Number(cell?.shiftType?.workloadWeight ?? 1) || 1;

  doctorState.total += 1;
  doctorState.workload += workload;
  doctorState.workedDates.add(dateKey);
  if (assignment.timeSlot === TIME_SLOT.FULL_DAY) doctorState.fullDay += 1;
  if (assignment.timeSlot === TIME_SLOT.MORNING) doctorState.morning += 1;
  if (assignment.timeSlot === TIME_SLOT.AFTERNOON) doctorState.afternoon += 1;
  if (isWeekendDay) doctorState.weekend += 1;
  if (assignment.weekday === 1 || assignment.weekday === 2) doctorState.peak += 1;

  if (isNightShift) {
    doctorState.night += 1;
    doctorState.nightDates.add(dateKey);
    if (isWeekendDay) doctorState.weekendNight += 1;
    if (isHolidayDay) doctorState.holidayNight += 1;
    if (assignment.weekday === 6 && dateType !== "MAKEUP_WORKDAY") doctorState.saturdayNight += 1;
    if (assignment.weekday === 7 && dateType !== "MAKEUP_WORKDAY") doctorState.sundayNight += 1;
    if (causesPostNightRecovery(dateKey, specialDateTypes)) doctorState.postNight += 1;
    if (assignment.weekday === 4 && causesPostNightRecovery(dateKey, specialDateTypes)) doctorState.goldenNight += 1;
    if (isWeekendDay || isHolidayDay) doctorState.highBurdenNight += 1;
  } else {
    doctorState.day += 1;
    if (isWeekendDay) doctorState.weekendDay += 1;
    if (isHolidayDay) doctorState.holidayDay += 1;
  }

  if (category === SHIFT_TYPE_CATEGORY.FIRST_LINE) doctorState.firstLine += 1;
  if (category === SHIFT_TYPE_CATEGORY.SECOND_LINE) doctorState.secondLine += 1;
  if (category === SHIFT_TYPE_CATEGORY.EMERGENCY) doctorState.emergency += 1;
  if (category === SHIFT_TYPE_CATEGORY.ON_CALL) doctorState.onCall += 1;
  if (category === SHIFT_TYPE_CATEGORY.BACKUP) doctorState.backup += 1;

  const key = slotKey(dateKey, assignment.timeSlot);
  if (!takenBySlot.has(key)) takenBySlot.set(key, new Set());
  takenBySlot.get(key)?.add(assignment.doctorId);
}

function scoreDoctor(input: {
  mode: ScheduleModeValue;
  doctor: ScheduleDoctor;
  cell: RequiredScheduleCell;
  state: Map<string, DoctorScoreState>;
  specialDateTypes: Map<string, string>;
  randomSeed: number;
}) {
  const doctorState = input.state.get(input.doctor.id);
  if (!doctorState) return Number.NEGATIVE_INFINITY;

  const policy = parseEffectivePolicy(input.doctor.policySnapshotJson);
  const workloadFactor = Math.max(0.1, policy.workloadFactor || 1);
  const dateKey = input.cell.dateKey;
  const previousDateKey = toDateKey(addDays(dateKey, -1));
  const nextDateKey = toDateKey(addDays(dateKey, 1));
  const isNightShift = isNightCell(input.cell);
  const dateType = getEffectiveDateType(dateKey, input.cell.weekday, input.specialDateTypes);

  let score = 10000;
  score -= (doctorState.workload / workloadFactor) * 180;
  score -= doctorState.total * 150;
  score -= isNightShift ? doctorState.night * 220 : doctorState.day * 90;
  if (isNightShift && causesPostNightRecovery(dateKey, input.specialDateTypes)) score -= doctorState.postNight * 180;
  if (!isNightShift && dateType === "WEEKEND") score -= doctorState.weekendDay * 160;
  if (isNightShift && dateType === "WEEKEND") score -= doctorState.weekendNight * 210;
  if (!isNightShift && dateType === "PUBLIC_HOLIDAY") score -= doctorState.holidayDay * 190;
  if (isNightShift && dateType === "PUBLIC_HOLIDAY") score -= doctorState.holidayNight * 230;
  if (isNightShift && input.cell.weekday === 6) score -= doctorState.saturdayNight * 90;
  if (isNightShift && input.cell.weekday === 7) score -= doctorState.sundayNight * 90;
  if (isNightShift && input.cell.weekday === 4) score -= doctorState.goldenNight * 80;

  const category = input.cell.shiftType?.category ?? "";
  if (category === SHIFT_TYPE_CATEGORY.FIRST_LINE) score -= doctorState.firstLine * 110;
  if (category === SHIFT_TYPE_CATEGORY.SECOND_LINE) score -= doctorState.secondLine * 110;
  if (category === SHIFT_TYPE_CATEGORY.EMERGENCY) score -= doctorState.emergency * 110;
  if (category === SHIFT_TYPE_CATEGORY.ON_CALL) score -= doctorState.onCall * 110;
  if (category === SHIFT_TYPE_CATEGORY.BACKUP) score -= doctorState.backup * 90;

  if (doctorState.workedDates.has(previousDateKey)) score -= 25;
  if (doctorState.workedDates.has(nextDateKey)) score -= 10;

  if (input.mode === SCHEDULE_MODE.HALF_DAY) {
    if (input.cell.timeSlot === TIME_SLOT.MORNING) score += (doctorState.afternoon - doctorState.morning) * 25;
    if (input.cell.timeSlot === TIME_SLOT.AFTERNOON) score += (doctorState.morning - doctorState.afternoon) * 25;
  }

  // Preferences are deliberately tiny compared with fairness terms. They only
  // break near-ties after hard constraints and fairness have done their work.
  const preferred = normalizePreferredShiftType((input.doctor as any).preferredShiftType);
  const strength = preferenceStrengthWeight((input.doctor as any).preferenceStrength);
  if (preferred === PREFERRED_SHIFT_TYPE.DAY && !isNightShift && doctorState.day <= minMetric(input.state, "day") + 1) score += 6 * strength;
  if (preferred === PREFERRED_SHIFT_TYPE.NIGHT && isNightShift && doctorState.night <= minMetric(input.state, "night") + 1) score += 6 * strength;

  return score + input.randomSeed;
}

export function checkIdentityEligibility(input: {
  doctor: ScheduleDoctor;
  cell: RequiredScheduleCell;
  state: Map<string, DoctorScoreState>;
  specialDateTypes?: Map<string, string>;
}) {
  const { doctor, cell, state } = input;
  if ((doctor as any).active === false) return { ok: false, reason: "人员未启用" };

  const tagIds = new Set(parseTagSnapshot(doctor.tagSnapshotJson).map((tag) => tag.id));
  const policy = parseEffectivePolicy(doctor.policySnapshotJson);
  if (!policy.participatesInScheduling) return { ok: false, reason: "身份策略不参与自动排班" };
  if (policy.schedulingMode === STAFF_SCHEDULING_MODE.EXCLUDED) return { ok: false, reason: "身份策略排除自动排班" };

  const rules = cell.shiftType?.requiredTags ?? [];
  const required = rules.filter((rule) => rule.requirementType === SHIFT_TAG_REQUIREMENT.REQUIRED);
  const forbidden = rules.filter((rule) => rule.requirementType === SHIFT_TAG_REQUIREMENT.FORBIDDEN);
  const allowed = rules.filter((rule) => rule.requirementType === SHIFT_TAG_REQUIREMENT.ALLOWED);

  for (const rule of forbidden) {
    if (tagIds.has(rule.staffTagId)) return { ok: false, reason: `拥有禁排身份：${rule.staffTag?.name ?? "未命名身份"}` };
  }
  for (const rule of required) {
    if (!tagIds.has(rule.staffTagId)) return { ok: false, reason: `缺少必需身份：${rule.staffTag?.name ?? "未命名身份"}` };
  }
  if (allowed.length && !allowed.some((rule) => tagIds.has(rule.staffTagId))) {
    return { ok: false, reason: "不在允许身份范围内" };
  }

  const doctorState = state.get(doctor.id);
  if (!doctorState) return { ok: false, reason: "人员状态缺失" };
  if (policy.schedulingMode === STAFF_SCHEDULING_MODE.FIXED_TARGET && policy.targetShiftsPerPeriod != null && doctorState.total >= policy.targetShiftsPerPeriod) {
    return { ok: false, reason: `身份目标班次已达到：${policy.targetShiftsPerPeriod}` };
  }
  if (policy.schedulingMode === STAFF_SCHEDULING_MODE.MAX_LIMIT && policy.maxShiftsPerPeriod != null && doctorState.total >= policy.maxShiftsPerPeriod) {
    return { ok: false, reason: `身份最大班次已达到：${policy.maxShiftsPerPeriod}` };
  }
  if (policy.maxShiftsPerPeriod != null && doctorState.total >= policy.maxShiftsPerPeriod) {
    return { ok: false, reason: `身份最大班次已达到：${policy.maxShiftsPerPeriod}` };
  }

  const isNightShift = isNightCell(cell);
  const category = cell.shiftType?.category ?? "";
  const specialDateTypes = input.specialDateTypes ?? new Map<string, string>();
  const dateType = getEffectiveDateType(cell.dateKey, cell.weekday, specialDateTypes);
  if (isNightShift && policy.canWorkNightShift === false) return { ok: false, reason: "身份策略不允许夜班" };
  if (!isNightShift && policy.canWorkDayShift === false) return { ok: false, reason: "身份策略不允许白班" };
  if (dateType === "WEEKEND" && policy.canWorkWeekend === false) return { ok: false, reason: "身份策略不允许周末班" };
  if (dateType === "PUBLIC_HOLIDAY" && policy.canWorkHoliday === false) return { ok: false, reason: "身份策略不允许节假日班" };
  if (category === SHIFT_TYPE_CATEGORY.FIRST_LINE && policy.canWorkFirstLine === false) return { ok: false, reason: "身份策略不允许一线班" };
  if (category === SHIFT_TYPE_CATEGORY.SECOND_LINE && policy.canWorkSecondLine === false) return { ok: false, reason: "身份策略不允许二线班" };
  if (category === SHIFT_TYPE_CATEGORY.EMERGENCY && policy.canWorkEmergency === false) return { ok: false, reason: "身份策略不允许急诊班" };
  if (category === SHIFT_TYPE_CATEGORY.ON_CALL && policy.canWorkOnCall === false) return { ok: false, reason: "身份策略不允许留班" };
  if (category === SHIFT_TYPE_CATEGORY.BACKUP && policy.canWorkBackup === false) return { ok: false, reason: "身份策略不允许备班" };

  if (policy.maxNightShiftsPerMonth != null && isNightShift && doctorState.night >= policy.maxNightShiftsPerMonth) return { ok: false, reason: `夜班上限已达到：${policy.maxNightShiftsPerMonth}` };
  if (policy.maxWeekendShiftsPerMonth != null && dateType === "WEEKEND" && doctorState.weekend >= policy.maxWeekendShiftsPerMonth) return { ok: false, reason: `周末班上限已达到：${policy.maxWeekendShiftsPerMonth}` };
  if (policy.maxHolidayShiftsPerMonth != null && dateType === "PUBLIC_HOLIDAY" && doctorState.holidayDay + doctorState.holidayNight >= policy.maxHolidayShiftsPerMonth) return { ok: false, reason: `节假日班上限已达到：${policy.maxHolidayShiftsPerMonth}` };

  const maxConsecutive = policy.maxConsecutiveWorkDays ?? GLOBAL_MAX_CONSECUTIVE_WORK_DAYS;
  if (wouldExceedConsecutiveLimit(doctorState.workedDates, cell.dateKey, maxConsecutive)) {
    return { ok: false, reason: `连续上班将超过 ${maxConsecutive} 天` };
  }
  if (isNightShift && doctorState.nightDates.has(toDateKey(addDays(cell.dateKey, -1))) && policy.allowConsecutiveNightShifts !== true) {
    return { ok: false, reason: "禁止连续夜班" };
  }
  if (!isNightShift && doctorState.nightDates.has(toDateKey(addDays(cell.dateKey, -1))) && policy.allowDayAfterNightShift !== true) {
    return { ok: false, reason: "禁止夜班后白班" };
  }

  return { ok: true, reason: "" };
}

export async function generateScheduleForTask(taskId: string) {
  return generateScheduleForTaskWithStatus(taskId, SCHEDULE_STATUS.GENERATED);
}

export async function generateSchedulePreviewForTask(taskId: string) {
  return generateScheduleForTaskWithStatus(taskId, SCHEDULE_STATUS.PREVIEW);
}

async function generateScheduleForTaskWithStatus(taskId: string, status: string) {
  const task = await prisma.scheduleTask.findUnique({
    where: { id: taskId },
    include: {
      doctors: true,
      unavailableTimes: true,
      requirements: {
        include: {
          shiftType: {
            include: {
              requiredTags: { include: { staffTag: true } }
            }
          }
        }
      },
      assignments: {
        where: { locked: true }
      }
    }
  });

  if (!task) throw new Error("Schedule task not found");

  const taskMode = asScheduleMode(task.mode);
  const requiredCells = requirementsToCells(task.requirements);
  if (requiredCells.length === 0) {
    throw new Error("Please configure at least one enabled scheduling requirement before generating.");
  }
  const [effectiveUnavailableTimes, specialDateTypes] = await Promise.all([
    loadEffectiveMemberFeedbackUnavailableTimes(task.id, task.doctors),
    loadSpecialDateTypesForTask(task)
  ]);
  const allUnavailableTimes = [...task.unavailableTimes, ...effectiveUnavailableTimes];

  const attempts = Array.from({ length: FAIR_ATTEMPT_COUNT }, (_, index) =>
    runScheduleAttempt({
      task,
      taskMode,
      requiredCells,
      unavailableTimes: allUnavailableTimes,
      specialDateTypes,
      randomSeed: Math.random() + index / 1000
    })
  ).sort(compareAttempts);
  const best = attempts[0];

  await prisma.$transaction(async (tx) => {
    await tx.scheduleConflict.deleteMany({ where: { scheduleTaskId: task.id } });
    await tx.scheduleAssignment.deleteMany({ where: { scheduleTaskId: task.id, locked: false } });

    if (best.assignments.length > 0) await tx.scheduleAssignment.createMany({ data: best.assignments });
    if (best.conflicts.length > 0) await tx.scheduleConflict.createMany({ data: best.conflicts });

    await tx.scheduleTask.update({
      where: { id: task.id },
      data: { status }
    });
  });

  return getTaskDetail(task.id);
}

function runScheduleAttempt(input: {
  task: any;
  taskMode: ScheduleModeValue;
  requiredCells: RequiredScheduleCell[];
  unavailableTimes: Array<{ doctorId: string; date: Date | string; timeSlot: string; reason?: string | null }>;
  specialDateTypes: Map<string, string>;
  randomSeed: number;
}): ScheduleAttempt {
  const doctorState = createInitialDoctorState(input.task.doctors);
  const takenBySlot = new Map<string, Set<string>>();
  const generatedAssignments: InMemoryAssignment[] = [];
  const conflicts: InMemoryConflict[] = [];

  for (const lockedAssignment of input.task.assignments) {
    const lockedTimeSlot = asTimeSlot(lockedAssignment.timeSlot);
    const lockedCell = findCellForAssignment(input.requiredCells, {
      date: lockedAssignment.date,
      timeSlot: lockedTimeSlot,
      roomNumber: lockedAssignment.roomNumber
    });
    recordState(doctorState, takenBySlot, { ...lockedAssignment, timeSlot: lockedTimeSlot }, lockedCell, input.specialDateTypes);
    if (isDoctorUnavailable(input.unavailableTimes, lockedAssignment.doctorId, lockedAssignment.date, lockedTimeSlot)) {
      const dateKey = toDateKey(lockedAssignment.date);
      conflicts.push({
        scheduleTaskId: input.task.id,
        date: dateFromKey(dateKey),
        weekday: lockedAssignment.weekday,
        roomNumber: lockedAssignment.roomNumber,
        timeSlot: lockedTimeSlot,
        conflictType: "LOCKED_UNAVAILABLE",
        missingCount: null,
        description: `${dateKey} ${getWeekdayLabel(lockedAssignment.weekday)} ${SLOT_LABELS[lockedTimeSlot]}：锁定人员不可用。`,
        severity: CONFLICT_SEVERITY.ERROR
      });
    }
  }

  for (const cell of orderCellsForAttempt(input.requiredCells, input.randomSeed)) {
    const lockedInCell = input.task.assignments.filter(
      (assignment: any) =>
        toDateKey(assignment.date) === cell.dateKey &&
        asTimeSlot(assignment.timeSlot) === cell.timeSlot &&
        assignment.roomNumber === cell.roomNumber
    );

    if (lockedInCell.length > cell.requiredDoctors) {
      conflicts.push({
        scheduleTaskId: input.task.id,
        date: dateFromKey(cell.dateKey),
        weekday: cell.weekday,
        roomNumber: cell.roomNumber,
        timeSlot: cell.timeSlot,
        conflictType: "OVERFILLED",
        missingCount: null,
        description: `${cell.dateKey} ${getWeekdayLabel(cell.weekday)} ${SLOT_LABELS[cell.timeSlot]} ${requirementLabel(cell, input.task.scheduleMode)}：锁定人数超过需求。`,
        severity: CONFLICT_SEVERITY.WARNING
      });
      continue;
    }

    let assignedCount = lockedInCell.length;
    while (assignedCount < cell.requiredDoctors) {
      const alreadyTaken = takenBySlot.get(slotKey(cell.dateKey, cell.timeSlot)) ?? new Set<string>();
      const identityRejections: string[] = [];
      const candidates = input.task.doctors
        .filter((doctor: ScheduleDoctor) => !alreadyTaken.has(doctor.id))
        .filter((doctor: ScheduleDoctor) => !isDoctorUnavailable(input.unavailableTimes, doctor.id, cell.date, cell.timeSlot))
        .filter((doctor: ScheduleDoctor) => {
          const result = checkIdentityEligibility({ doctor, cell, state: doctorState, specialDateTypes: input.specialDateTypes });
          if (!result.ok) identityRejections.push(result.reason);
          return result.ok;
        })
        .map((doctor: ScheduleDoctor) => ({
          doctor,
          score: scoreDoctor({
            mode: input.taskMode,
            doctor,
            cell,
            state: doctorState,
            specialDateTypes: input.specialDateTypes,
            randomSeed: Math.random()
          })
        }))
        .sort((a: { doctor: ScheduleDoctor; score: number }, b: { doctor: ScheduleDoctor; score: number }) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.doctor.name.localeCompare(b.doctor.name, "zh-Hans-CN");
        });

      const selected = candidates[0]?.doctor;
      if (!selected) {
        const missingCount = cell.requiredDoctors - assignedCount;
        const ruleText = shiftRuleSummary(cell);
        const rejection = topIdentityRejection(identityRejections);
        const reason = [ruleText, rejection].filter(Boolean).join("；");
        conflicts.push(
          createConflict(
            cell,
            input.task.id,
            missingCount,
            input.task.scheduleMode,
            `${cell.dateKey} ${getWeekdayLabel(cell.weekday)} ${SLOT_LABELS[cell.timeSlot]} ${requirementLabel(cell, input.task.scheduleMode)} 缺少 ${missingCount} 人：可用人员不足${reason ? `（${reason}）` : ""}。`
          )
        );
        break;
      }

      const assignment: InMemoryAssignment = {
        departmentId: input.task.departmentId,
        scheduleTaskId: input.task.id,
        date: dateFromKey(cell.dateKey),
        weekday: cell.weekday,
        roomNumber: cell.roomNumber,
        timeSlot: cell.timeSlot,
        doctorId: selected.id,
        locked: false
      };
      generatedAssignments.push(assignment);
      recordState(doctorState, takenBySlot, assignment, cell, input.specialDateTypes);
      assignedCount += 1;
    }
  }

  return {
    assignments: generatedAssignments,
    conflicts,
    metrics: calculateAttemptMetrics(doctorState, conflicts, input.task.doctors, input.randomSeed)
  };
}

function calculateAttemptMetrics(
  state: Map<string, DoctorScoreState>,
  conflicts: InMemoryConflict[],
  doctors: ScheduleDoctor[],
  randomSeed: number
): AttemptMetrics {
  const states = Array.from(state.values());
  return {
    hardViolationCount: conflicts.filter((item) => item.conflictType !== "UNFILLED").length,
    unfilledCount: conflicts.reduce((sum, item) => sum + (item.conflictType === "UNFILLED" ? item.missingCount ?? 0 : 0), 0),
    totalShiftSpread: spread(states.map((item) => item.total)),
    workloadSpread: spread(states.map((item) => item.workload)),
    nightShiftSpread: spread(states.map((item) => item.night)),
    postNightSpread: spread(states.map((item) => item.postNight)),
    weekendDaySpread: spread(states.map((item) => item.weekendDay)),
    weekendNightSpread: spread(states.map((item) => item.weekendNight)),
    holidayDaySpread: spread(states.map((item) => item.holidayDay)),
    holidayNightSpread: spread(states.map((item) => item.holidayNight)),
    specialShiftSpread: spread(states.map((item) => item.firstLine + item.secondLine + item.emergency + item.onCall + item.backup)),
    preferencePenalty: preferencePenalty(state, doctors),
    randomSeed
  };
}

function compareAttempts(a: ScheduleAttempt, b: ScheduleAttempt) {
  const order: Array<keyof AttemptMetrics> = [
    "hardViolationCount",
    "unfilledCount",
    "totalShiftSpread",
    "workloadSpread",
    "nightShiftSpread",
    "postNightSpread",
    "weekendDaySpread",
    "weekendNightSpread",
    "holidayDaySpread",
    "holidayNightSpread",
    "specialShiftSpread",
    "preferencePenalty",
    "randomSeed"
  ];
  for (const key of order) {
    const diff = a.metrics[key] - b.metrics[key];
    if (Math.abs(diff) > 0.0001) return diff;
  }
  return 0;
}

function preferencePenalty(state: Map<string, DoctorScoreState>, doctors: ScheduleDoctor[]) {
  let penalty = 0;
  for (const doctor of doctors) {
    const doctorState = state.get(doctor.id);
    if (!doctorState) continue;
    const preferred = normalizePreferredShiftType((doctor as any).preferredShiftType);
    const weight = preferenceStrengthWeight((doctor as any).preferenceStrength);
    if (preferred === PREFERRED_SHIFT_TYPE.DAY) penalty += doctorState.night * weight;
    if (preferred === PREFERRED_SHIFT_TYPE.NIGHT) penalty += doctorState.day * weight;
  }
  return penalty;
}

function orderCellsForAttempt(cells: RequiredScheduleCell[], seed: number) {
  return [...cells].sort((a, b) => {
    const constrained = cellConstraintWeight(b) - cellConstraintWeight(a);
    if (constrained !== 0) return constrained;
    if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
    return pseudoRandom(`${a.dateKey}:${a.roomNumber}:${seed}`) - pseudoRandom(`${b.dateKey}:${b.roomNumber}:${seed}`);
  });
}

function cellConstraintWeight(cell: RequiredScheduleCell) {
  let value = 0;
  if (isNightCell(cell)) value += 100;
  value += (cell.shiftType?.requiredTags?.length ?? 0) * 20;
  if (isWeekend(cell.weekday)) value += 8;
  return value;
}

function createConflict(cell: RequiredScheduleCell, taskId: string, missingCount: number, scheduleMode?: string | null, description?: string) {
  return {
    scheduleTaskId: taskId,
    date: dateFromKey(cell.dateKey),
    weekday: cell.weekday,
    roomNumber: cell.roomNumber,
    timeSlot: cell.timeSlot,
    conflictType: "UNFILLED",
    missingCount,
    description:
      description ??
      `${cell.dateKey} ${getWeekdayLabel(cell.weekday)} ${SLOT_LABELS[cell.timeSlot]} ${requirementLabel(cell, scheduleMode)} 缺少 ${missingCount} 人：可用人员不足。`,
    severity: CONFLICT_SEVERITY.ERROR
  } satisfies InMemoryConflict;
}

function requirementLabel(cell: RequiredScheduleCell, scheduleMode?: string | null) {
  return asTaskScheduleMode(scheduleMode) === TASK_SCHEDULE_MODE.MEDTECH_ROOM
    ? `单元${cell.roomNumber}`
    : `班次${cell.shiftType?.name ?? cell.shiftTypeId ?? cell.roomNumber}`;
}

function shiftRuleSummary(cell: RequiredScheduleCell) {
  const rules = cell.shiftType?.requiredTags ?? [];
  const required = rules.filter((rule) => rule.requirementType === SHIFT_TAG_REQUIREMENT.REQUIRED).map((rule) => rule.staffTag?.name).filter(Boolean);
  const forbidden = rules.filter((rule) => rule.requirementType === SHIFT_TAG_REQUIREMENT.FORBIDDEN).map((rule) => rule.staffTag?.name).filter(Boolean);
  const allowed = rules.filter((rule) => rule.requirementType === SHIFT_TAG_REQUIREMENT.ALLOWED).map((rule) => rule.staffTag?.name).filter(Boolean);
  const parts: string[] = [];
  if (required.length) parts.push(`必需身份：${required.join("、")}`);
  if (forbidden.length) parts.push(`禁排身份：${forbidden.join("、")}`);
  if (allowed.length) parts.push(`允许范围：${allowed.join("、")}`);
  return parts.join("；");
}

function topIdentityRejection(rejections: string[]) {
  const counts = new Map<string, number>();
  for (const reason of rejections) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function wouldExceedConsecutiveLimit(workedDates: Set<string>, dateKey: string, maxDays: number | null | undefined) {
  if (!maxDays || maxDays <= 0 || workedDates.has(dateKey)) return false;
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

async function loadEffectiveMemberFeedbackUnavailableTimes(taskId: string, doctors: ScheduleDoctor[]) {
  const feedback = await prisma.memberFeedback.findMany({
    where: {
      scheduleTaskId: taskId,
      effective: true,
      status: { not: "REJECTED" }
    },
    include: { unavailableTimes: true }
  });
  if (!feedback.length) return [];
  const rosterIds = Array.from(new Set(feedback.map((item) => item.rosterEntryId).filter(Boolean))) as string[];
  const rosterEntries = rosterIds.length
    ? await prisma.rosterEntry.findMany({ where: { id: { in: rosterIds }, status: "CONFIRMED", includeInScheduling: true } })
    : [];
  const rosterById = new Map(rosterEntries.map((item) => [item.id, item]));
  const doctorByStaffProfileId = new Map(doctors.filter((doctor) => doctor.staffProfileId).map((doctor) => [doctor.staffProfileId!, doctor]));
  const records: Array<{ doctorId: string; date: Date; timeSlot: string; reason?: string | null }> = [];
  for (const item of feedback) {
    const roster = item.rosterEntryId ? rosterById.get(item.rosterEntryId) : null;
    if (!roster?.staffProfileId) continue;
    const doctor = doctorByStaffProfileId.get(roster.staffProfileId);
    if (!doctor) continue;
    for (const unavailable of item.unavailableTimes) {
      records.push({ doctorId: doctor.id, date: unavailable.date, timeSlot: unavailable.timeSlot, reason: unavailable.reason });
    }
  }
  return records;
}

async function loadSpecialDateTypesForTask(task: { startDate?: Date | null; weekStartDate: Date; endDate?: Date | null; weekEndDate: Date; unitId?: string | null; departmentId?: string | null; hospitalId?: string | null }) {
  const start = dateFromKey(toDateKey(task.startDate ?? task.weekStartDate));
  const end = dateFromKey(toDateKey(task.endDate ?? task.weekEndDate));
  const specialDates = await prisma.specialDate.findMany({
    where: {
      date: { gte: start, lte: end },
      OR: [
        { unitId: task.unitId ?? undefined },
        { unitId: null, departmentId: task.departmentId ?? undefined },
        { unitId: null, departmentId: null, hospitalId: task.hospitalId ?? undefined }
      ]
    },
    orderBy: [{ date: "asc" }, { createdAt: "desc" }],
    select: { date: true, dateType: true }
  });
  const output = new Map<string, string>();
  for (const item of specialDates) {
    const key = toDateKey(item.date);
    const current = output.get(key);
    if (!current || specialDatePriority(item.dateType) > specialDatePriority(current)) {
      output.set(key, normalizeSpecialDateType(item.dateType) ?? item.dateType);
    }
  }
  return output;
}

export async function rebuildConflictsForTask(taskId: string) {
  const task = await prisma.scheduleTask.findUnique({
    where: { id: taskId },
    include: {
      doctors: true,
      assignments: true,
      unavailableTimes: true,
      requirements: {
        include: {
          shiftType: {
            include: {
              requiredTags: { include: { staffTag: true } }
            }
          }
        }
      }
    }
  });

  if (!task) throw new Error("Schedule task not found");

  const [feedbackUnavailableTimes, specialDateTypes] = await Promise.all([
    loadEffectiveMemberFeedbackUnavailableTimes(task.id, task.doctors),
    loadSpecialDateTypesForTask(task)
  ]);
  const unavailableTimes = [...task.unavailableTimes, ...feedbackUnavailableTimes];

  const conflicts: InMemoryConflict[] = [];
  const requiredCells = requirementsToCells(task.requirements);
  for (const cell of requiredCells) {
    const count = task.assignments.filter(
      (assignment) =>
        toDateKey(assignment.date) === cell.dateKey &&
        asTimeSlot(assignment.timeSlot) === cell.timeSlot &&
        assignment.roomNumber === cell.roomNumber
    ).length;

    if (count < cell.requiredDoctors) conflicts.push(createConflict(cell, task.id, cell.requiredDoctors - count, task.scheduleMode));
    if (count > cell.requiredDoctors) {
      conflicts.push({
        scheduleTaskId: task.id,
        date: dateFromKey(cell.dateKey),
        weekday: cell.weekday,
        roomNumber: cell.roomNumber,
        timeSlot: cell.timeSlot,
        conflictType: "OVERFILLED",
        missingCount: null,
        description: `${cell.dateKey} ${getWeekdayLabel(cell.weekday)} ${SLOT_LABELS[cell.timeSlot]} ${requirementLabel(cell, task.scheduleMode)}：人数超过需求。`,
        severity: CONFLICT_SEVERITY.WARNING
      });
    }
  }

  const doctorState = createInitialDoctorState(task.doctors);
  const takenBySlot = new Map<string, Set<string>>();
  for (const assignment of task.assignments) {
    const dateKey = toDateKey(assignment.date);
    const assignmentTimeSlot = asTimeSlot(assignment.timeSlot);
    const matchingRequirement = requiredCells.find(
      (cell) => cell.dateKey === dateKey && cell.timeSlot === assignmentTimeSlot && cell.roomNumber === assignment.roomNumber
    );
    if (matchingRequirement) recordState(doctorState, takenBySlot, { ...assignment, timeSlot: assignmentTimeSlot }, matchingRequirement, specialDateTypes);
    if (!matchingRequirement) {
      conflicts.push({
        scheduleTaskId: task.id,
        date: dateFromKey(dateKey),
        weekday: assignment.weekday,
        roomNumber: assignment.roomNumber,
        timeSlot: assignmentTimeSlot,
        conflictType: "CLOSED_UNIT",
        missingCount: null,
        description: `${dateKey} ${getWeekdayLabel(assignment.weekday)}：当前规则未启用对应需求。`,
        severity: CONFLICT_SEVERITY.ERROR
      });
    }

    if (isDoctorUnavailable(unavailableTimes, assignment.doctorId, assignment.date, assignmentTimeSlot)) {
      conflicts.push({
        scheduleTaskId: task.id,
        date: dateFromKey(dateKey),
        weekday: assignment.weekday,
        roomNumber: assignment.roomNumber,
        timeSlot: assignmentTimeSlot,
        conflictType: "UNAVAILABLE_DOCTOR",
        missingCount: null,
        description: `${dateKey} ${getWeekdayLabel(assignment.weekday)} ${SLOT_LABELS[assignmentTimeSlot]}：已排人员不可用。`,
        severity: CONFLICT_SEVERITY.ERROR
      });
    }
    if ((assignment as any).manualOverride) {
      conflicts.push({
        scheduleTaskId: task.id,
        date: assignment.date,
        weekday: assignment.weekday,
        roomNumber: assignment.roomNumber,
        timeSlot: assignmentTimeSlot,
        conflictType: "MANUAL_OVERRIDE",
        missingCount: null,
        description: `${dateKey} ${getWeekdayLabel(assignment.weekday)} ${SLOT_LABELS[assignmentTimeSlot]}：管理员强制覆盖规则。${(assignment as any).overrideReason ? `原因：${(assignment as any).overrideReason}` : ""}`,
        severity: CONFLICT_SEVERITY.WARNING
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.scheduleConflict.deleteMany({ where: { scheduleTaskId: task.id } });
    if (conflicts.length > 0) await tx.scheduleConflict.createMany({ data: conflicts });
  });

  return getTaskDetail(task.id);
}

function isNightCell(cell?: RequiredScheduleCell | null) {
  const category = cell?.shiftType?.category ?? "";
  return Boolean(cell?.shiftType?.isNight) || category === SHIFT_TYPE_CATEGORY.NIGHT;
}

function causesPostNightRecovery(nightDateKey: string, specialDateTypes: Map<string, string>) {
  const nextDateKey = toDateKey(addDays(nightDateKey, 1));
  const nextWeekday = weekdayFromDateKey(nextDateKey);
  const nextType = getEffectiveDateType(nextDateKey, nextWeekday, specialDateTypes);
  return nextType === "WORKDAY" || nextType === "MAKEUP_WORKDAY";
}

function getEffectiveDateType(dateKey: string, weekday: number, specialDateTypes: Map<string, string>) {
  const specialType = normalizeSpecialDateType(specialDateTypes.get(dateKey));
  if (specialType) return specialType;
  return isWeekend(weekday) ? "WEEKEND" : "WORKDAY";
}

function normalizeSpecialDateType(value?: string | null) {
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

function specialDatePriority(type: string) {
  if (type === "MAKEUP_WORKDAY") return 40;
  if (type === "PUBLIC_HOLIDAY" || type === "HOLIDAY") return 30;
  if (type === "CUSTOM_REST_DAY" || type === "CUSTOM_REST") return 20;
  if (type === "CUSTOM_SPECIAL_DAY" || type === "CUSTOM_SPECIAL") return 10;
  return 0;
}

function weekdayFromDateKey(dateKey: string) {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function spread(values: number[]) {
  if (!values.length) return 0;
  return Number((Math.max(...values) - Math.min(...values)).toFixed(2));
}

function minMetric(state: Map<string, DoctorScoreState>, key: keyof DoctorScoreState) {
  const values = Array.from(state.values()).map((item) => Number(item[key]) || 0);
  return values.length ? Math.min(...values) : 0;
}

function pseudoRandom(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }
  return Math.abs(hash % 10000) / 10000;
}
