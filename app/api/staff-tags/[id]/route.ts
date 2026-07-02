import { NextResponse } from "next/server";
import { authErrorResponse, requireManagedUnit } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeTagCategory } from "@/lib/staff-policy";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const current = await prisma.staffTag.findUnique({ where: { id: params.id }, include: { policy: true, unit: true } });
    if (!current) return NextResponse.json({ message: "身份不存在" }, { status: 404 });
    const { user, unit } = await requireManagedUnit(current.unitId);
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if ("name" in body) data.name = String(body.name ?? "").trim();
    if ("category" in body) data.category = normalizeTagCategory(body.category);
    if ("color" in body) data.color = nullableString(body.color);
    if ("active" in body) data.active = body.active !== false;
    if ("sortOrder" in body) data.sortOrder = normalizeInt(body.sortOrder, current.sortOrder);

    if (typeof data.name === "string" && !data.name) {
      return NextResponse.json({ message: "请填写身份名称" }, { status: 400 });
    }

    const policy = normalizePolicyInput(body.policy ?? current.policy ?? {});
    const updated = await prisma.staffTag.update({
      where: { id: current.id },
      data: {
        ...data,
        policy: {
          upsert: {
            create: policy,
            update: policy
          }
        }
      },
      include: { policy: true, _count: { select: { staffProfileTags: true } } }
    });

    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: unit.hospitalId,
      departmentId: unit.departmentId,
      unitId: unit.id,
      action: "UPDATE_STAFF_TAG_POLICY",
      targetType: "StaffTag",
      targetId: updated.id,
      beforeJson: {
        name: current.name,
        category: current.category,
        active: current.active,
        sortOrder: current.sortOrder,
        policy: current.policy
      },
      afterJson: {
        name: updated.name,
        category: updated.category,
        active: updated.active,
        sortOrder: updated.sortOrder,
        policy: updated.policy
      },
      request
    });

    return NextResponse.json({ tag: updated });
  } catch (error) {
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
    console.error(error);
    return NextResponse.json({ message: "更新身份失败" }, { status: 500 });
  }
}

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
