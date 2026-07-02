import { NextResponse } from "next/server";
import { nowMs, withApiTiming } from "@/lib/api-timing";
import { authErrorResponse, requireManagedUnit } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeTagCategory, resolveEffectivePolicy, summarizeEligibility } from "@/lib/staff-policy";

export const runtime = "nodejs";

const policyFields = [
  "participatesInScheduling",
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
  "maxShiftsPerWeek",
  "maxWorkDaysPerWeek",
  "maxShiftsPerMonth",
  "maxNightShiftsPerMonth",
  "maxWeekendShiftsPerMonth",
  "maxHolidayShiftsPerMonth",
  "maxConsecutiveWorkDays",
  "allowConsecutiveNightShifts",
  "allowDayAndNightSameDay",
  "allowDayAfterNightShift",
  "minRestHoursAfterNightShift",
  "schedulingMode",
  "targetShiftsPerPeriod",
  "maxShiftsPerPeriod",
  "workloadFactor",
  "countInFairness",
  "note"
] as const;

export async function GET(request: Request) {
  const start = nowMs();
  let role: string | null = null;
  try {
    const url = new URL(request.url);
    const { user, unit } = await requireManagedUnit(url.searchParams.get("unitId"));
    role = user.role;
    const tags = await prisma.staffTag.findMany({
      where: { unitId: unit.id },
      include: { policy: true, _count: { select: { staffProfileTags: true } } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });

    return withApiTiming(
      NextResponse.json({
        tags: tags.map((tag) => ({
          ...tag,
          effectiveSummary: summarizeEligibility(resolveEffectivePolicy([{ ...tag, policy: tag.policy }]))
        }))
      }),
      { route: "GET /api/staff-tags", start, role }
    );
  } catch (error) {
    const response = authErrorResponse(error);
    return withApiTiming(response, { route: "GET /api/staff-tags", start, role });
  }
}

export async function POST(request: Request) {
  const start = nowMs();
  let role: string | null = null;
  try {
    const body = await request.json();
    const { user, unit } = await requireManagedUnit(body.unitId);
    role = user.role;
    const name = String(body.name ?? "").trim();
    if (!name) {
      return withApiTiming(NextResponse.json({ message: "请填写身份名称" }, { status: 400 }), {
        route: "POST /api/staff-tags",
        start,
        role
      });
    }

    const policyData = normalizePolicyInput(body.policy ?? {});
    const tag = await prisma.staffTag.create({
      data: {
        unitId: unit.id,
        name,
        category: normalizeTagCategory(body.category),
        color: nullableString(body.color),
        active: body.active !== false,
        sortOrder: normalizeInt(body.sortOrder, 0),
        policy: { create: policyData }
      },
      include: { policy: true, _count: { select: { staffProfileTags: true } } }
    });

    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: unit.hospitalId,
      departmentId: unit.departmentId,
      unitId: unit.id,
      action: "CREATE_STAFF_TAG",
      targetType: "StaffTag",
      targetId: tag.id,
      afterJson: { name: tag.name, category: tag.category, policy: tag.policy },
      request
    });

    return withApiTiming(NextResponse.json({ tag }, { status: 201 }), {
      route: "POST /api/staff-tags",
      start,
      role
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const response = authErrorResponse(error);
      return withApiTiming(response, { route: "POST /api/staff-tags", start, role });
    }
    console.error(error);
    return withApiTiming(NextResponse.json({ message: "保存身份失败，可能存在同名身份" }, { status: 500 }), {
      route: "POST /api/staff-tags",
      start,
      role
    });
  }
}

function normalizePolicyInput(input: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const field of policyFields) {
    const value = input[field];
    if (field === "workloadFactor") {
      const numberValue = Number(value);
      data[field] = Number.isFinite(numberValue) && numberValue > 0 ? Math.max(0.1, numberValue) : 1;
    } else if (field === "note") {
      data[field] = nullableString(value);
    } else if (field === "schedulingMode") {
      data[field] = normalizeSchedulingMode(value);
    } else if (field === "participatesInScheduling") {
      data[field] = value !== false;
    } else if (field === "countInFairness") {
      data[field] = value !== false;
    } else if (field.startsWith("max") || field === "minRestHoursAfterNightShift" || field === "targetShiftsPerPeriod") {
      data[field] = nullableInt(value);
    } else {
      data[field] = nullableBoolean(value);
    }
  }
  return data;
}

function normalizeSchedulingMode(value: unknown) {
  const text = String(value ?? "").trim().toUpperCase();
  return ["NORMAL", "REDUCED", "FIXED_TARGET", "MAX_LIMIT", "EXCLUDED"].includes(text) ? text : "NORMAL";
}

function nullableString(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function nullableBoolean(value: unknown) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

function nullableInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.floor(numberValue)) : null;
}

function normalizeInt(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.floor(numberValue) : fallback;
}
