import { NextResponse } from "next/server";
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
  "workloadFactor",
  "note"
] as const;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { unit } = await requireManagedUnit(url.searchParams.get("unitId"));
    const tags = await prisma.staffTag.findMany({
      where: { unitId: unit.id },
      include: { policy: true, _count: { select: { staffProfileTags: true } } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });

    return NextResponse.json({
      tags: tags.map((tag) => ({
        ...tag,
        effectiveSummary: summarizeEligibility(resolveEffectivePolicy([{ ...tag, policy: tag.policy }]))
      }))
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { user, unit } = await requireManagedUnit(body.unitId);
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ message: "请填写身份名称" }, { status: 400 });
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

    return NextResponse.json({ tag }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
    console.error(error);
    return NextResponse.json({ message: "保存身份失败，可能存在同名身份" }, { status: 500 });
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
    } else if (field === "participatesInScheduling") {
      data[field] = value !== false;
    } else if (field.startsWith("max") || field === "minRestHoursAfterNightShift") {
      data[field] = nullableInt(value);
    } else {
      data[field] = nullableBoolean(value);
    }
  }
  return data;
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
