import { NextResponse } from "next/server";
import { authErrorResponse, requireManagedUnit } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { mergeDoctorNameLists } from "@/lib/name-parser";
import { prisma } from "@/lib/prisma";
import { buildTagSnapshot, resolveEffectivePolicy, summarizeEligibility } from "@/lib/staff-policy";

export const runtime = "nodejs";

const staffInclude = {
  user: { select: { id: true, username: true, displayName: true } },
  tags: {
    include: {
      staffTag: { include: { policy: true } }
    },
    orderBy: { createdAt: "asc" as const }
  }
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { unit } = await requireManagedUnit(url.searchParams.get("unitId"));
    const staff = await prisma.staffProfile.findMany({
      where: { unitId: unit.id },
      include: staffInclude,
      orderBy: [{ active: "desc" }, { createdAt: "asc" }]
    });

    return NextResponse.json({ staff: staff.map(serializeStaffProfile) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { user, unit } = await requireManagedUnit(body.unitId);
    const names = normalizeNames(body);
    if (names.length === 0) {
      return NextResponse.json({ message: "请至少填写一名人员" }, { status: 400 });
    }
    const tagIds = await validateUnitTagIds(unit.id, body.tagIds);

    const createdOrUpdated = [];
    for (const displayName of names) {
      const staff = await prisma.staffProfile.upsert({
        where: { unitId_displayName: { unitId: unit.id, displayName } },
        create: {
          unitId: unit.id,
          displayName,
          phone: nullableString(body.phone),
          email: nullableString(body.email),
          note: nullableString(body.note),
          active: body.active !== false,
          tags: { create: tagIds.map((staffTagId) => ({ staffTagId })) }
        },
        update: {
          active: body.active !== false,
          note: nullableString(body.note)
        },
        include: staffInclude
      });

      await prisma.$transaction([
        prisma.staffProfileTag.deleteMany({ where: { staffProfileId: staff.id, staffTagId: { notIn: tagIds } } }),
        ...tagIds.map((staffTagId) =>
          prisma.staffProfileTag.upsert({
            where: { staffProfileId_staffTagId: { staffProfileId: staff.id, staffTagId } },
            create: { staffProfileId: staff.id, staffTagId },
            update: {}
          })
        )
      ]);
      const refreshed = await prisma.staffProfile.findUnique({ where: { id: staff.id }, include: staffInclude });
      if (refreshed) createdOrUpdated.push(refreshed);
    }

    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: unit.hospitalId,
      departmentId: unit.departmentId,
      unitId: unit.id,
      action: "UPSERT_STAFF_PROFILE",
      targetType: "StaffProfile",
      afterJson: { names, tagIds, count: createdOrUpdated.length },
      request
    });

    return NextResponse.json({ staff: createdOrUpdated.map(serializeStaffProfile) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
    console.error(error);
    return NextResponse.json({ message: "保存人员失败，可能存在重复手机号或邮箱" }, { status: 500 });
  }
}

function serializeStaffProfile(staff: any) {
  const tags = staff.tags.map((item: any) => item.staffTag);
  const tagSnapshot = buildTagSnapshot(tags);
  const policy = resolveEffectivePolicy(tags);
  return {
    ...staff,
    tagSnapshot,
    effectivePolicy: policy,
    eligibilitySummary: summarizeEligibility(policy)
  };
}

async function validateUnitTagIds(unitId: string, rawTagIds: unknown) {
  const inputIds = Array.isArray(rawTagIds) ? rawTagIds.map(String).filter(Boolean) : [];
  if (!inputIds.length) return [];
  const tags = await prisma.staffTag.findMany({ where: { unitId, id: { in: inputIds }, active: true }, select: { id: true } });
  return tags.map((tag) => tag.id);
}

function normalizeNames(body: Record<string, unknown>) {
  if (Array.isArray(body.names)) {
    return Array.from(new Set(body.names.map((name) => String(name ?? "").trim()).filter(Boolean)));
  }
  const displayName = String(body.displayName ?? "").trim();
  const text = String(body.namesText ?? "");
  const parsed = mergeDoctorNameLists(displayName || text, "");
  return Array.from(new Set([...parsed.residents, ...parsed.interns]));
}

function nullableString(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}
