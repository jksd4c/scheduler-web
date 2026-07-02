import { NextResponse } from "next/server";
import { nowMs, withApiTiming } from "@/lib/api-timing";
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
  const start = nowMs();
  let role: string | null = null;
  try {
    const url = new URL(request.url);
    const { user, unit } = await requireManagedUnit(url.searchParams.get("unitId"));
    role = user.role;
    const staff = await prisma.staffProfile.findMany({
      where: { unitId: unit.id },
      include: staffInclude,
      orderBy: [{ active: "desc" }, { createdAt: "asc" }]
    });

    return withApiTiming(NextResponse.json({ staff: staff.map(serializeStaffProfile) }), {
      route: "GET /api/staff",
      start,
      role
    });
  } catch (error) {
    const response = authErrorResponse(error);
    return withApiTiming(response, { route: "GET /api/staff", start, role });
  }
}

export async function POST(request: Request) {
  const start = nowMs();
  let role: string | null = null;
  try {
    const body = await request.json();
    const { user, unit } = await requireManagedUnit(body.unitId);
    role = user.role;
    const names = normalizeNames(body);
    if (names.length === 0) {
      return withApiTiming(NextResponse.json({ message: "请至少填写一名人员" }, { status: 400 }), {
        route: "POST /api/staff",
        start,
        role
      });
    }
    const tagIds = await validateUnitTagIds(unit.id, body.tagIds);
    const active = body.active !== false;
    const note = nullableString(body.note);
    const singleContact = names.length === 1;

    await prisma.$transaction(async (tx) => {
      await tx.staffProfile.createMany({
        data: names.map((displayName) => ({
          unitId: unit.id,
          displayName,
          phone: singleContact ? nullableString(body.phone) : null,
          email: singleContact ? nullableString(body.email) : null,
          note,
          active
        })),
        skipDuplicates: true
      });
      await tx.staffProfile.updateMany({
        where: { unitId: unit.id, displayName: { in: names } },
        data: { active, note }
      });
      const profiles = await tx.staffProfile.findMany({
        where: { unitId: unit.id, displayName: { in: names } },
        select: { id: true }
      });
      const profileIds = profiles.map((profile) => profile.id);
      await tx.staffProfileTag.deleteMany({ where: { staffProfileId: { in: profileIds }, staffTagId: { notIn: tagIds } } });
      if (tagIds.length) {
        await tx.staffProfileTag.createMany({
          data: profileIds.flatMap((staffProfileId) => tagIds.map((staffTagId) => ({ staffProfileId, staffTagId }))),
          skipDuplicates: true
        });
      } else {
        await tx.staffProfileTag.deleteMany({ where: { staffProfileId: { in: profileIds } } });
      }
    });

    const createdOrUpdated = await prisma.staffProfile.findMany({
      where: { unitId: unit.id, displayName: { in: names } },
      include: staffInclude,
      orderBy: [{ active: "desc" }, { createdAt: "asc" }]
    });

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

    return withApiTiming(NextResponse.json({ staff: createdOrUpdated.map(serializeStaffProfile) }, { status: 201 }), {
      route: "POST /api/staff",
      start,
      role
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const response = authErrorResponse(error);
      return withApiTiming(response, { route: "POST /api/staff", start, role });
    }
    console.error(error);
    return withApiTiming(NextResponse.json({ message: "保存人员失败，可能存在重复手机号或邮箱" }, { status: 500 }), {
      route: "POST /api/staff",
      start,
      role
    });
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
