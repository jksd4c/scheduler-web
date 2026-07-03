export type ScheduleMode = "FULL_DAY" | "HALF_DAY";
export type TaskScheduleMode = "WARD_SHIFT" | "MEDTECH_ROOM" | "CUSTOM";
export type ScheduleStatus = "DRAFT" | "RULES_SET" | "PREVIEW" | "GENERATED" | "PUBLISHED" | "LOCKED";
export type SchedulePeriodType = "DAYS_7" | "DAYS_30" | "CALENDAR_MONTH" | "QUARTER" | "YEAR" | "CUSTOM";
export type DoctorType = "RESIDENT" | "INTERN";
export type TimeSlot = "FULL_DAY" | "MORNING" | "AFTERNOON";
export type ConflictSeverity = "INFO" | "WARNING" | "ERROR";

export type ApiDoctor = {
  id: string;
  scheduleTaskId: string;
  staffProfileId?: string | null;
  name: string;
  doctorType: DoctorType;
  active?: boolean;
  tagSnapshotJson?: unknown;
  policySnapshotJson?: unknown;
  createdAt: string;
};

export type ApiUnavailableTime = {
  id: string;
  scheduleTaskId: string;
  doctorId: string;
  date: string;
  weekday: number;
  timeSlot: TimeSlot;
  reason: string | null;
  createdAt: string;
};

export type ApiRequirement = {
  id: string;
  scheduleTaskId: string;
  date: string;
  weekday: number;
  timeSlot: TimeSlot;
  shiftTypeId?: string | null;
  shiftType?: {
    id: string;
    name: string;
    category: string;
    isNight: boolean;
    workloadWeight: number;
    requiredTags?: Array<{
      id: string;
      staffTagId: string;
      requirementType: string;
      staffTag?: {
        id: string;
        name: string;
      } | null;
    }>;
  } | null;
  enabled: boolean;
  roomNumber: number;
  requiredDoctors: number;
  createdAt: string;
  updatedAt: string;
};

export type ApiAssignment = {
  id: string;
  scheduleTaskId: string;
  date: string;
  weekday: number;
  roomNumber: number;
  timeSlot: TimeSlot;
  doctorId: string;
  doctor: ApiDoctor;
  locked: boolean;
  manualOverride?: boolean;
  overrideReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiConflict = {
  id: string;
  scheduleTaskId: string;
  date: string;
  weekday: number;
  roomNumber: number;
  timeSlot: TimeSlot;
  conflictType: string;
  missingCount: number | null;
  description: string;
  severity: ConflictSeverity;
  createdAt: string;
};

export type DoctorStats = {
  doctorId: string;
  name: string;
  doctorType: DoctorType;
  totalAssignments: number;
  fullDayAssignments: number;
  morningAssignments: number;
  afternoonAssignments: number;
  weekendAssignments: number;
  holidayAssignments?: number;
  makeupWorkdayAssignments?: number;
  customRestAssignments?: number;
  customSpecialAssignments?: number;
  weekendNightAssignments?: number;
  holidayNightAssignments?: number;
  saturdayNightAssignments?: number;
  sundayNightAssignments?: number;
  peakAssignments: number;
  maxConsecutiveDays: number;
  hasConsecutiveWork: boolean;
  unavailableConflictCount: number;
  tagNames?: string[];
  eligibilitySummary?: string;
  dayShiftAssignments?: number;
  nightShiftAssignments?: number;
  firstLineAssignments?: number;
  secondLineAssignments?: number;
  emergencyAssignments?: number;
  onCallAssignments?: number;
  backupAssignments?: number;
  workloadTotal?: number;
  targetWorkloadFactor?: number;
  assignments: Array<{
    id: string;
    date: string;
    weekday: number;
    weekdayLabel: string;
    timeSlot: TimeSlot;
    timeSlotLabel: string;
    roomNumber: number;
    locked: boolean;
    manualOverride?: boolean;
    overrideReason?: string | null;
  }>;
};

export type ScheduleStats = {
  perDoctor: DoctorStats[];
  overall: {
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
  warnings: string[];
  identityGroups?: Array<{
    tagName: string;
    memberCount: number;
    totalAssignments: number;
    nightAssignments: number;
    secondLineAssignments: number;
  }>;
};

export type ApiTaskDetail = {
  id: string;
  name?: string | null;
  startDate: string;
  endDate: string;
  periodType: SchedulePeriodType;
  weekStartDate: string;
  weekEndDate: string;
  mode: ScheduleMode;
  scheduleMode: TaskScheduleMode;
  status: ScheduleStatus;
  doctors: ApiDoctor[];
  unavailableTimes: ApiUnavailableTime[];
  requirements: ApiRequirement[];
  assignments: ApiAssignment[];
  conflicts: ApiConflict[];
  stats: ScheduleStats;
  createdAt: string;
  updatedAt: string;
};

export type ApiTaskListItem = {
  id: string;
  name?: string | null;
  department?: {
    id: string;
    name: string;
    isActive?: boolean;
  } | null;
  unit?: {
    id: string;
    name: string;
    isActive?: boolean;
  } | null;
  startDate: string;
  endDate: string;
  periodType: SchedulePeriodType;
  weekStartDate: string;
  weekEndDate: string;
  mode: ScheduleMode;
  scheduleMode: TaskScheduleMode;
  status: ScheduleStatus;
  createdAt: string;
  updatedAt: string;
  _count: {
    doctors: number;
    assignments: number;
    conflicts: number;
  };
};

export const DOCTOR_TYPE_LABEL: Record<DoctorType, string> = {
  RESIDENT: "A组",
  INTERN: "B组"
};
