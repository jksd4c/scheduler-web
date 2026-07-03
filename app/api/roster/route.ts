import { NextResponse } from "next/server";
import { authErrorResponse, requireManagedUnit } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { dateFromKey } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { DOCTOR_TYPE } from "@/lib/schedule-rules";
import { parseRosterText, ROSTER_STATUS, STAFF_POOL_TYPE, normalizePoolType } from "@/lib/roster-workflow";
import { buildTagSnapshot, resolveEffectivePolicy } from "@/lib/staff-policy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { unit } = await requireManagedUnit(url.searchParams.get("unitId"));
    const scheduleTaskId = url.searchParams.get("scheduleTaskId") || undefined;
    const where = { unitId: unit.id, ...(scheduleTaskId ? { scheduleTaskId } : {}) };
    const [entries, claims, feedback] = await Promise.all([
      prisma.rosterEntry.findMany({ where, orderBy: [{ createdAt: "asc" }] }),
      prisma.joinClaim.findMany({ where, orderBy: [{ createdAt: "desc" }] }),
      prisma.memberFeedback.findMany({
        where,
        include: { unavailableTimes: true },
        orderBy: [{ createdAt: "desc" }]
      })
    ]);
    return NextResponse.json({ entries, claims, feedback });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { user, unit } = await requireManagedUnit(body.unitId);
    const scheduleTaskId = String(body.scheduleTaskId ?? "").trim() || null;
    const staffPoolId = String(body.staffPoolId ?? "").trim() || null;
    const poolType = normalizePoolType(body.poolType);
    if (scheduleTaskId) {
      const task = await prisma.scheduleTask.findUnique({ where: { id: scheduleTaskId }, select: { unitId: true } });
      if (!task || task.unitId !== unit.id) return NextResponse.json({ message: "排班任务不存在或无权限" }, { status: 404 });
    }
    if (staffPoolId) {
      const pool = await prisma.staffPool.findUnique({ where: { id: staffPoolId } });
      if (!pool || pool.unitId !== unit.id) return NextResponse.json({ message: "人员池不存在或无权限" }, { status: 404 });
    }
    const entries = parseRosterText(String(body.text ?? ""));
    if (!entries.length) return NextResponse.json({ message: "请粘贴预录名单" }, { status: 400 });
    const identityTagIds = Array.isArray(body.identityTagIds) ? body.identityTagIds.map(String).filter(Boolean) : [];
    const validTags = identityTagIds.length
      ? await prisma.staffTag.findMany({ where: { unitId: unit.id, id: { in: identityTagIds }, active: true }, select: { id: true } })
      : [];
    const tagIds = validTags.map((tag) => tag.id);

    const created = await prisma.$transaction(async (tx) => {
      const output: any[] = [];
      for (const item of entries) {
        let staffProfileId: string | null = null;
        let status: string = ROSTER_STATUS.WAITING_JOIN;
        let includeInScheduling = false;
        if (poolType === STAFF_POOL_TYPE.CORE) {
          const profile = await upsertCoreStaffProfile(tx, unit.id, item.expectedName, item.expectedPhone, tagIds);
          staffProfileId = profile.id;
          status = ROSTER_STATUS.CONFIRMED;
          includeInScheduling = true;
          if (scheduleTaskId) await ensureScheduleDoctor(tx, scheduleTaskId, unit.departmentId, profile.id);
        }
        const entry = await tx.rosterEntry.create({
          data: {
            hospitalId: unit.hospitalId,
            departmentId: unit.departmentId,
            unitId: unit.id,
            scheduleTaskId,
            staffPoolId,
            staffProfileId,
            poolType,
            expectedName: item.expectedName,
            expectedPhone: item.expectedPhone,
            staffType: item.staffType,
            identityTagIds: tagIds,
            startDate: parseDate(body.startDate),
            endDate: parseDate(body.endDate),
            status,
            includeInScheduling
          }
        });
        output.push(entry);
      }
      return output;
    });

    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: unit.hospitalId,
      departmentId: unit.departmentId,
      unitId: unit.id,
      action: "IMPORT_ROSTER_ENTRY",
      targetType: "RosterEntry",
      afterJson: { count: created.length, poolType, scheduleTaskId, staffPoolId },
      request
    });
    return NextResponse.json({ entries: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
    console.error(error);
    return NextResponse.json({ message: "导入预录名单失败" }, { status: 500 });
  }
}

async function upsertCoreStaffProfile(tx: any, unitId: string, displayName: string, phone: string | null, tagIds: string[]) {
  const profile = await tx.staffProfile.upsert({
    where: { unitId_displayName: { unitId, displayName } },
    update: { phone: phone || undefined, poolType: "CORE", active: true },
    create: { unitId, displayName, poolType: "CORE", phone, active: true }
  });
  if (tagIds.length) {
    await tx.staffProfileTag.createMany({ data: tagIds.map((staffTagId) => ({ staffProfileId: profile.id, staffTagId })), skipDuplicates: true });
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
  const doctorType = profile.poolType === STAFF_POOL_TYPE.ROTATION ? DOCTOR_TYPE.INTERN : DOCTOR_TYPE.RESIDENT;
  const doctor = await tx.scheduleDoctor.upsert({
    where: { scheduleTaskId_name: { scheduleTaskId, name: profile.displayName } },
    update: { staffProfileId: profile.id, doctorType, active: true, tagSnapshotJson: tagSnapshot, policySnapshotJson: policySnapshot },
    create: {
      departmentId,
      scheduleTaskId,
      staffProfileId: profile.id,
      name: profile.displayName,
      doctorType,
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

function parseDate(value: unknown) {
  const text = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? dateFromKey(text) : null;
}
