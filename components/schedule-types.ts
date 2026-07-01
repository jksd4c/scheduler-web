export type ScheduleMode = "FULL_DAY" | "HALF_DAY";
export type ScheduleStatus = "DRAFT" | "RULES_SET" | "GENERATED" | "PUBLISHED" | "LOCKED";
export type DoctorType = "RESIDENT" | "INTERN";
export type TimeSlot = "FULL_DAY" | "MORNING" | "AFTERNOON";
export type ConflictSeverity = "INFO" | "WARNING" | "ERROR";

export type ApiDoctor = {
  id: string;
  scheduleTaskId: string;
  name: string;
  doctorType: DoctorType;
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
  peakAssignments: number;
  maxConsecutiveDays: number;
  hasConsecutiveWork: boolean;
  unavailableConflictCount: number;
  assignments: Array<{
    id: string;
    date: string;
    weekday: number;
    weekdayLabel: string;
    timeSlot: TimeSlot;
    timeSlotLabel: string;
    roomNumber: number;
    locked: boolean;
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
};

export type ApiTaskDetail = {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  mode: ScheduleMode;
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
  department?: {
    id: string;
    name: string;
    isActive?: boolean;
  } | null;
  weekStartDate: string;
  weekEndDate: string;
  mode: ScheduleMode;
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
  RESIDENT: "规培",
  INTERN: "实习"
};
