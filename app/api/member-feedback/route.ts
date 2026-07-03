import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { dateFromKey } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { evaluateFeedbackStatus, JOIN_REVIEW_STATUS, ROSTER_STATUS, normalizeTimeSlot } from "@/lib/roster-workflow";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const feedback = await prisma.memberFeedback.findMany({
      where: { userId: user.id },
      include: { unavailableTimes: true },
      orderBy: { createdAt: "desc" }
    });
    return NextResponse.json({ feedback });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user.phone) return NextResponse.json({ message: "请先绑定手机号" }, { status: 400 });
    const body = await request.json();
    const claim = await prisma.joinClaim.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" }
    });
    if (!claim) return NextResponse.json({ message: "请先通过加入码提交加入申请" }, { status: 400 });
    const unavailable = Array.isArray(body.unavailableTimes) ? body.unavailableTimes : [];
    const records = unavailable
      .map((item: any) => {
        const date = String(item.date ?? "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
        return { date, timeSlot: normalizeTimeSlot(item.timeSlot), reason: String(item.reason ?? "").trim() || null };
      })
      .filter(Boolean) as Array<{ date: string; timeSlot: string; reason: string | null }>;
    const message = String(body.message ?? "").trim();
    const title = String(body.title ?? "").trim() || "成员排班反馈";
    const periodDays = await getPeriodDays(claim.scheduleTaskId);
    const rosterEntry = claim.rosterEntryId
      ? await prisma.rosterEntry.findUnique({
          where: { id: claim.rosterEntryId },
          select: { status: true, includeInScheduling: true }
        })
      : null;
    const identityConfirmed =
      claim.reviewStatus === JOIN_REVIEW_STATUS.APPROVED &&
      rosterEntry?.status === ROSTER_STATUS.CONFIRMED &&
      rosterEntry.includeInScheduling;
    const decision = evaluateFeedbackStatus({
      unavailableCount: records.length,
      periodDays,
      identityConfirmed,
      hasMessage: Boolean(message)
    });
    const feedback = await prisma.memberFeedback.create({
      data: {
        userId: user.id,
        joinClaimId: claim.id,
        rosterEntryId: claim.rosterEntryId,
        scheduleTaskId: claim.scheduleTaskId,
        hospitalId: claim.hospitalId,
        departmentId: claim.departmentId,
        unitId: claim.unitId,
        title,
        message,
        canWorkShiftTypeIds: Array.isArray(body.canWorkShiftTypeIds) ? body.canWorkShiftTypeIds.map(String).filter(Boolean) : [],
        status: decision.status,
        effective: decision.effective,
        anomalyStatus: decision.anomalyStatus,
        unavailableTimes: { create: records.map((item) => ({ date: dateFromKey(item.date), timeSlot: item.timeSlot, reason: item.reason })) }
      },
      include: { unavailableTimes: true }
    });
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: claim.hospitalId,
      departmentId: claim.departmentId,
      unitId: claim.unitId,
      action: "SUBMIT_MEMBER_FEEDBACK",
      targetType: "MemberFeedback",
      targetId: feedback.id,
      afterJson: { status: feedback.status, effective: feedback.effective, unavailableCount: records.length },
      request
    });
    return NextResponse.json({ feedback }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
    console.error(error);
    return NextResponse.json({ message: "提交成员反馈失败" }, { status: 500 });
  }
}

async function getPeriodDays(scheduleTaskId: string | null) {
  if (!scheduleTaskId) return 7;
  const task = await prisma.scheduleTask.findUnique({ where: { id: scheduleTaskId }, select: { startDate: true, endDate: true, weekStartDate: true, weekEndDate: true } });
  if (!task) return 7;
  const start = task.startDate ?? task.weekStartDate;
  const end = task.endDate ?? task.weekEndDate;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}
