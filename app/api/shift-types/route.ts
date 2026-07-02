import { NextResponse } from "next/server";
import { nowMs, withApiTiming } from "@/lib/api-timing";
import { authErrorResponse, requireManagedUnit } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeRequirementType, normalizeShiftCategory } from "@/lib/staff-policy";

export const runtime = "nodejs";

const shiftInclude = {
  requiredTags: {
    include: { staffTag: true },
    orderBy: { createdAt: "asc" as const }
  },
  _count: { select: { requirements: true } }
};

export async function GET(request: Request) {
  const start = nowMs();
  let role: string | null = null;
  try {
    const url = new URL(request.url);
    const { user, unit } = await requireManagedUnit(url.searchParams.get("unitId"));
    role = user.role;
    const shiftTypes = await prisma.shiftType.findMany({
      where: { unitId: unit.id },
      include: shiftInclude,
      orderBy: [{ active: "desc" }, { createdAt: "asc" }]
    });
    return withApiTiming(NextResponse.json({ shiftTypes }), { route: "GET /api/shift-types", start, role });
  } catch (error) {
    const response = authErrorResponse(error);
    return withApiTiming(response, { route: "GET /api/shift-types", start, role });
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
      return withApiTiming(NextResponse.json({ message: "请填写班次名称" }, { status: 400 }), {
        route: "POST /api/shift-types",
        start,
        role
      });
    }
    const rules = await normalizeTagRules(unit.id, body.requiredTags);

    const shiftType = await prisma.shiftType.create({
      data: {
        unitId: unit.id,
        name,
        category: normalizeShiftCategory(body.category),
        isNight: body.isNight === true,
        workloadWeight: normalizePositiveNumber(body.workloadWeight, 1),
        startTime: nullableString(body.startTime),
        endTime: nullableString(body.endTime),
        color: nullableString(body.color),
        active: body.active !== false,
        requiredTags: { create: rules }
      },
      include: shiftInclude
    });

    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: unit.hospitalId,
      departmentId: unit.departmentId,
      unitId: unit.id,
      action: "CREATE_SHIFT_TYPE",
      targetType: "ShiftType",
      targetId: shiftType.id,
      afterJson: shiftType,
      request
    });

    return withApiTiming(NextResponse.json({ shiftType }, { status: 201 }), {
      route: "POST /api/shift-types",
      start,
      role
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const response = authErrorResponse(error);
      return withApiTiming(response, { route: "POST /api/shift-types", start, role });
    }
    console.error(error);
    return withApiTiming(NextResponse.json({ message: "保存班次类型失败，可能存在同名班次" }, { status: 500 }), {
      route: "POST /api/shift-types",
      start,
      role
    });
  }
}

async function normalizeTagRules(unitId: string, rawRules: unknown) {
  const rules = Array.isArray(rawRules) ? rawRules : [];
  const tagIds = Array.from(new Set(rules.map((rule: any) => String(rule?.staffTagId ?? "")).filter(Boolean)));
  if (!tagIds.length) return [];
  const tags = await prisma.staffTag.findMany({ where: { unitId, id: { in: tagIds }, active: true }, select: { id: true } });
  const validTagIds = new Set(tags.map((tag) => tag.id));
  const dedupe = new Set<string>();
  const data: Array<{ staffTagId: string; requirementType: string }> = [];
  for (const rule of rules as any[]) {
    const staffTagId = String(rule?.staffTagId ?? "");
    if (!validTagIds.has(staffTagId)) continue;
    const requirementType = normalizeRequirementType(rule?.requirementType);
    const key = `${staffTagId}:${requirementType}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    data.push({ staffTagId, requirementType });
  }
  return data;
}

function nullableString(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizePositiveNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}
