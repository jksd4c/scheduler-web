import { NextResponse } from "next/server";
import { authErrorResponse, requireManagedUnit } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { DOCTOR_TYPE } from "@/lib/schedule-rules";
import { evaluateFeedbackStatus, JOIN_REVIEW_STATUS, MEMBER_FEEDBACK_STATUS, ROSTER_STATUS, STAFF_POOL_TYPE } from "@/lib/roster-workflow";
import { buildTagSnapshot, resolveEffectivePolicy } from "@/lib/staff-policy";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const current = await prisma.joinClaim.findUnique({ where: { id: params.id } });
    if (!current) return NextResponse.json({ message: "加入申请不存在" }, { status: 404 });
    const { user, unit } = await requireManagedUnit(current.unitId);
    const body = await request.json();
    const action = String(body.action ?? "").toUpperCase();
    const rejectReason = String(body.rejectReason ?? "").trim() || null;

    const updated = await prisma.$transaction(async (tx) => {
      if (action === "REJECT") {
        const claim = await tx.joinClaim.update({
          where: { id: current.id },
          data: { reviewStatus: JOIN_REVIEW_STATUS.REJECTED, reviewedAt: new Date(), reviewedByUserId: user.id, rejectReason }
        });
        if (current.rosterEntryId) {
          await tx.rosterEntry.update({ where: { id: current.rosterEntryId }, data: { status: ROSTER_STATUS.REJECTED, includeInScheduling: false } });
        }
        await tx.memberFeedback.updateMany({ where: { joinClaimId: current.id }, data: { status: MEMBER_FEEDBACK_STATUS.REJECTED, effective: false, reviewReason: rejectReason } });
        return claim;
      }

      if (action === "NO_SHOW") {
        const claim = await tx.joinClaim.update({
          where: { id: current.id },
          data: { reviewStatus: JOIN_REVIEW_STATUS.REJECTED, reviewedAt: new Date(), reviewedByUserId: user.id, rejectReason: rejectReason ?? "未报到" }
        });
        if (current.rosterEntryId) {
          await tx.rosterEntry.update({ where: { id: current.rosterEntryId }, data: { status: ROSTER_STATUS.NO_SHOW, includeInScheduling: false } });
        }
        return claim;
      }

      if (action !== "APPROVE") return current;
      const rosterEntry = current.rosterEntryId ? await tx.rosterEntry.findUnique({ where: { id: current.rosterEntryId } }) : null;
      if (!rosterEntry) {
        throw new JoinReviewError("未匹配预录名单，不能直接确认。请先补录名单或驳回申请。", 409);
      }
      if (rosterEntry.status === ROSTER_STATUS.CONFIRMED && rosterEntry.userId && rosterEntry.userId !== current.userId) {
        throw new JoinReviewError("该预录名单已确认给其他账号", 409);
      }
      const inputUser = await tx.user.findUnique({ where: { id: current.userId } });
      if (!inputUser) throw new Error("申请用户不存在");
      const displayName = rosterEntry?.expectedName || inputUser.displayName || current.inputName;
      const tagIds = Array.isArray(rosterEntry?.identityTagIds) ? rosterEntry?.identityTagIds.map(String).filter(Boolean) : [];
      const staffProfile = await tx.staffProfile.upsert({
        where: { unitId_displayName: { unitId: unit.id, displayName } },
        update: { userId: inputUser.id, phone: current.inputPhone, poolType: STAFF_POOL_TYPE.ROTATION, active: true },
        create: { unitId: unit.id, userId: inputUser.id, displayName, phone: current.inputPhone, poolType: STAFF_POOL_TYPE.ROTATION, active: true }
      });
      if (tagIds.length) {
        await tx.staffProfileTag.createMany({ data: tagIds.map((staffTagId) => ({ staffProfileId: staffProfile.id, staffTagId })), skipDuplicates: true });
      }
      if (current.scheduleTaskId) {
        await ensureScheduleDoctor(tx, current.scheduleTaskId, unit.departmentId, staffProfile.id);
      }
      if (rosterEntry) {
        await tx.rosterEntry.update({
          where: { id: rosterEntry.id },
          data: { staffProfileId: staffProfile.id, userId: inputUser.id, status: ROSTER_STATUS.CONFIRMED, includeInScheduling: true }
        });
      }
      const claim = await tx.joinClaim.update({
        where: { id: current.id },
        data: { reviewStatus: JOIN_REVIEW_STATUS.APPROVED, reviewedAt: new Date(), reviewedByUserId: user.id, rejectReason: null }
      });
      await refreshWaitingFeedback(tx, current.id, current.scheduleTaskId);
      return claim;
    });

    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: unit.hospitalId,
      departmentId: unit.departmentId,
      unitId: unit.id,
      action: action === "APPROVE" ? "APPROVE_JOIN_CLAIM" : action === "NO_SHOW" ? "MARK_ROSTER_NO_SHOW" : "REJECT_JOIN_CLAIM",
      targetType: "JoinClaim",
      targetId: current.id,
      beforeJson: current,
      afterJson: updated,
      reason: rejectReason,
      request
    });
    return NextResponse.json({ claim: updated });
  } catch (error) {
    if (error instanceof JoinReviewError) return NextResponse.json({ message: error.message }, { status: error.status });
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
    console.error(error);
    return NextResponse.json({ message: "审核加入申请失败" }, { status: 500 });
  }
}

class JoinReviewError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
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

async function refreshWaitingFeedback(tx: any, joinClaimId: string, scheduleTaskId: string | null) {
  const feedback = await tx.memberFeedback.findMany({
    where: { joinClaimId, status: MEMBER_FEEDBACK_STATUS.WAITING_IDENTITY_CONFIRMATION },
    include: { unavailableTimes: true }
  });
  let periodDays = 7;
  if (scheduleTaskId) {
    const task = await tx.scheduleTask.findUnique({ where: { id: scheduleTaskId }, select: { startDate: true, endDate: true, weekStartDate: true, weekEndDate: true } });
    if (task) {
      const start = task.startDate ?? task.weekStartDate;
      const end = task.endDate ?? task.weekEndDate;
      periodDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    }
  }
  for (const item of feedback) {
    const status = evaluateFeedbackStatus({
      unavailableCount: item.unavailableTimes.length,
      periodDays,
      identityConfirmed: true,
      hasMessage: Boolean(item.message?.trim())
    });
    await tx.memberFeedback.update({
      where: { id: item.id },
      data: { status: status.status, effective: status.effective, anomalyStatus: status.anomalyStatus }
    });
  }
}
