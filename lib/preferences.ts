export const PREFERRED_SHIFT_TYPE = {
  NONE: "NONE",
  DAY: "DAY",
  NIGHT: "NIGHT"
} as const;

export const PREFERENCE_STRENGTH = {
  NORMAL: "NORMAL",
  STRONG: "STRONG",
  EXTREME: "EXTREME"
} as const;

export type PreferredShiftType = (typeof PREFERRED_SHIFT_TYPE)[keyof typeof PREFERRED_SHIFT_TYPE];
export type PreferenceStrength = (typeof PREFERENCE_STRENGTH)[keyof typeof PREFERENCE_STRENGTH];

export const PREFERRED_SHIFT_TYPE_LABELS: Record<PreferredShiftType, string> = {
  NONE: "无偏好",
  DAY: "偏向白班",
  NIGHT: "偏向夜班"
};

export const PREFERENCE_STRENGTH_LABELS: Record<PreferenceStrength, string> = {
  NORMAL: "普通",
  STRONG: "非常",
  EXTREME: "极度"
};

export function normalizePreferredShiftType(value: unknown): PreferredShiftType {
  const text = String(value ?? "").trim().toUpperCase();
  if (text === PREFERRED_SHIFT_TYPE.DAY || text === PREFERRED_SHIFT_TYPE.NIGHT) return text;
  return PREFERRED_SHIFT_TYPE.NONE;
}

export function normalizePreferenceStrength(value: unknown): PreferenceStrength {
  const text = String(value ?? "").trim().toUpperCase();
  if (text === PREFERENCE_STRENGTH.STRONG || text === PREFERENCE_STRENGTH.EXTREME) return text;
  return PREFERENCE_STRENGTH.NORMAL;
}

export function preferenceStrengthWeight(value: unknown) {
  const strength = normalizePreferenceStrength(value);
  if (strength === PREFERENCE_STRENGTH.EXTREME) return 3;
  if (strength === PREFERENCE_STRENGTH.STRONG) return 2;
  return 1;
}

export function preferenceLabel(type: unknown, strength: unknown) {
  const normalizedType = normalizePreferredShiftType(type);
  if (normalizedType === PREFERRED_SHIFT_TYPE.NONE) return PREFERRED_SHIFT_TYPE_LABELS.NONE;
  return `${PREFERRED_SHIFT_TYPE_LABELS[normalizedType]} / ${PREFERENCE_STRENGTH_LABELS[normalizePreferenceStrength(strength)]}`;
}

export function preferenceSatisfaction(input: {
  preferredShiftType?: unknown;
  preferenceStrength?: unknown;
  dayShiftAssignments: number;
  nightShiftAssignments: number;
}) {
  const preferredShiftType = normalizePreferredShiftType(input.preferredShiftType);
  if (preferredShiftType === PREFERRED_SHIFT_TYPE.NONE) return "无偏好";

  const day = input.dayShiftAssignments;
  const night = input.nightShiftAssignments;
  if (preferredShiftType === PREFERRED_SHIFT_TYPE.DAY) {
    if (day > night) return "偏好部分满足，且未作为硬约束";
    return "因夜班/工作量公平要求，未完全满足偏好";
  }
  if (night >= day) return "偏好部分满足，夜班未超过公平范围";
  return "因白班/工作量公平要求，未完全满足偏好";
}
