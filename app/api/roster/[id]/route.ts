import { NextResponse } from "next/server";
import { authErrorResponse, requireManagedUnit } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { DOCTOR_TYPE } from "@/lib/schedule-rules";
import { ROSTER_STATUS } from "@/lib/roster-workflow";
import { buildTagSnapshot, resolveEffectivePolicy } from "@/lib/staff-policy";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const current = await prisma.rosterEntry.findUnique({ where: { id: params.id } });
    if (!current) return NextResponse.json({ message: "预录人员不存在" }, { status: 404 });
    const { user, unit } = await requireManagedUnit(current.unitId);
    const body = await request.json();
    const data: Record<string, unknown> = {};
    if ("includeInScheduling" in body) data.includeInScheduling = body.includeInScheduling === true;
    if ("status" in body) {
      const status = String(body.status ?? "");
      if (Object.values(ROSTER_STATUS).includes(status as any)) data.status = status;
      if (status === ROSTER_STATUS.NO_SHOW || status === ROSTER_STATUS.REJECTED) data.includeInScheduling = false;
    }
    const entry = await prisma.$transaction(async (tx) => {
      const updated = await tx.rosterEntry.update({ where: { id: current.id }, data });
      if ("includeInScheduling" in body && updated.scheduleTaskId) {
        if (updated.includeInScheduling && updated.status === ROSTER_STATUS.CONFIRMED) {
          const profile = updated.staffProfileId
            ? await tx.staffProfile.findUnique({ where: { id: updated.staffProfileId } })
            : await ensureStaffProfile(tx, unit.id, updated);
          if (profile) {
            await ensureScheduleDoctor(tx, updated.scheduleTaskId, unit.departmentId, profile.id);
            if (!updated.staffProfileId) {
              return tx.rosterEntry.update({ where: { id: updated.id }, data: { staffProfileId: profile.id } });
            }
          }
        } else {
          await setTaskStaffActive(tx, updated.scheduleTaskId, updated.staffProfileId, updated.expectedName, false);
        }
      }
      return updated;
    });
    const action =
      "includeInScheduling" in body
        ? entry.includeInScheduling
          ? "INCLUDE_ROSTER_ENTRY"
          : "EXCLUDE_ROSTER_ENTRY"
        : entry.status === ROSTER_STATUS.NO_SHOW
          ? "MARK_ROSTER_NO_SHOW"
          : entry.status === ROSTER_STATUS.REJECTED
            ? "REJECT_ROSTER_ENTRY"
            : "UPDATE_ROSTER_ENTRY";
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: unit.hospitalId,
      departmentId: unit.departmentId,
      unitId: unit.id,
      action,
      targetType: "RosterEntry",
      targetId: entry.id,
      beforeJson: current,
      afterJson: entry,
      request
    });
    return NextResponse.json({ entry });
  } catch (error) {
    return authErrorResponse(error);
  }
}

async function ensureStaffProfile(tx: any, unitId: string, entry: any) {
  const profile = await tx.staffProfile.upsert({
    where: { unitId_displayName: { unitId, displayName: entry.expectedName } },
    update: { phone: entry.expectedPhone || undefined, active: true },
    create: { unitId, displayName: entry.expectedName, phone: entry.expectedPhone, active: true }
  });
  const tagIds = Array.isArray(entry.identityTagIds) ? entry.identityTagIds.map(String).filter(Boolean) : [];
  if (tagIds.length) {
    await tx.staffProfileTag.createMany({ data: tagIds.map((staffTagId: string) => ({ staffProfileId: profile.id, staffTagId })), skipDuplicates: true });
  }
  return profile;
}

async function ensureScheduleDoctor(tx: any, scheduleTaskId: string, departmentId: string, staffProfileId: string) {
  const profile = await tx.staffProfile.findUnique({
    where: { id: staffProfileId },
    include: { tags: { include: { staffTag: { include: { policy: true } } } } }
  });
  if (!profile) return null;
  const tags = profile.tags.map((item: any) => item.staffTag);
  const tagSnapshot = buildTagSnapshot(tags);
  const policySnapshot = resolveEffectivePolicy(tags);
  const doctor = await tx.scheduleDoctor.upsert({
    where: { scheduleTaskId_name: { scheduleTaskId, name: profile.displayName } },
    update: { staffProfileId: profile.id, active: true, tagSnapshotJson: tagSnapshot, policySnapshotJson: policySnapshot },
    create: {
      departmentId,
      scheduleTaskId,
      staffProfileId: profile.id,
      name: profile.displayName,
      doctorType: DOCTOR_TYPE.RESIDENT,
      active: true,
      tagSnapshotJson: tagSnapshot,
      policySnapshotJson: policySnapshot
    }
  });
  await tx.scheduleParticipant.upsert({
    where: { scheduleTaskId_displayName: { scheduleTaskId, displayName: profile.displayName } },
    update: { scheduleDoctorId: doctor.id, staffProfileId: profile.id, active: true, tagSnapshotJson: tagSnapshot, policySnapshotJson: policySnapshot },
    create: { scheduleTaskId, scheduleDoctorId: doctor.id, staffProfileId: profile.id, displayName: profile.displayName, active: true, tagSnapshotJson: tagSnapshot, policySnapshotJson: policySnapshot }
  });
  return doctor;
}

async function setTaskStaffActive(tx: any, scheduleTaskId: string, staffProfileId: string | null, displayName: string, active: boolean) {
  const where = staffProfileId ? { scheduleTaskId, staffProfileId } : { scheduleTaskId, name: displayName };
  await tx.scheduleDoctor.updateMany({ where, data: { active } });
  await tx.scheduleParticipant.updateMany({
    where: staffProfileId ? { scheduleTaskId, staffProfileId } : { scheduleTaskId, displayName },
    data: { active }
  });
}
