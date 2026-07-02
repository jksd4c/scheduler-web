export const STAFF_TAG_CATEGORY = {
  TITLE: "TITLE",
  TRAINING: "TRAINING",
  DUTY_QUALIFICATION: "DUTY_QUALIFICATION",
  SKILL: "SKILL",
  CUSTOM: "CUSTOM"
} as const;

export const SHIFT_TYPE_CATEGORY = {
  DAY: "DAY",
  NIGHT: "NIGHT",
  FIRST_LINE: "FIRST_LINE",
  SECOND_LINE: "SECOND_LINE",
  EMERGENCY: "EMERGENCY",
  ON_CALL: "ON_CALL",
  BACKUP: "BACKUP",
  CUSTOM: "CUSTOM"
} as const;

export const SHIFT_TAG_REQUIREMENT = {
  REQUIRED: "REQUIRED",
  FORBIDDEN: "FORBIDDEN",
  ALLOWED: "ALLOWED"
} as const;

const booleanPolicyFields = [
  "canWorkDayShift",
  "canWorkNightShift",
  "canWorkWeekend",
  "canWorkHoliday",
  "canWorkFirstLine",
  "canWorkSecondLine",
  "canWorkEmergency",
  "canWorkOnCall",
  "canWorkBackup",
  "canWorkIndependently",
  "allowConsecutiveNightShifts",
  "allowDayAndNightSameDay",
  "allowDayAfterNightShift"
] as const;

const numericMinimumPolicyFields = [
  "maxShiftsPerWeek",
  "maxWorkDaysPerWeek",
  "maxShiftsPerMonth",
  "maxNightShiftsPerMonth",
  "maxWeekendShiftsPerMonth",
  "maxHolidayShiftsPerMonth",
  "maxConsecutiveWorkDays",
  "minRestHoursAfterNightShift"
] as const;

export type StaffTagSnapshot = {
  id: string;
  name: string;
  category: string;
  color?: string | null;
};

export type EffectiveStaffPolicy = {
  participatesInScheduling: boolean;
  workloadFactor: number;
  sourceTagNames: string[];
  canWorkDayShift?: boolean | null;
  canWorkNightShift?: boolean | null;
  canWorkWeekend?: boolean | null;
  canWorkHoliday?: boolean | null;
  canWorkFirstLine?: boolean | null;
  canWorkSecondLine?: boolean | null;
  canWorkEmergency?: boolean | null;
  canWorkOnCall?: boolean | null;
  canWorkBackup?: boolean | null;
  canWorkIndependently?: boolean | null;
  maxShiftsPerWeek?: number | null;
  maxWorkDaysPerWeek?: number | null;
  maxShiftsPerMonth?: number | null;
  maxNightShiftsPerMonth?: number | null;
  maxWeekendShiftsPerMonth?: number | null;
  maxHolidayShiftsPerMonth?: number | null;
  maxConsecutiveWorkDays?: number | null;
  allowConsecutiveNightShifts?: boolean | null;
  allowDayAndNightSameDay?: boolean | null;
  allowDayAfterNightShift?: boolean | null;
  minRestHoursAfterNightShift?: number | null;
};

type TagWithPolicy = {
  id: string;
  name: string;
  category: string;
  color?: string | null;
  policy?: Record<string, unknown> | null;
};

export function normalizeTagCategory(value: unknown) {
  const text = String(value ?? "").trim().toUpperCase();
  if (Object.values(STAFF_TAG_CATEGORY).includes(text as any)) return text;
  return STAFF_TAG_CATEGORY.CUSTOM;
}

export function normalizeShiftCategory(value: unknown) {
  const text = String(value ?? "").trim().toUpperCase();
  if (Object.values(SHIFT_TYPE_CATEGORY).includes(text as any)) return text;
  return SHIFT_TYPE_CATEGORY.CUSTOM;
}

export function normalizeRequirementType(value: unknown) {
  const text = String(value ?? "").trim().toUpperCase();
  if (Object.values(SHIFT_TAG_REQUIREMENT).includes(text as any)) return text;
  return SHIFT_TAG_REQUIREMENT.REQUIRED;
}

export function buildTagSnapshot(tags: TagWithPolicy[]): StaffTagSnapshot[] {
  return tags
    .filter((tag) => tag.id && tag.name)
    .map((tag) => ({
      id: tag.id,
      name: tag.name,
      category: tag.category,
      color: tag.color ?? null
    }));
}

export function resolveEffectivePolicy(tags: TagWithPolicy[]): EffectiveStaffPolicy {
  const policy: EffectiveStaffPolicy = {
    participatesInScheduling: true,
    workloadFactor: 1,
    sourceTagNames: tags.map((tag) => tag.name)
  };

  for (const tag of tags) {
    const item = tag.policy;
    if (!item) continue;

    if (item.participatesInScheduling === false) {
      policy.participatesInScheduling = false;
    }

    for (const field of booleanPolicyFields) {
      const value = item[field];
      if (value === false) {
        policy[field] = false;
      } else if (value === true && policy[field] !== false) {
        policy[field] = true;
      }
    }

    for (const field of numericMinimumPolicyFields) {
      const numberValue = normalizeNullableInt(item[field]);
      if (numberValue === null) continue;
      const current = policy[field];
      policy[field] = current === undefined || current === null ? numberValue : Math.min(current, numberValue);
    }

    const workloadFactor = Number(item.workloadFactor);
    if (Number.isFinite(workloadFactor) && workloadFactor > 0) {
      policy.workloadFactor = Math.min(policy.workloadFactor, workloadFactor);
    }
  }

  policy.workloadFactor = Math.max(0.1, Number(policy.workloadFactor.toFixed(2)));
  return policy;
}

export function parseTagSnapshot(value: unknown): StaffTagSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const id = String(record.id ?? "");
      const name = String(record.name ?? "");
      if (!id || !name) return null;
      return {
        id,
        name,
        category: String(record.category ?? STAFF_TAG_CATEGORY.CUSTOM),
        color: record.color == null ? null : String(record.color)
      };
    })
    .filter(Boolean) as StaffTagSnapshot[];
}

export function parseEffectivePolicy(value: unknown): EffectiveStaffPolicy {
  if (!value || typeof value !== "object") {
    return { participatesInScheduling: true, workloadFactor: 1, sourceTagNames: [] };
  }
  const record = value as Record<string, unknown>;
  const policy: EffectiveStaffPolicy = {
    participatesInScheduling: record.participatesInScheduling !== false,
    workloadFactor: Math.max(0.1, Number(record.workloadFactor) || 1),
    sourceTagNames: Array.isArray(record.sourceTagNames) ? record.sourceTagNames.map(String) : []
  };

  for (const field of booleanPolicyFields) {
    if (record[field] === true || record[field] === false) {
      policy[field] = record[field] as boolean;
    }
  }
  for (const field of numericMinimumPolicyFields) {
    policy[field] = normalizeNullableInt(record[field]);
  }
  return policy;
}

export function summarizeEligibility(policy: EffectiveStaffPolicy) {
  const labels = [
    policy.participatesInScheduling ? "参与自动排班" : "不参与自动排班",
    capabilityLabel("白班", policy.canWorkDayShift),
    capabilityLabel("夜班", policy.canWorkNightShift),
    capabilityLabel("周末", policy.canWorkWeekend),
    capabilityLabel("一线", policy.canWorkFirstLine),
    capabilityLabel("二线", policy.canWorkSecondLine),
    capabilityLabel("急诊", policy.canWorkEmergency),
    capabilityLabel("留班/备班", policy.canWorkOnCall ?? policy.canWorkBackup),
    capabilityLabel("独立值班", policy.canWorkIndependently)
  ].filter(Boolean);

  const limits = [
    policy.maxShiftsPerWeek != null ? `每周最多${policy.maxShiftsPerWeek}班` : "",
    policy.maxWorkDaysPerWeek != null ? `每周最多${policy.maxWorkDaysPerWeek}天` : "",
    policy.maxNightShiftsPerMonth != null ? `每月夜班最多${policy.maxNightShiftsPerMonth}个` : "",
    policy.maxWeekendShiftsPerMonth != null ? `每月周末最多${policy.maxWeekendShiftsPerMonth}个` : ""
  ].filter(Boolean);

  return [...labels, `工作量系数${policy.workloadFactor}`, ...limits].join("，");
}

function capabilityLabel(label: string, value: boolean | null | undefined) {
  if (value === true) return `可${label}`;
  if (value === false) return `不可${label}`;
  return "";
}

function normalizeNullableInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.max(0, Math.floor(numberValue));
}
