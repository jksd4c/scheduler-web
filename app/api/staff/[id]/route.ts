import { NextResponse } from "next/server";
import { authErrorResponse, requireManagedUnit } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
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

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const current = await prisma.staffProfile.findUnique({ where: { id: params.id }, include: staffInclude });
    if (!current) return NextResponse.json({ message: "人员不存在" }, { status: 404 });
    const { user, unit } = await requireManagedUnit(current.unitId);
    const body = await request.json();
    const tagIds = Array.isArray(body.tagIds) ? await validateUnitTagIds(unit.id, body.tagIds) : null;

    const data: Record<string, unknown> = {};
    if ("displayName" in body) {
      const name = String(body.displayName ?? "").trim();
      if (!name) return NextResponse.json({ message: "请填写姓名" }, { status: 400 });
      data.displayName = name;
    }
    if ("phone" in body) data.phone = nullableString(body.phone);
    if ("email" in body) data.email = nullableString(body.email);
    if ("note" in body) data.note = nullableString(body.note);
    if ("active" in body) data.active = body.active !== false;

    await prisma.$transaction(async (tx) => {
      await tx.staffProfile.update({ where: { id: current.id }, data });
      if (tagIds) {
        await tx.staffProfileTag.deleteMany({ where: { staffProfileId: current.id, staffTagId: { notIn: tagIds } } });
        for (const staffTagId of tagIds) {
          await tx.staffProfileTag.upsert({
            where: { staffProfileId_staffTagId: { staffProfileId: current.id, staffTagId } },
            create: { staffProfileId: current.id, staffTagId },
            update: {}
          });
        }
      }
    });

    const updated = await prisma.staffProfile.findUnique({ where: { id: current.id }, include: staffInclude });
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: unit.hospitalId,
      departmentId: unit.departmentId,
      unitId: unit.id,
      action: "UPDATE_STAFF_PROFILE_TAGS",
      targetType: "StaffProfile",
      targetId: current.id,
      beforeJson: serializeStaffProfile(current),
      afterJson: updated ? serializeStaffProfile(updated) : null,
      request
    });

    return NextResponse.json({ staff: updated ? serializeStaffProfile(updated) : null });
  } catch (error) {
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
    console.error(error);
    return NextResponse.json({ message: "更新人员失败" }, { status: 500 });
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

function nullableString(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}
