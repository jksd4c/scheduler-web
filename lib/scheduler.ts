import type { ScheduleDoctor } from "@prisma/client";
import { isDoctorUnavailable } from "@/lib/availability";
import { addDays, dateFromKey, getWeekdayLabel, toDateKey } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import {
  CONFLICT_SEVERITY,
  asScheduleMode,
  asTimeSlot,
  isPeakDay,
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
  weekend: number;
  peak: number;
  night: number;
  firstLine: number;
  secondLine: number;
  emergency: number;
  onCall: number;
  backup: number;
  workload: number;
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

const GLOBAL_MAX_CONSECUTIVE_WORK_DAYS = 5;

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
      weekend: 0,
      peak: 0,
      night: 0,
      firstLine: 0,
      secondLine: 0,
      emergency: 0,
      onCall: 0,
      backup: 0,
      workload: 0,
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
  cell?: RequiredScheduleCell | null
) {
  const dateKey = toDateKey(assignment.date);
  const doctorState = state.get(assignment.doctorId);
  if (!doctorState) return;

  doctorState.total += 1;
  doctorState.workedDates.add(dateKey);
  if (assignment.timeSlot === TIME_SLOT.FULL_DAY) doctorState.fullDay += 1;
  if (assignment.timeSlot === TIME_SLOT.MORNING) doctorState.morning += 1;
  if (assignment.timeSlot === TIME_SLOT.AFTERNOON) doctorState.afternoon += 1;
  if (isWeekend(assignment.weekday)) doctorState.weekend += 1;
  if (isPeakDay(assignment.weekday)) doctorState.peak += 1;

  const category = cell?.shiftType?.category ?? "";
  const isNightShift = Boolean(cell?.shiftType?.isNight) || category === SHIFT_TYPE_CATEGORY.NIGHT;
  if (isNightShift) {
    doctorState.night += 1;
    doctorState.nightDates.add(dateKey);
  }
  if (category === SHIFT_TYPE_CATEGORY.FIRST_LINE) doctorState.firstLine += 1;
  if (category === SHIFT_TYPE_CATEGORY.SECOND_LINE) doctorState.secondLine += 1;
  if (category === SHIFT_TYPE_CATEGORY.EMERGENCY) doctorState.emergency += 1;
  if (category === SHIFT_TYPE_CATEGORY.ON_CALL) doctorState.onCall += 1;
  if (category === SHIFT_TYPE_CATEGORY.BACKUP) doctorState.backup += 1;
  doctorState.workload += Number(cell?.shiftType?.workloadWeight ?? 1) || 1;

  const key = slotKey(dateKey, assignment.timeSlot);
  if (!takenBySlot.has(key)) takenBySlot.set(key, new Set());
  takenBySlot.get(key)?.add(assignment.doctorId);
}

function scoreDoctor(input: {
  mode: ScheduleModeValue;
  doctor: ScheduleDoctor;
  cell: RequiredScheduleCell;
  state: Map<string, DoctorScoreState>;
}) {
  const doctorState = input.state.get(input.doctor.id);
  if (!doctorState) return Number.NEGATIVE_INFINITY;

  const policy = parseEffectivePolicy(input.doctor.policySnapshotJson);
  const workloadFactor = Math.max(0.1, policy.workloadFactor || 1);
  const dateKey = input.cell.dateKey;
  const previousDateKey = toDateKey(addDays(dateKey, -1));
  const nextDateKey = toDateKey(addDays(dateKey, 1));

  let score = 1000;
  score -= (doctorState.workload / workloadFactor) * 90;
  score -= doctorState.total * 12;

  if (isWeekend(input.cell.weekday)) score -= doctorState.weekend * 55;
  if (isPeakDay(input.cell.weekday)) score -= doctorState.peak * 45;
  if (doctorState.workedDates.has(previousDateKey)) score -= 60;
  if (doctorState.workedDates.has(nextDateKey)) score -= 25;

  if (input.mode === SCHEDULE_MODE.HALF_DAY) {
    if (input.cell.timeSlot === TIME_SLOT.MORNING) score += (doctorState.afternoon - doctorState.morning) * 25;
    if (input.cell.timeSlot === TIME_SLOT.AFTERNOON) score += (doctorState.morning - doctorState.afternoon) * 25;
    if (doctorState.workedDates.has(dateKey)) score -= 10;
  }

  return score;
}

function requirementLabel(cell: RequiredScheduleCell, scheduleMode?: string | null) {
  return asTaskScheduleMode(scheduleMode) === TASK_SCHEDULE_MODE.MEDTECH_ROOM
    ? `单元${cell.roomNumber}`
    : `班次${cell.shiftType?.name ?? cell.shiftTypeId ?? cell.roomNumber}`;
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

function shiftRuleSummary(cell: RequiredScheduleCell) {
  const rules = cell.shiftType?.requiredTags ?? [];
  const required = rules.filter((rule) => rule.requirementType === SHIFT_TAG_REQUIREMENT.REQUIRED).map((rule) => rule.staffTag?.name).filter(Boolean);
  const forbidden = rules.filter((rule) => rule.requirementType === SHIFT_TAG_REQUIREMENT.FORBIDDEN).map((rule) => rule.staffTag?.name).filter(Boolean);
  const allowed = rules.filter((rule) => rule.requirementType === SHIFT_TAG_REQUIREMENT.ALLOWED).map((rule) => rule.staffTag?.name).filter(Boolean);
  const parts: string[] = [];
  if (required.length) parts.push(`required: ${required.join(", ")}`);
  if (forbidden.length) parts.push(`forbidden: ${forbidden.join(", ")}`);
  if (allowed.length) parts.push(`allowed scope: ${allowed.join(", ")}`);
  return parts.join("; ");
}

export function checkIdentityEligibility(input: {
  doctor: ScheduleDoctor;
  cell: RequiredScheduleCell;
  state: Map<string, DoctorScoreState>;
}) {
  const { doctor, cell, state } = input;
  if ((doctor as any).active === false) return { ok: false, reason: "staff inactive" };

  const tagIds = new Set(parseTagSnapshot(doctor.tagSnapshotJson).map((tag) => tag.id));
  const policy = parseEffectivePolicy(doctor.policySnapshotJson);
  if (!policy.participatesInScheduling) return { ok: false, reason: "policy excludes auto scheduling" };
  if (policy.schedulingMode === STAFF_SCHEDULING_MODE.EXCLUDED) return { ok: false, reason: "identity excludes auto scheduling" };

  const rules = cell.shiftType?.requiredTags ?? [];
  const required = rules.filter((rule) => rule.requirementType === SHIFT_TAG_REQUIREMENT.REQUIRED);
  const forbidden = rules.filter((rule) => rule.requirementType === SHIFT_TAG_REQUIREMENT.FORBIDDEN);
  const allowed = rules.filter((rule) => rule.requirementType === SHIFT_TAG_REQUIREMENT.ALLOWED);

  for (const rule of forbidden) {
    if (tagIds.has(rule.staffTagId)) return { ok: false, reason: `has forbidden tag: ${rule.staffTag?.name ?? "unknown"}` };
  }
  for (const rule of required) {
    if (!tagIds.has(rule.staffTagId)) return { ok: false, reason: `missing required tag: ${rule.staffTag?.name ?? "unknown"}` };
  }
  if (allowed.length && !allowed.some((rule) => tagIds.has(rule.staffTagId))) {
    return { ok: false, reason: "outside allowed tag scope" };
  }

  const doctorState = state.get(doctor.id);
  if (!doctorState) return { ok: false, reason: "staff state missing" };
  if (policy.schedulingMode === STAFF_SCHEDULING_MODE.FIXED_TARGET && policy.targetShiftsPerPeriod != null && doctorState.total >= policy.targetShiftsPerPeriod) {
    return { ok: false, reason: `identity target reached: ${policy.targetShiftsPerPeriod}` };
  }
  if (policy.schedulingMode === STAFF_SCHEDULING_MODE.MAX_LIMIT && policy.maxShiftsPerPeriod != null && doctorState.total >= policy.maxShiftsPerPeriod) {
    return { ok: false, reason: `identity max reached: ${policy.maxShiftsPerPeriod}` };
  }
  if (policy.maxShiftsPerPeriod != null && doctorState.total >= policy.maxShiftsPerPeriod) {
    return { ok: false, reason: `identity max reached: ${policy.maxShiftsPerPeriod}` };
  }
  const category = cell.shiftType?.category ?? "";
  const isNightShift = Boolean(cell.shiftType?.isNight) || category === SHIFT_TYPE_CATEGORY.NIGHT;
  if (wouldExceedConsecutiveLimit(doctorState.workedDates, cell.dateKey, GLOBAL_MAX_CONSECUTIVE_WORK_DAYS)) {
    return { ok: false, reason: `global max consecutive work days would be exceeded: ${GLOBAL_MAX_CONSECUTIVE_WORK_DAYS}` };
  }
  if (isNightShift && doctorState.nightDates.has(toDateKey(addDays(cell.dateKey, -1)))) {
    return { ok: false, reason: "global rest rule forbids consecutive night shifts" };
  }
  if (!isNightShift && doctorState.nightDates.has(toDateKey(addDays(cell.dateKey, -1)))) {
    return { ok: false, reason: "global rest rule forbids day shift after night shift" };
  }

  return { ok: true, reason: "" };
}

function wouldExceedConsecutiveLimit(workedDates: Set<string>, dateKey: string, maxDays: number | null | undefined) {
  if (!maxDays || maxDays <= 0 || workedDates.has(dateKey)) return false;
  const dates = new Set(workedDates);
  dates.add(dateKey);
  let current = 0;
  let max = 0;
  for (let offset = -7; offset <= 7; offset += 1) {
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

function topIdentityRejection(rejections: string[]) {
  const counts = new Map<string, number>();
  for (const reason of rejections) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

export async function generateScheduleForTask(taskId: string) {
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
  const effectiveUnavailableTimes = [...task.unavailableTimes, ...(await loadEffectiveMemberFeedbackUnavailableTimes(task.id, task.doctors))];

  const doctorState = createInitialDoctorState(task.doctors);
  const takenBySlot = new Map<string, Set<string>>();
  const generatedAssignments: InMemoryAssignment[] = [];
  const conflicts: InMemoryConflict[] = [];

  for (const lockedAssignment of task.assignments) {
    const lockedTimeSlot = asTimeSlot(lockedAssignment.timeSlot);
    const lockedCell = findCellForAssignment(requiredCells, {
      date: lockedAssignment.date,
      timeSlot: lockedTimeSlot,
      roomNumber: lockedAssignment.roomNumber
    });
    recordState(doctorState, takenBySlot, { ...lockedAssignment, timeSlot: lockedTimeSlot }, lockedCell);
    if (isDoctorUnavailable(effectiveUnavailableTimes, lockedAssignment.doctorId, lockedAssignment.date, lockedTimeSlot)) {
      const dateKey = toDateKey(lockedAssignment.date);
      conflicts.push({
        scheduleTaskId: task.id,
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

  for (const cell of requiredCells) {
    const lockedInCell = task.assignments.filter(
      (assignment) =>
        toDateKey(assignment.date) === cell.dateKey &&
        asTimeSlot(assignment.timeSlot) === cell.timeSlot &&
        assignment.roomNumber === cell.roomNumber
    );

    if (lockedInCell.length > cell.requiredDoctors) {
      conflicts.push({
        scheduleTaskId: task.id,
        date: dateFromKey(cell.dateKey),
        weekday: cell.weekday,
        roomNumber: cell.roomNumber,
        timeSlot: cell.timeSlot,
        conflictType: "OVERFILLED",
        missingCount: null,
        description: `${cell.dateKey} ${getWeekdayLabel(cell.weekday)} ${SLOT_LABELS[cell.timeSlot]} ${requirementLabel(cell, task.scheduleMode)}：锁定人数超过需求。`,
        severity: CONFLICT_SEVERITY.WARNING
      });
      continue;
    }

    let assignedCount = lockedInCell.length;
    while (assignedCount < cell.requiredDoctors) {
      const alreadyTaken = takenBySlot.get(slotKey(cell.dateKey, cell.timeSlot)) ?? new Set<string>();
      const identityRejections: string[] = [];
      const candidates = task.doctors
        .filter((doctor) => !alreadyTaken.has(doctor.id))
        .filter((doctor) => !isDoctorUnavailable(effectiveUnavailableTimes, doctor.id, cell.date, cell.timeSlot))
        .filter((doctor) => {
          const result = checkIdentityEligibility({ doctor, cell, state: doctorState });
          if (!result.ok) identityRejections.push(result.reason);
          return result.ok;
        })
        .map((doctor) => ({
          doctor,
          score: scoreDoctor({ mode: taskMode, doctor, cell, state: doctorState })
        }))
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.doctor.name.localeCompare(b.doctor.name, "zh-Hans-CN");
        });

      const selected = candidates[0]?.doctor;
      if (!selected) {
        const missingCount = cell.requiredDoctors - assignedCount;
        const ruleText = shiftRuleSummary(cell);
        const rejection = topIdentityRejection(identityRejections);
        const reason = [ruleText, rejection].filter(Boolean).join("; ");
        conflicts.push(
          createConflict(
            cell,
            task.id,
            missingCount,
            task.scheduleMode,
            `${cell.dateKey} ${getWeekdayLabel(cell.weekday)} ${SLOT_LABELS[cell.timeSlot]} ${requirementLabel(cell, task.scheduleMode)} 缺少 ${missingCount} 人：可用人员不足${reason ? `（${reason}）` : ""}。`
          )
        );
        break;
      }

      const assignment: InMemoryAssignment = {
        departmentId: task.departmentId,
        scheduleTaskId: task.id,
        date: dateFromKey(cell.dateKey),
        weekday: cell.weekday,
        roomNumber: cell.roomNumber,
        timeSlot: cell.timeSlot,
        doctorId: selected.id,
        locked: false
      };
      generatedAssignments.push(assignment);
      recordState(doctorState, takenBySlot, assignment, cell);
      assignedCount += 1;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.scheduleConflict.deleteMany({ where: { scheduleTaskId: task.id } });
    await tx.scheduleAssignment.deleteMany({ where: { scheduleTaskId: task.id, locked: false } });

    if (generatedAssignments.length > 0) await tx.scheduleAssignment.createMany({ data: generatedAssignments });
    if (conflicts.length > 0) await tx.scheduleConflict.createMany({ data: conflicts });

    await tx.scheduleTask.update({
      where: { id: task.id },
      data: { status: SCHEDULE_STATUS.GENERATED }
    });
  });

  return getTaskDetail(task.id);
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

export async function rebuildConflictsForTask(taskId: string) {
  const task = await prisma.scheduleTask.findUnique({
    where: { id: taskId },
    include: {
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

  for (const assignment of task.assignments) {
    const dateKey = toDateKey(assignment.date);
    const assignmentTimeSlot = asTimeSlot(assignment.timeSlot);
    const matchingRequirement = requiredCells.find(
      (cell) => cell.dateKey === dateKey && cell.timeSlot === assignmentTimeSlot && cell.roomNumber === assignment.roomNumber
    );
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

    if (isDoctorUnavailable(task.unavailableTimes, assignment.doctorId, assignment.date, assignmentTimeSlot)) {
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
  }

  await prisma.$transaction(async (tx) => {
    await tx.scheduleConflict.deleteMany({ where: { scheduleTaskId: task.id } });
    if (conflicts.length > 0) await tx.scheduleConflict.createMany({ data: conflicts });
  });

  return getTaskDetail(task.id);
}
