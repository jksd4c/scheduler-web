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

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const start = nowMs();
  let role: string | null = null;
  try {
    const current = await prisma.shiftType.findUnique({ where: { id: params.id }, include: shiftInclude });
    if (!current) {
      return withApiTiming(NextResponse.json({ message: "班次类型不存在" }, { status: 404 }), {
        route: "PATCH /api/shift-types/[id]",
        start,
        role
      });
    }
    const { user, unit } = await requireManagedUnit(current.unitId);
    role = user.role;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if ("name" in body) {
      const name = String(body.name ?? "").trim();
      if (!name) {
        return withApiTiming(NextResponse.json({ message: "请填写班次名称" }, { status: 400 }), {
          route: "PATCH /api/shift-types/[id]",
          start,
          role
        });
      }
      data.name = name;
    }
    if ("category" in body) data.category = normalizeShiftCategory(body.category);
    if ("isNight" in body) data.isNight = body.isNight === true;
    if ("workloadWeight" in body) data.workloadWeight = normalizePositiveNumber(body.workloadWeight, current.workloadWeight);
    if ("startTime" in body) data.startTime = nullableString(body.startTime);
    if ("endTime" in body) data.endTime = nullableString(body.endTime);
    if ("color" in body) data.color = nullableString(body.color);
    if ("active" in body) data.active = body.active !== false;
    const rules = Array.isArray(body.requiredTags) ? await normalizeTagRules(unit.id, body.requiredTags) : null;

    await prisma.$transaction(async (tx) => {
      await tx.shiftType.update({ where: { id: current.id }, data });
      if (rules) {
        await tx.shiftTypeRequiredTag.deleteMany({ where: { shiftTypeId: current.id } });
        if (rules.length) await tx.shiftTypeRequiredTag.createMany({ data: rules.map((rule) => ({ ...rule, shiftTypeId: current.id })) });
      }
    });

    const updated = await prisma.shiftType.findUnique({ where: { id: current.id }, include: shiftInclude });
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: unit.hospitalId,
      departmentId: unit.departmentId,
      unitId: unit.id,
      action: "UPDATE_SHIFT_TYPE_TAG_REQUIREMENTS",
      targetType: "ShiftType",
      targetId: current.id,
      beforeJson: current,
      afterJson: updated,
      request
    });

    return withApiTiming(NextResponse.json({ shiftType: updated }), {
      route: "PATCH /api/shift-types/[id]",
      start,
      role
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const response = authErrorResponse(error);
      return withApiTiming(response, { route: "PATCH /api/shift-types/[id]", start, role });
    }
    console.error(error);
    return withApiTiming(NextResponse.json({ message: "更新班次类型失败" }, { status: 500 }), {
      route: "PATCH /api/shift-types/[id]",
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
