import { isDoctorUnavailable, type UnavailableRecord } from "@/lib/availability";
import { getWeekDates, getWeekdayLabel, toDateKey } from "@/lib/date-utils";
import {
  getExpectedAssignmentCountFromRequirements,
  isPeakDay,
  isWeekend,
  SLOT_LABELS,
  TIME_SLOT,
  type DoctorTypeValue,
  type ScheduleModeValue,
  type ScheduleRequirementLike,
  type TimeSlotValue
} from "@/lib/schedule-rules";

export type DoctorLike = {
  id: string;
  name: string;
  doctorType: DoctorTypeValue;
};

export type AssignmentLike = {
  id: string;
  doctorId: string;
  date: Date | string;
  weekday: number;
  roomNumber: number;
  timeSlot: TimeSlotValue;
  locked: boolean;
};

export type ConflictLike = {
  id: string;
  conflictType: string;
  missingCount?: number | null;
  severity: string;
};

export type DoctorAssignmentSummary = {
  id: string;
  date: string;
  weekday: number;
  weekdayLabel: string;
  timeSlot: TimeSlotValue;
  timeSlotLabel: string;
  roomNumber: number;
  locked: boolean;
};

export type DoctorScheduleStats = {
  doctorId: string;
  name: string;
  doctorType: DoctorTypeValue;
  totalAssignments: number;
  fullDayAssignments: number;
  morningAssignments: number;
  afternoonAssignments: number;
  weekendAssignments: number;
  peakAssignments: number;
  maxConsecutiveDays: number;
  hasConsecutiveWork: boolean;
  unavailableConflictCount: number;
  assignments: DoctorAssignmentSummary[];
};

export type OverallScheduleStats = {
  expectedAssignments: number;
  actualAssignments: number;
  unfilledAssignments: number;
  doctorCount: number;
  averageAssignments: number;
  maxAssignments: number;
  minAssignments: number;
  hasUnfilledRooms: boolean;
  hasConsecutiveWork: boolean;
  hasUnavailableConflicts: boolean;
  hasObviousImbalance: boolean;
  conflictCount: number;
};

export type ScheduleStats = {
  perDoctor: DoctorScheduleStats[];
  overall: OverallScheduleStats;
  warnings: string[];
};

export function calculateScheduleStats(input: {
  mode: ScheduleModeValue;
  weekStartDate: Date | string;
  doctors: DoctorLike[];
  requirements: ScheduleRequirementLike[];
  assignments: AssignmentLike[];
  unavailableTimes: UnavailableRecord[];
  conflicts: ConflictLike[];
}): ScheduleStats {
  const weekDates = getWeekDates(input.weekStartDate);
  const weekDateKeys = weekDates.map((day) => day.dateKey);

  const perDoctorMap = new Map<string, DoctorScheduleStats>();
  for (const doctor of input.doctors) {
    perDoctorMap.set(doctor.id, {
      doctorId: doctor.id,
      name: doctor.name,
      doctorType: doctor.doctorType,
      totalAssignments: 0,
      fullDayAssignments: 0,
      morningAssignments: 0,
      afternoonAssignments: 0,
      weekendAssignments: 0,
      peakAssignments: 0,
      maxConsecutiveDays: 0,
      hasConsecutiveWork: false,
      unavailableConflictCount: 0,
      assignments: []
    });
  }

  const workedDateKeysByDoctor = new Map<string, Set<string>>();

  for (const assignment of input.assignments) {
    const stats = perDoctorMap.get(assignment.doctorId);
    if (!stats) {
      continue;
    }

    const dateKey = toDateKey(assignment.date);
    stats.totalAssignments += 1;
    if (assignment.timeSlot === TIME_SLOT.FULL_DAY) {
      stats.fullDayAssignments += 1;
    }
    if (assignment.timeSlot === TIME_SLOT.MORNING) {
      stats.morningAssignments += 1;
    }
    if (assignment.timeSlot === TIME_SLOT.AFTERNOON) {
      stats.afternoonAssignments += 1;
    }
    if (isWeekend(assignment.weekday)) {
      stats.weekendAssignments += 1;
    }
    if (isPeakDay(assignment.weekday)) {
      stats.peakAssignments += 1;
    }
    if (isDoctorUnavailable(input.unavailableTimes, assignment.doctorId, assignment.date, assignment.timeSlot)) {
      stats.unavailableConflictCount += 1;
    }

    if (!workedDateKeysByDoctor.has(assignment.doctorId)) {
      workedDateKeysByDoctor.set(assignment.doctorId, new Set());
    }
    workedDateKeysByDoctor.get(assignment.doctorId)?.add(dateKey);

    stats.assignments.push({
      id: assignment.id,
      date: dateKey,
      weekday: assignment.weekday,
      weekdayLabel: getWeekdayLabel(assignment.weekday),
      timeSlot: assignment.timeSlot,
      timeSlotLabel: SLOT_LABELS[assignment.timeSlot],
      roomNumber: assignment.roomNumber,
      locked: assignment.locked
    });
  }

  for (const stats of perDoctorMap.values()) {
    const workedDates = workedDateKeysByDoctor.get(stats.doctorId) ?? new Set<string>();
    let current = 0;
    let max = 0;
    for (const dateKey of weekDateKeys) {
      if (workedDates.has(dateKey)) {
        current += 1;
        max = Math.max(max, current);
      } else {
        current = 0;
      }
    }
    stats.maxConsecutiveDays = max;
    stats.hasConsecutiveWork = max >= 2;
    stats.assignments.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      if (a.timeSlot !== b.timeSlot) {
        return a.timeSlot.localeCompare(b.timeSlot);
      }
      return a.roomNumber - b.roomNumber;
    });
  }

  const perDoctor = Array.from(perDoctorMap.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  const totals = perDoctor.map((item) => item.totalAssignments);
  const expectedAssignments = getExpectedAssignmentCountFromRequirements(input.requirements);
  const actualAssignments = input.assignments.length;
  const doctorCount = input.doctors.length;
  const maxAssignments = totals.length ? Math.max(...totals) : 0;
  const minAssignments = totals.length ? Math.min(...totals) : 0;
  const missingFromConflicts = input.conflicts
    .filter((item) => item.conflictType === "UNFILLED")
    .reduce((sum, item) => sum + (item.missingCount ?? 0), 0);
  const unfilledAssignments = missingFromConflicts || Math.max(0, expectedAssignments - actualAssignments);
  const hasUnavailableConflicts = perDoctor.some((item) => item.unavailableConflictCount > 0);
  const hasConsecutiveWork = perDoctor.some((item) => item.hasConsecutiveWork);
  const hasObviousImbalance = doctorCount > 1 && maxAssignments - minAssignments >= 3;

  const warnings: string[] = [];
  if (unfilledAssignments > 0) {
    warnings.push(`存在未排满班次，缺少 ${unfilledAssignments} 个医生班次。`);
  }
  if (hasUnavailableConflicts) {
    warnings.push("存在医生被安排到不可排班时间，请检查手动调整结果。");
  }
  if (hasConsecutiveWork) {
    warnings.push("存在连续上班医生，建议人工复核。");
  }
  if (hasObviousImbalance) {
    warnings.push(`医生工作量不均衡，最高 ${maxAssignments} 次，最低 ${minAssignments} 次。`);
  }

  return {
    perDoctor,
    overall: {
      expectedAssignments,
      actualAssignments,
      unfilledAssignments,
      doctorCount,
      averageAssignments: doctorCount ? Number((actualAssignments / doctorCount).toFixed(2)) : 0,
      maxAssignments,
      minAssignments,
      hasUnfilledRooms: unfilledAssignments > 0 || input.conflicts.some((item) => item.conflictType === "UNFILLED"),
      hasConsecutiveWork,
      hasUnavailableConflicts,
      hasObviousImbalance,
      conflictCount: input.conflicts.length
    },
    warnings
  };
}
