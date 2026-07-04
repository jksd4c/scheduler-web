import { isDoctorUnavailable, type UnavailableRecord } from "@/lib/availability";
import { addDays, getDateRangeDates, getWeekDates, getWeekdayLabel, toDateKey } from "@/lib/date-utils";
import { normalizePreferredShiftType, normalizePreferenceStrength, preferenceLabel, preferenceSatisfaction } from "@/lib/preferences";
import {
  getExpectedAssignmentCountFromRequirements,
  isPeakDay,
  isWeekend,
  SLOT_LABELS,
  TIME_SLOT,
  requirementsToCells,
  type DoctorTypeValue,
  type ScheduleModeValue,
  type ScheduleRequirementLike,
  type TimeSlotValue
} from "@/lib/schedule-rules";
import { parseEffectivePolicy, parseTagSnapshot, SHIFT_TAG_REQUIREMENT, SHIFT_TYPE_CATEGORY, STAFF_SCHEDULING_MODE, summarizeEligibility } from "@/lib/staff-policy";

export type DoctorLike = {
  id: string;
  name: string;
  doctorType: DoctorTypeValue;
  active?: boolean;
  tagSnapshotJson?: unknown;
  policySnapshotJson?: unknown;
  preferredShiftType?: string | null;
  preferenceStrength?: string | null;
  preferenceNote?: string | null;
};

export type FairnessGroupMember = {
  doctorId: string;
  name: string;
  totalAssignments: number;
  workloadTotal: number;
  nightShiftAssignments: number;
  secondLineAssignments: number;
  reason: string;
};

export type AssignmentLike = {
  id: string;
  doctorId: string;
  date: Date | string;
  weekday: number;
  roomNumber: number;
  timeSlot: TimeSlotValue;
  locked: boolean;
  manualOverride?: boolean;
  overrideReason?: string | null;
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
  weekendDayAssignments: number;
  holidayAssignments: number;
  holidayDayAssignments: number;
  makeupWorkdayAssignments: number;
  customRestAssignments: number;
  customSpecialAssignments: number;
  weekendNightAssignments: number;
  holidayNightAssignments: number;
  postNightAssignments: number;
  saturdayNightAssignments: number;
  sundayNightAssignments: number;
  goldenNightAssignments: number;
  highBurdenNightAssignments: number;
  peakAssignments: number;
  maxConsecutiveDays: number;
  hasConsecutiveWork: boolean;
  unavailableConflictCount: number;
  tagNames: string[];
  eligibilitySummary: string;
  dayShiftAssignments: number;
  nightShiftAssignments: number;
  firstLineAssignments: number;
  secondLineAssignments: number;
  emergencyAssignments: number;
  onCallAssignments: number;
  backupAssignments: number;
  workloadTotal: number;
  targetWorkloadFactor: number;
  manualOverrideAssignments: number;
  preferredShiftType: string;
  preferenceStrength: string;
  preferenceNote?: string | null;
  preferenceLabel: string;
  preferenceSatisfaction: string;
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
  fairnessSpreads: {
    totalShiftSpread: number;
    workloadSpread: number;
    nightShiftSpread: number;
    postNightSpread: number;
    weekendDaySpread: number;
    weekendNightSpread: number;
    holidayDaySpread: number;
    holidayNightSpread: number;
  };
  conflictCount: number;
};

export type ScheduleStats = {
  perDoctor: DoctorScheduleStats[];
  overall: OverallScheduleStats;
  warnings: string[];
  fairnessGroups: {
    comparable: {
      memberCount: number;
      spreads: OverallScheduleStats["fairnessSpreads"];
      members: FairnessGroupMember[];
      explanation: string;
    };
    excluded: FairnessGroupMember[];
    limited: FairnessGroupMember[];
    scarce: FairnessGroupMember[];
    explanations: string[];
  };
  identityGroups: Array<{
    tagName: string;
    memberCount: number;
    totalAssignments: number;
    nightAssignments: number;
    secondLineAssignments: number;
  }>;
};

export function calculateScheduleStats(input: {
  mode: ScheduleModeValue;
  weekStartDate?: Date | string;
  startDate?: Date | string;
  endDate?: Date | string;
  doctors: DoctorLike[];
  requirements: ScheduleRequirementLike[];
  assignments: AssignmentLike[];
  unavailableTimes: UnavailableRecord[];
  conflicts: ConflictLike[];
  specialDateTypes?: Record<string, string> | Map<string, string>;
}): ScheduleStats {
  const rangeDates =
    input.startDate && input.endDate
      ? getDateRangeDates(input.startDate, input.endDate)
      : getWeekDates(input.weekStartDate ?? new Date());
  const rangeDateKeys = rangeDates.map((day) => day.dateKey);
  const specialDateTypes = normalizeSpecialDateTypes(input.specialDateTypes);

  const perDoctorMap = new Map<string, DoctorScheduleStats>();
  const doctorMetaById = new Map(
    input.doctors.map((doctor) => [
      doctor.id,
      {
        active: doctor.active !== false,
        tags: parseTagSnapshot(doctor.tagSnapshotJson),
        policy: parseEffectivePolicy(doctor.policySnapshotJson)
      }
    ])
  );
  for (const doctor of input.doctors) {
    const meta = doctorMetaById.get(doctor.id)!;
    const tags = meta.tags;
    const policy = meta.policy;
    perDoctorMap.set(doctor.id, {
      doctorId: doctor.id,
      name: doctor.name,
      doctorType: doctor.doctorType,
      totalAssignments: 0,
      fullDayAssignments: 0,
      morningAssignments: 0,
      afternoonAssignments: 0,
      weekendAssignments: 0,
      weekendDayAssignments: 0,
      holidayAssignments: 0,
      holidayDayAssignments: 0,
      makeupWorkdayAssignments: 0,
      customRestAssignments: 0,
      customSpecialAssignments: 0,
      weekendNightAssignments: 0,
      holidayNightAssignments: 0,
      postNightAssignments: 0,
      saturdayNightAssignments: 0,
      sundayNightAssignments: 0,
      goldenNightAssignments: 0,
      highBurdenNightAssignments: 0,
      peakAssignments: 0,
      maxConsecutiveDays: 0,
      hasConsecutiveWork: false,
      unavailableConflictCount: 0,
      tagNames: tags.map((tag) => tag.name),
      eligibilitySummary: summarizeEligibility(policy),
      dayShiftAssignments: 0,
      nightShiftAssignments: 0,
      firstLineAssignments: 0,
      secondLineAssignments: 0,
      emergencyAssignments: 0,
      onCallAssignments: 0,
      backupAssignments: 0,
      workloadTotal: 0,
      targetWorkloadFactor: policy.workloadFactor,
      manualOverrideAssignments: 0,
      preferredShiftType: normalizePreferredShiftType(doctor.preferredShiftType),
      preferenceStrength: normalizePreferenceStrength(doctor.preferenceStrength),
      preferenceNote: doctor.preferenceNote ?? null,
      preferenceLabel: preferenceLabel(doctor.preferredShiftType, doctor.preferenceStrength),
      preferenceSatisfaction: "无偏好",
      assignments: []
    });
  }

  const workedDateKeysByDoctor = new Map<string, Set<string>>();
  const requirementCells = requirementsToCells(input.requirements);
  const shiftDemandById = new Map<
    string,
    {
      shiftTypeId: string;
      name: string;
      category: string;
      isNight: boolean;
      demand: number;
      cells: typeof requirementCells;
    }
  >();
  for (const cell of requirementCells) {
    if (!cell.shiftTypeId) continue;
    const existing = shiftDemandById.get(cell.shiftTypeId) ?? {
      shiftTypeId: cell.shiftTypeId,
      name: cell.shiftType?.name ?? "未命名班次",
      category: cell.shiftType?.category ?? "",
      isNight: Boolean(cell.shiftType?.isNight) || cell.shiftType?.category === SHIFT_TYPE_CATEGORY.NIGHT,
      demand: 0,
      cells: [] as typeof requirementCells
    };
    existing.demand += cell.requiredDoctors;
    existing.cells.push(cell);
    shiftDemandById.set(cell.shiftTypeId, existing);
  }
  const shiftAssignmentsByDoctor = new Map<string, Map<string, number>>();

  for (const assignment of input.assignments) {
    const stats = perDoctorMap.get(assignment.doctorId);
    if (!stats) {
      continue;
    }

    const dateKey = toDateKey(assignment.date);
    const effectiveDateType = getEffectiveDateType(dateKey, assignment.weekday, specialDateTypes);
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
    if (effectiveDateType === "WEEKEND") {
      stats.weekendAssignments += 1;
    }
    if (effectiveDateType === "PUBLIC_HOLIDAY") stats.holidayAssignments += 1;
    if (effectiveDateType === "MAKEUP_WORKDAY") stats.makeupWorkdayAssignments += 1;
    if (effectiveDateType === "CUSTOM_REST_DAY") stats.customRestAssignments += 1;
    if (effectiveDateType === "CUSTOM_SPECIAL_DAY") stats.customSpecialAssignments += 1;
    if (isPeakDay(assignment.weekday)) {
      stats.peakAssignments += 1;
    }
    if (isDoctorUnavailable(input.unavailableTimes, assignment.doctorId, assignment.date, assignment.timeSlot)) {
      stats.unavailableConflictCount += 1;
    }
    const matchingCell = requirementCells.find(
      (cell) => cell.dateKey === dateKey && cell.timeSlot === assignment.timeSlot && cell.roomNumber === assignment.roomNumber
    );
    if (matchingCell?.shiftTypeId) {
      const doctorShiftMap = shiftAssignmentsByDoctor.get(assignment.doctorId) ?? new Map<string, number>();
      doctorShiftMap.set(matchingCell.shiftTypeId, (doctorShiftMap.get(matchingCell.shiftTypeId) ?? 0) + 1);
      shiftAssignmentsByDoctor.set(assignment.doctorId, doctorShiftMap);
    }
    const category = matchingCell?.shiftType?.category ?? "";
    const isNightShift = Boolean(matchingCell?.shiftType?.isNight) || category === SHIFT_TYPE_CATEGORY.NIGHT;
    if (isNightShift) {
      stats.nightShiftAssignments += 1;
      if (effectiveDateType === "WEEKEND") stats.weekendNightAssignments += 1;
      if (effectiveDateType === "PUBLIC_HOLIDAY") stats.holidayNightAssignments += 1;
      if (assignment.weekday === 6 && effectiveDateType !== "MAKEUP_WORKDAY") stats.saturdayNightAssignments += 1;
      if (assignment.weekday === 7 && effectiveDateType !== "MAKEUP_WORKDAY") stats.sundayNightAssignments += 1;
      if (causesPostNightRecovery(dateKey, specialDateTypes)) stats.postNightAssignments += 1;
      if (assignment.weekday === 4 && causesPostNightRecovery(dateKey, specialDateTypes)) stats.goldenNightAssignments += 1;
      if (effectiveDateType === "WEEKEND" || effectiveDateType === "PUBLIC_HOLIDAY") stats.highBurdenNightAssignments += 1;
    } else {
      stats.dayShiftAssignments += 1;
      if (effectiveDateType === "WEEKEND") stats.weekendDayAssignments += 1;
      if (effectiveDateType === "PUBLIC_HOLIDAY") stats.holidayDayAssignments += 1;
    }
    if (category === SHIFT_TYPE_CATEGORY.FIRST_LINE) stats.firstLineAssignments += 1;
    if (category === SHIFT_TYPE_CATEGORY.SECOND_LINE) stats.secondLineAssignments += 1;
    if (category === SHIFT_TYPE_CATEGORY.EMERGENCY) stats.emergencyAssignments += 1;
    if (category === SHIFT_TYPE_CATEGORY.ON_CALL) stats.onCallAssignments += 1;
    if (category === SHIFT_TYPE_CATEGORY.BACKUP) stats.backupAssignments += 1;
    stats.workloadTotal += Number(matchingCell?.shiftType?.workloadWeight ?? 1) || 1;
    if (assignment.manualOverride) {
      stats.manualOverrideAssignments += 1;
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
    for (const dateKey of rangeDateKeys) {
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
    stats.preferenceLabel = preferenceLabel(stats.preferredShiftType, stats.preferenceStrength);
    stats.preferenceSatisfaction = preferenceSatisfaction({
      preferredShiftType: stats.preferredShiftType,
      preferenceStrength: stats.preferenceStrength,
      dayShiftAssignments: stats.dayShiftAssignments,
      nightShiftAssignments: stats.nightShiftAssignments
    });
  }

  const perDoctor = Array.from(perDoctorMap.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  const totals = perDoctor.map((item) => item.totalAssignments);
  const expectedAssignments = getExpectedAssignmentCountFromRequirements(input.requirements);
  const actualAssignments = input.assignments.length;
  const doctorCount = input.doctors.length;
  const maxAssignments = totals.length ? Math.max(...totals) : 0;
  const minAssignments = totals.length ? Math.min(...totals) : 0;
  const scarcity = buildScarcityReasons({
    doctors: input.doctors,
    doctorMetaById,
    shiftDemandById,
    shiftAssignmentsByDoctor
  });
  const fairnessGroups = buildFairnessGroups({
    perDoctor,
    doctors: input.doctors,
    doctorMetaById,
    scarceReasonByDoctorId: scarcity.scarceReasonByDoctorId,
    scarcityExplanations: scarcity.explanations
  });
  const comparableStats = fairnessGroups.comparable.members
    .map((member) => perDoctorMap.get(member.doctorId))
    .filter(Boolean) as DoctorScheduleStats[];
  const comparableTotals = comparableStats.map((item) => item.totalAssignments);
  const comparableMaxAssignments = comparableTotals.length ? Math.max(...comparableTotals) : 0;
  const comparableMinAssignments = comparableTotals.length ? Math.min(...comparableTotals) : 0;
  const fairnessSpreads = {
    totalShiftSpread: spread(comparableStats.map((item) => item.totalAssignments)),
    workloadSpread: spread(comparableStats.map((item) => item.workloadTotal)),
    nightShiftSpread: spread(comparableStats.map((item) => item.nightShiftAssignments)),
    postNightSpread: spread(comparableStats.map((item) => item.postNightAssignments)),
    weekendDaySpread: spread(comparableStats.map((item) => item.weekendDayAssignments)),
    weekendNightSpread: spread(comparableStats.map((item) => item.weekendNightAssignments)),
    holidayDaySpread: spread(comparableStats.map((item) => item.holidayDayAssignments)),
    holidayNightSpread: spread(comparableStats.map((item) => item.holidayNightAssignments))
  };
  fairnessGroups.comparable.spreads = fairnessSpreads;
  const missingFromConflicts = input.conflicts
    .filter((item) => item.conflictType === "UNFILLED")
    .reduce((sum, item) => sum + (item.missingCount ?? 0), 0);
  const unfilledAssignments = missingFromConflicts || Math.max(0, expectedAssignments - actualAssignments);
  const hasUnavailableConflicts = perDoctor.some((item) => item.unavailableConflictCount > 0);
  const hasConsecutiveWork = perDoctor.some((item) => item.hasConsecutiveWork);
  const hasObviousImbalance =
    comparableStats.length > 1 &&
    (fairnessSpreads.totalShiftSpread >= 2 ||
      fairnessSpreads.workloadSpread >= 2 ||
      fairnessSpreads.nightShiftSpread >= 2 ||
      fairnessSpreads.postNightSpread >= 2 ||
      fairnessSpreads.weekendDaySpread >= 2 ||
      fairnessSpreads.weekendNightSpread >= 2 ||
      fairnessSpreads.holidayDaySpread >= 2 ||
      fairnessSpreads.holidayNightSpread >= 2);
  const identityGroups = buildIdentityGroups(perDoctor);

  const warnings: string[] = [];
  if (unfilledAssignments > 0) {
    warnings.push(`存在未排满班次，缺少 ${unfilledAssignments} 个人员班次。`);
  }
  if (hasUnavailableConflicts) {
    warnings.push("存在人员被安排到不可排班时间，请检查手动调整结果。");
  }
  if (hasConsecutiveWork) {
    warnings.push("存在连续上班人员，建议人工复核。");
  }
  if (fairnessGroups.excluded.length) {
    warnings.push(`有 ${fairnessGroups.excluded.length} 名人员按身份策略或启用状态不参与自动排班，未计入普通公平差异。`);
  }
  if (fairnessGroups.limited.length) {
    warnings.push(`有 ${fairnessGroups.limited.length} 名人员设置了目标班次、上限、减少排班或不计入公平，应按身份策略单独解释。`);
  }
  if (fairnessGroups.scarce.length) {
    warnings.push(`有 ${fairnessGroups.scarce.length} 名人员属于资格稀缺班次人员，对应班次应在具备资格人员中单独比较。`);
  }
  for (const explanation of fairnessGroups.explanations) {
    warnings.push(explanation);
  }
  if (perDoctor.some((item) => item.manualOverrideAssignments > 0)) {
    warnings.push("存在管理员强制覆盖排班，公平统计需结合覆盖原因复核。");
  }
  if (hasObviousImbalance) {
    warnings.push("可比较公平参与人员存在明显不均衡，建议重新生成或手动调整。");
    if (fairnessSpreads.totalShiftSpread >= 2) warnings.push(`公平参与人员总班次数差异 ${fairnessSpreads.totalShiftSpread} 次，最高 ${comparableMaxAssignments} 次，最低 ${comparableMinAssignments} 次。`);
    if (fairnessSpreads.workloadSpread >= 2) warnings.push(`总工作量差异 ${fairnessSpreads.workloadSpread.toFixed(1)}。`);
    if (fairnessSpreads.nightShiftSpread >= 2) warnings.push(`夜班次数差异 ${fairnessSpreads.nightShiftSpread} 次。`);
    if (fairnessSpreads.postNightSpread >= 2) warnings.push(`下夜班次数差异 ${fairnessSpreads.postNightSpread} 次。`);
    if (fairnessSpreads.weekendDaySpread >= 2) warnings.push(`周末白班次数差异 ${fairnessSpreads.weekendDaySpread} 次。`);
    if (fairnessSpreads.weekendNightSpread >= 2) warnings.push(`周末夜班次数差异 ${fairnessSpreads.weekendNightSpread} 次。`);
    if (fairnessSpreads.holidayDaySpread >= 2) warnings.push(`节假日白班次数差异 ${fairnessSpreads.holidayDaySpread} 次。`);
    if (fairnessSpreads.holidayNightSpread >= 2) warnings.push(`节假日夜班次数差异 ${fairnessSpreads.holidayNightSpread} 次。`);
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
      fairnessSpreads,
      conflictCount: input.conflicts.length
    },
    warnings,
    fairnessGroups,
    identityGroups
  };
}

function buildIdentityGroups(perDoctor: DoctorScheduleStats[]) {
  const map = new Map<
    string,
    {
      tagName: string;
      memberIds: Set<string>;
      totalAssignments: number;
      nightAssignments: number;
      secondLineAssignments: number;
    }
  >();
  for (const doctor of perDoctor) {
    for (const tagName of doctor.tagNames) {
      if (!map.has(tagName)) {
        map.set(tagName, {
          tagName,
          memberIds: new Set(),
          totalAssignments: 0,
          nightAssignments: 0,
          secondLineAssignments: 0
        });
      }
      const group = map.get(tagName)!;
      group.memberIds.add(doctor.doctorId);
      group.totalAssignments += doctor.totalAssignments;
      group.nightAssignments += doctor.nightShiftAssignments;
      group.secondLineAssignments += doctor.secondLineAssignments;
    }
  }
  return Array.from(map.values())
    .map((group) => ({
      tagName: group.tagName,
      memberCount: group.memberIds.size,
      totalAssignments: group.totalAssignments,
      nightAssignments: group.nightAssignments,
      secondLineAssignments: group.secondLineAssignments
    }))
    .sort((a, b) => a.tagName.localeCompare(b.tagName, "zh-Hans-CN"));
}

function buildScarcityReasons(input: {
  doctors: DoctorLike[];
  doctorMetaById: Map<string, { active: boolean; tags: ReturnType<typeof parseTagSnapshot>; policy: ReturnType<typeof parseEffectivePolicy> }>;
  shiftDemandById: Map<
    string,
    {
      shiftTypeId: string;
      name: string;
      category: string;
      isNight: boolean;
      demand: number;
      cells: ReturnType<typeof requirementsToCells>;
    }
  >;
  shiftAssignmentsByDoctor: Map<string, Map<string, number>>;
}) {
  const scarceReasonByDoctorId = new Map<string, string[]>();
  const explanations: string[] = [];

  for (const shift of input.shiftDemandById.values()) {
    const hasExplicitQualificationRule = shift.cells.some((cell) => Boolean(cell.shiftType?.requiredTags?.length));
    const shouldInspectScarcity =
      shift.category === SHIFT_TYPE_CATEGORY.SECOND_LINE ||
      shift.category === SHIFT_TYPE_CATEGORY.FIRST_LINE ||
      shift.isNight ||
      hasExplicitQualificationRule;
    if (!shouldInspectScarcity) continue;

    const eligibleDoctors = input.doctors.filter((doctor) => {
      const meta = input.doctorMetaById.get(doctor.id);
      return meta ? shift.cells.some((cell) => isDoctorEligibleForFairnessCell(doctor, meta, cell)) : false;
    });
    if (eligibleDoctors.length === 0 || eligibleDoctors.length > 2 || shift.demand <= eligibleDoctors.length) continue;

    const explanation = `${shift.name}仅 ${eligibleDoctors.length} 名合格人员，需求 ${shift.demand} 人次；该班次应在具备资格人员中单独比较。`;
    explanations.push(explanation);
    for (const doctor of eligibleDoctors) {
      const assignedCount = input.shiftAssignmentsByDoctor.get(doctor.id)?.get(shift.shiftTypeId) ?? 0;
      if (assignedCount <= 0) continue;
      const reasons = scarceReasonByDoctorId.get(doctor.id) ?? [];
      reasons.push(explanation);
      scarceReasonByDoctorId.set(doctor.id, reasons);
    }
  }

  return {
    scarceReasonByDoctorId,
    explanations: Array.from(new Set(explanations))
  };
}

function buildFairnessGroups(input: {
  perDoctor: DoctorScheduleStats[];
  doctors: DoctorLike[];
  doctorMetaById: Map<string, { active: boolean; tags: ReturnType<typeof parseTagSnapshot>; policy: ReturnType<typeof parseEffectivePolicy> }>;
  scarceReasonByDoctorId: Map<string, string[]>;
  scarcityExplanations: string[];
}) {
  const doctorsById = new Map(input.doctors.map((doctor) => [doctor.id, doctor]));
  const comparableMembers: FairnessGroupMember[] = [];
  const excluded: FairnessGroupMember[] = [];
  const limited: FairnessGroupMember[] = [];
  const scarce: FairnessGroupMember[] = [];

  for (const stats of input.perDoctor) {
    const doctor = doctorsById.get(stats.doctorId);
    const meta = input.doctorMetaById.get(stats.doctorId);
    if (!doctor || !meta) continue;

    if (!meta.active) {
      excluded.push(buildFairnessGroupMember(stats, "人员未启用，不参与自动排班。"));
      continue;
    }
    if (!meta.policy.participatesInScheduling || meta.policy.schedulingMode === STAFF_SCHEDULING_MODE.EXCLUDED) {
      excluded.push(buildFairnessGroupMember(stats, "身份策略设置为不参与排班，未计入普通公平差异。"));
      continue;
    }

    const scarceReasons = input.scarceReasonByDoctorId.get(stats.doctorId);
    if (scarceReasons?.length) {
      scarce.push(buildFairnessGroupMember(stats, Array.from(new Set(scarceReasons)).join(" ")));
      continue;
    }

    const limitedReason = getLimitedPolicyReason(meta.policy);
    if (limitedReason) {
      limited.push(buildFairnessGroupMember(stats, limitedReason));
      continue;
    }

    comparableMembers.push(buildFairnessGroupMember(stats, "参与普通公平比较。"));
  }

  return {
    comparable: {
      memberCount: comparableMembers.length,
      spreads: emptyFairnessSpreads(),
      members: comparableMembers,
      explanation: "普通公平差异只比较同一任务中启用、参与排班、未设置优待/限额、且不属于资格稀缺班次解释范围的人员。"
    },
    excluded,
    limited,
    scarce,
    explanations: input.scarcityExplanations
  };
}

function buildFairnessGroupMember(stats: DoctorScheduleStats, reason: string): FairnessGroupMember {
  return {
    doctorId: stats.doctorId,
    name: stats.name,
    totalAssignments: stats.totalAssignments,
    workloadTotal: stats.workloadTotal,
    nightShiftAssignments: stats.nightShiftAssignments,
    secondLineAssignments: stats.secondLineAssignments,
    reason
  };
}

function getLimitedPolicyReason(policy: ReturnType<typeof parseEffectivePolicy>) {
  const reasons: string[] = [];
  if (policy.schedulingMode === STAFF_SCHEDULING_MODE.REDUCED) reasons.push("减少排班");
  if (policy.schedulingMode === STAFF_SCHEDULING_MODE.FIXED_TARGET) reasons.push(`固定目标 ${policy.targetShiftsPerPeriod ?? "未设置"} 次`);
  if (policy.schedulingMode === STAFF_SCHEDULING_MODE.MAX_LIMIT) reasons.push(`最大上限 ${policy.maxShiftsPerPeriod ?? "未设置"} 次`);
  if (policy.targetShiftsPerPeriod != null) reasons.push(`目标班次 ${policy.targetShiftsPerPeriod} 次`);
  if (policy.maxShiftsPerPeriod != null) reasons.push(`班次上限 ${policy.maxShiftsPerPeriod} 次`);
  if (policy.workloadFactor < 0.99) reasons.push(`工作量系数 ${policy.workloadFactor}`);
  if (!policy.countInFairness) reasons.push("不计入普通公平统计");
  return reasons.length ? `身份策略：${Array.from(new Set(reasons)).join("，")}。` : "";
}

function isDoctorEligibleForFairnessCell(
  doctor: DoctorLike,
  meta: { active: boolean; tags: ReturnType<typeof parseTagSnapshot>; policy: ReturnType<typeof parseEffectivePolicy> },
  cell: ReturnType<typeof requirementsToCells>[number]
) {
  if (!meta.active) return false;
  if (!meta.policy.participatesInScheduling || meta.policy.schedulingMode === STAFF_SCHEDULING_MODE.EXCLUDED) return false;

  const tagIds = new Set(meta.tags.map((tag) => tag.id));
  const rules = cell.shiftType?.requiredTags ?? [];
  for (const rule of rules.filter((item) => item.requirementType === SHIFT_TAG_REQUIREMENT.FORBIDDEN)) {
    if (tagIds.has(rule.staffTagId)) return false;
  }
  for (const rule of rules.filter((item) => item.requirementType === SHIFT_TAG_REQUIREMENT.REQUIRED)) {
    if (!tagIds.has(rule.staffTagId)) return false;
  }
  const allowed = rules.filter((item) => item.requirementType === SHIFT_TAG_REQUIREMENT.ALLOWED);
  if (allowed.length && !allowed.some((rule) => tagIds.has(rule.staffTagId))) return false;

  const category = cell.shiftType?.category ?? "";
  const isNightShift = Boolean(cell.shiftType?.isNight) || category === SHIFT_TYPE_CATEGORY.NIGHT;
  if (isNightShift && meta.policy.canWorkNightShift === false) return false;
  if (!isNightShift && meta.policy.canWorkDayShift === false) return false;
  if (category === SHIFT_TYPE_CATEGORY.FIRST_LINE && meta.policy.canWorkFirstLine === false) return false;
  if (category === SHIFT_TYPE_CATEGORY.SECOND_LINE && meta.policy.canWorkSecondLine === false) return false;
  if (category === SHIFT_TYPE_CATEGORY.EMERGENCY && meta.policy.canWorkEmergency === false) return false;
  if (category === SHIFT_TYPE_CATEGORY.ON_CALL && meta.policy.canWorkOnCall === false) return false;
  if (category === SHIFT_TYPE_CATEGORY.BACKUP && meta.policy.canWorkBackup === false) return false;

  void doctor;
  return true;
}

function emptyFairnessSpreads(): OverallScheduleStats["fairnessSpreads"] {
  return {
    totalShiftSpread: 0,
    workloadSpread: 0,
    nightShiftSpread: 0,
    postNightSpread: 0,
    weekendDaySpread: 0,
    weekendNightSpread: 0,
    holidayDaySpread: 0,
    holidayNightSpread: 0
  };
}

function normalizeSpecialDateTypes(input?: Record<string, string> | Map<string, string>) {
  const output = new Map<string, string>();
  if (!input) return output;
  const entries = input instanceof Map ? Array.from(input.entries()) : Object.entries(input);
  for (const [dateKey, rawType] of entries) {
    const type = normalizeSpecialDateType(rawType);
    if (type) {
      output.set(dateKey, type);
    }
  }
  return output;
}

function getEffectiveDateType(dateKey: string, weekday: number, specialDateTypes: Map<string, string>) {
  const specialType = normalizeSpecialDateType(specialDateTypes.get(dateKey));
  if (specialType) return specialType;
  return isWeekend(weekday) ? "WEEKEND" : "WORKDAY";
}

function causesPostNightRecovery(nightDateKey: string, specialDateTypes: Map<string, string>) {
  const nextDateKey = toDateKey(addDays(nightDateKey, 1));
  const nextWeekday = weekdayFromDateKey(nextDateKey);
  const nextType = getEffectiveDateType(nextDateKey, nextWeekday, specialDateTypes);
  return nextType === "WORKDAY" || nextType === "MAKEUP_WORKDAY";
}

function weekdayFromDateKey(dateKey: string) {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function spread(values: number[]) {
  if (!values.length) return 0;
  return Number((Math.max(...values) - Math.min(...values)).toFixed(2));
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
