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
  TIME_SLOT,
  type ConflictSeverityValue,
  type RequiredScheduleCell,
  type ScheduleModeValue,
  type TimeSlotValue
} from "@/lib/schedule-rules";
import { getTaskDetail } from "@/lib/tasks";

type DoctorScoreState = {
  total: number;
  fullDay: number;
  morning: number;
  afternoon: number;
  weekend: number;
  peak: number;
  workedDates: Set<string>;
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
      workedDates: new Set()
    });
  }
  return state;
}

function recordState(
  state: Map<string, DoctorScoreState>,
  takenBySlot: Map<string, Set<string>>,
  assignment: Pick<InMemoryAssignment, "doctorId" | "date" | "weekday" | "timeSlot">
) {
  const dateKey = toDateKey(assignment.date);
  const doctorState = state.get(assignment.doctorId);
  if (!doctorState) {
    return;
  }

  doctorState.total += 1;
  doctorState.workedDates.add(dateKey);
  if (assignment.timeSlot === TIME_SLOT.FULL_DAY) {
    doctorState.fullDay += 1;
  }
  if (assignment.timeSlot === TIME_SLOT.MORNING) {
    doctorState.morning += 1;
  }
  if (assignment.timeSlot === TIME_SLOT.AFTERNOON) {
    doctorState.afternoon += 1;
  }
  if (isWeekend(assignment.weekday)) {
    doctorState.weekend += 1;
  }
  if (isPeakDay(assignment.weekday)) {
    doctorState.peak += 1;
  }

  const key = slotKey(dateKey, assignment.timeSlot);
  if (!takenBySlot.has(key)) {
    takenBySlot.set(key, new Set());
  }
  takenBySlot.get(key)?.add(assignment.doctorId);
}

function scoreDoctor(input: {
  mode: ScheduleModeValue;
  doctor: ScheduleDoctor;
  cell: RequiredScheduleCell;
  state: Map<string, DoctorScoreState>;
}) {
  const doctorState = input.state.get(input.doctor.id);
  if (!doctorState) {
    return Number.NEGATIVE_INFINITY;
  }

  const dateKey = input.cell.dateKey;
  const previousDateKey = toDateKey(addDays(dateKey, -1));
  const nextDateKey = toDateKey(addDays(dateKey, 1));

  // The weights are intentionally simple and visible. Higher score wins.
  // First priority: spread total workload. Then balance weekend/high-peak
  // exposure, avoid consecutive days, and reduce AM/PM imbalance in half-day mode.
  let score = 1000;
  score -= doctorState.total * 90;

  if (isWeekend(input.cell.weekday)) {
    score -= doctorState.weekend * 55;
  }
  if (isPeakDay(input.cell.weekday)) {
    score -= doctorState.peak * 45;
  }

  if (doctorState.workedDates.has(previousDateKey)) {
    score -= 60;
  }
  if (doctorState.workedDates.has(nextDateKey)) {
    score -= 25;
  }

  if (input.mode === SCHEDULE_MODE.HALF_DAY) {
    if (input.cell.timeSlot === TIME_SLOT.MORNING) {
      score += (doctorState.afternoon - doctorState.morning) * 25;
    }
    if (input.cell.timeSlot === TIME_SLOT.AFTERNOON) {
      score += (doctorState.morning - doctorState.afternoon) * 25;
    }
    if (doctorState.workedDates.has(dateKey)) {
      score -= 10;
    }
  }

  return score;
}

function createConflict(cell: RequiredScheduleCell, taskId: string, missingCount: number, description?: string) {
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
      `${cell.dateKey} ${getWeekdayLabel(cell.weekday)} ${SLOT_LABELS[cell.timeSlot]} 单元${cell.roomNumber}缺少 ${missingCount} 人：可用人员不足或所有可用人员已被同一时段安排。`,
    severity: CONFLICT_SEVERITY.ERROR
  } satisfies InMemoryConflict;
}

export async function generateScheduleForTask(taskId: string) {
  const task = await prisma.scheduleTask.findUnique({
    where: { id: taskId },
    include: {
      doctors: true,
      unavailableTimes: true,
      requirements: true,
      assignments: {
        where: { locked: true }
      }
    }
  });

  if (!task) {
    throw new Error("排班任务不存在");
  }

  const doctorState = createInitialDoctorState(task.doctors);
  const takenBySlot = new Map<string, Set<string>>();
  const generatedAssignments: InMemoryAssignment[] = [];
  const conflicts: InMemoryConflict[] = [];

  for (const lockedAssignment of task.assignments) {
    const lockedTimeSlot = asTimeSlot(lockedAssignment.timeSlot);
    recordState(doctorState, takenBySlot, { ...lockedAssignment, timeSlot: lockedTimeSlot });
    if (
      isDoctorUnavailable(
        task.unavailableTimes,
        lockedAssignment.doctorId,
        lockedAssignment.date,
        lockedTimeSlot
      )
    ) {
      const dateKey = toDateKey(lockedAssignment.date);
      conflicts.push({
        scheduleTaskId: task.id,
        date: dateFromKey(dateKey),
        weekday: lockedAssignment.weekday,
        roomNumber: lockedAssignment.roomNumber,
        timeSlot: lockedTimeSlot,
        conflictType: "LOCKED_UNAVAILABLE",
        missingCount: null,
        description: `${dateKey} ${getWeekdayLabel(lockedAssignment.weekday)} ${SLOT_LABELS[lockedTimeSlot]} 单元${lockedAssignment.roomNumber}存在锁定排班，但该人员此时不可用。`,
        severity: CONFLICT_SEVERITY.ERROR
      });
    }
  }

  const taskMode = asScheduleMode(task.mode);
  const requiredCells = requirementsToCells(task.requirements);
  if (requiredCells.length === 0) {
    throw new Error("请先设置至少一个开放单元规则，再生成排班。");
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
        description: `${cell.dateKey} ${getWeekdayLabel(cell.weekday)} ${SLOT_LABELS[cell.timeSlot]} 单元${cell.roomNumber}锁定人数超过需求。`,
        severity: CONFLICT_SEVERITY.WARNING
      });
      continue;
    }

    let assignedCount = lockedInCell.length;
    while (assignedCount < cell.requiredDoctors) {
      const alreadyTaken = takenBySlot.get(slotKey(cell.dateKey, cell.timeSlot)) ?? new Set<string>();
      const candidates = task.doctors
        .filter((doctor) => !alreadyTaken.has(doctor.id))
        .filter((doctor) => !isDoctorUnavailable(task.unavailableTimes, doctor.id, cell.date, cell.timeSlot))
        .map((doctor) => ({
          doctor,
          score: scoreDoctor({ mode: taskMode, doctor, cell, state: doctorState })
        }))
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          return a.doctor.name.localeCompare(b.doctor.name, "zh-Hans-CN");
        });

      const selected = candidates[0]?.doctor;
      if (!selected) {
        const missingCount = cell.requiredDoctors - assignedCount;
        conflicts.push(
          createConflict(
            cell,
            task.id,
            missingCount,
            task.doctors.length === 0
              ? `${cell.dateKey} ${getWeekdayLabel(cell.weekday)} ${SLOT_LABELS[cell.timeSlot]} 单元${cell.roomNumber}缺少 ${missingCount} 人：本次任务没有人员。`
              : `${cell.dateKey} ${getWeekdayLabel(cell.weekday)} ${SLOT_LABELS[cell.timeSlot]} 单元${cell.roomNumber}缺少 ${missingCount} 人：可用人员不足，或所有可用人员已被同一时段安排。`
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
      recordState(doctorState, takenBySlot, assignment);
      assignedCount += 1;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.scheduleConflict.deleteMany({ where: { scheduleTaskId: task.id } });
    await tx.scheduleAssignment.deleteMany({ where: { scheduleTaskId: task.id, locked: false } });

    if (generatedAssignments.length > 0) {
      await tx.scheduleAssignment.createMany({ data: generatedAssignments });
    }
    if (conflicts.length > 0) {
      await tx.scheduleConflict.createMany({ data: conflicts });
    }

    await tx.scheduleTask.update({
      where: { id: task.id },
      data: { status: SCHEDULE_STATUS.GENERATED }
    });
  });

  return getTaskDetail(task.id);
}

export async function rebuildConflictsForTask(taskId: string) {
  const task = await prisma.scheduleTask.findUnique({
    where: { id: taskId },
    include: {
      assignments: true,
      unavailableTimes: true,
      requirements: true
    }
  });

  if (!task) {
    throw new Error("排班任务不存在");
  }

  const conflicts: InMemoryConflict[] = [];
  const requiredCells = requirementsToCells(task.requirements);
  for (const cell of requiredCells) {
    const count = task.assignments.filter(
      (assignment) =>
        toDateKey(assignment.date) === cell.dateKey &&
        asTimeSlot(assignment.timeSlot) === cell.timeSlot &&
        assignment.roomNumber === cell.roomNumber
    ).length;

    if (count < cell.requiredDoctors) {
      conflicts.push(createConflict(cell, task.id, cell.requiredDoctors - count));
    }
    if (count > cell.requiredDoctors) {
      conflicts.push({
        scheduleTaskId: task.id,
        date: dateFromKey(cell.dateKey),
        weekday: cell.weekday,
        roomNumber: cell.roomNumber,
        timeSlot: cell.timeSlot,
        conflictType: "OVERFILLED",
        missingCount: null,
        description: `${cell.dateKey} ${getWeekdayLabel(cell.weekday)} ${SLOT_LABELS[cell.timeSlot]} 单元${cell.roomNumber}超过需求人数，请人工检查。`,
        severity: CONFLICT_SEVERITY.WARNING
      });
    }
  }

  for (const assignment of task.assignments) {
    const dateKey = toDateKey(assignment.date);
    const assignmentTimeSlot = asTimeSlot(assignment.timeSlot);
    const matchingRequirement = requiredCells.find(
      (cell) =>
        cell.dateKey === dateKey &&
        cell.timeSlot === assignmentTimeSlot &&
        cell.roomNumber === assignment.roomNumber
    );
    if (!matchingRequirement) {
      conflicts.push({
        scheduleTaskId: task.id,
        date: dateFromKey(dateKey),
        weekday: assignment.weekday,
        roomNumber: assignment.roomNumber,
        timeSlot: assignmentTimeSlot,
        conflictType: "CLOSED_ROOM",
        missingCount: null,
        description: `${dateKey} ${getWeekdayLabel(assignment.weekday)} 单元${assignment.roomNumber}当天未开放。`,
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
        description: `${dateKey} ${getWeekdayLabel(assignment.weekday)} ${SLOT_LABELS[assignmentTimeSlot]} 单元${assignment.roomNumber}存在不可排班人员。`,
        severity: CONFLICT_SEVERITY.ERROR
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.scheduleConflict.deleteMany({ where: { scheduleTaskId: task.id } });
    if (conflicts.length > 0) {
      await tx.scheduleConflict.createMany({ data: conflicts });
    }
  });

  return getTaskDetail(task.id);
}
