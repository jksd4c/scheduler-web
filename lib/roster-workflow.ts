import { TIME_SLOT, type TimeSlotValue } from "@/lib/schedule-rules";

export const STAFF_POOL_TYPE = {
  CORE: "CORE",
  ROTATION: "ROTATION"
} as const;

export const ROSTER_STATUS = {
  WAITING_JOIN: "WAITING_JOIN",
  CLAIMED: "CLAIMED",
  CONFIRMED: "CONFIRMED",
  REJECTED: "REJECTED",
  NO_SHOW: "NO_SHOW"
} as const;

export const JOIN_MATCH_STATUS = {
  EXACT: "EXACT",
  PHONE_MATCH: "PHONE_MATCH",
  NAME_MATCH: "NAME_MATCH",
  FUZZY: "FUZZY",
  MANUAL_BOUND: "MANUAL_BOUND",
  UNMATCHED: "UNMATCHED"
} as const;

export const JOIN_REVIEW_STATUS = {
  PENDING: "PENDING",
  EXCEPTION_PENDING: "EXCEPTION_PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED"
} as const;

export const MEMBER_FEEDBACK_STATUS = {
  WAITING_IDENTITY_CONFIRMATION: "WAITING_IDENTITY_CONFIRMATION",
  ACTIVE: "ACTIVE",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED"
} as const;

export function normalizePoolType(value: unknown) {
  return String(value ?? "").toUpperCase() === STAFF_POOL_TYPE.ROTATION ? STAFF_POOL_TYPE.ROTATION : STAFF_POOL_TYPE.CORE;
}

export function normalizePhone(value: unknown) {
  return String(value ?? "").replace(/[^\d+]/g, "").trim();
}

export function normalizePersonName(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/医生$/u, "")
    .replace(/老师$/u, "");
}

export function parseRosterText(text: string) {
  const rows = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const entries: Array<{ expectedName: string; expectedPhone: string | null; staffType: string | null }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const cells = row.split(/[,，\t ]+/).map((item) => item.trim()).filter(Boolean);
    const expectedName = cells[0] ?? "";
    if (!expectedName) continue;
    const phoneCandidate = cells.find((item, index) => index > 0 && /\d{7,}/.test(item));
    const staffType = cells.find((item, index) => index > 0 && item !== phoneCandidate) ?? null;
    const expectedPhone = phoneCandidate ? normalizePhone(phoneCandidate) : null;
    const key = `${normalizePersonName(expectedName)}:${expectedPhone ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ expectedName, expectedPhone, staffType });
  }
  return entries;
}

export function matchRosterEntry(
  input: { name: string; phone: string },
  entries: Array<{ id: string; expectedName: string; expectedPhone: string | null; status: string }>
) {
  const phone = normalizePhone(input.phone);
  const name = normalizePersonName(input.name);
  const openEntries = entries.filter((entry) => ![ROSTER_STATUS.CLAIMED, ROSTER_STATUS.CONFIRMED, ROSTER_STATUS.REJECTED, ROSTER_STATUS.NO_SHOW].includes(entry.status as any));
  const phoneMatch = openEntries.find((entry) => entry.expectedPhone && normalizePhone(entry.expectedPhone) === phone);
  if (phoneMatch) {
    return {
      rosterEntry: phoneMatch,
      matchStatus: normalizePersonName(phoneMatch.expectedName) === name ? JOIN_MATCH_STATUS.EXACT : JOIN_MATCH_STATUS.PHONE_MATCH
    };
  }
  const exactName = openEntries.find((entry) => normalizePersonName(entry.expectedName) === name);
  if (exactName) return { rosterEntry: exactName, matchStatus: JOIN_MATCH_STATUS.NAME_MATCH };
  const fuzzy = openEntries.find((entry) => fuzzyName(entry.expectedName) === fuzzyName(name));
  if (fuzzy) return { rosterEntry: fuzzy, matchStatus: JOIN_MATCH_STATUS.FUZZY };
  return { rosterEntry: null, matchStatus: JOIN_MATCH_STATUS.UNMATCHED };
}

export function normalizeTimeSlot(value: unknown): TimeSlotValue {
  const text = String(value ?? "").toUpperCase();
  if (text === TIME_SLOT.MORNING || text === TIME_SLOT.AFTERNOON) return text;
  return TIME_SLOT.FULL_DAY;
}

export function evaluateFeedbackStatus(input: { unavailableCount: number; periodDays: number; identityConfirmed: boolean; hasMessage: boolean }) {
  if (!input.identityConfirmed) {
    return { status: MEMBER_FEEDBACK_STATUS.WAITING_IDENTITY_CONFIRMATION, effective: false, anomalyStatus: "身份未确认，暂不生效" };
  }
  const fullDayLimit = input.periodDays <= 10 ? 2 : 6;
  const ratioLimit = input.periodDays <= 10 ? 0.3 : 0.25;
  const ratioExceeded = input.unavailableCount > Math.ceil(input.periodDays * ratioLimit);
  const countExceeded = input.unavailableCount > fullDayLimit;
  if ((ratioExceeded || countExceeded) && !input.hasMessage) {
    return { status: MEMBER_FEEDBACK_STATUS.NEEDS_REVIEW, effective: false, anomalyStatus: "硬性不可排数量偏高且未填写说明" };
  }
  if (ratioExceeded || countExceeded) {
    return { status: MEMBER_FEEDBACK_STATUS.NEEDS_REVIEW, effective: false, anomalyStatus: "硬性不可排数量偏高，需管理员审核" };
  }
  return { status: MEMBER_FEEDBACK_STATUS.ACTIVE, effective: true, anomalyStatus: null };
}

function fuzzyName(value: unknown) {
  return normalizePersonName(value).toLowerCase();
}
