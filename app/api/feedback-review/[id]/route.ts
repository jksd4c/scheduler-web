import { NextResponse } from "next/server";
import { authErrorResponse, requireManagedUnit } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { normalizePreferredShiftType, normalizePreferenceStrength } from "@/lib/preferences";
import { prisma } from "@/lib/prisma";
import { MEMBER_FEEDBACK_STATUS } from "@/lib/roster-workflow";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const current = await prisma.memberFeedback.findUnique({ where: { id: params.id } });
    if (!current || !current.unitId) return NextResponse.json({ message: "反馈不存在" }, { status: 404 });
    const { user, unit } = await requireManagedUnit(current.unitId);
    const body = await request.json();
    const action = String(body.action ?? "").toUpperCase();
    const reason = String(body.reason ?? "").trim() || null;
    const preferredShiftType = normalizePreferredShiftType(body.preferredShiftType ?? current.preferredShiftType);
    const preferenceStrength = normalizePreferenceStrength(body.preferenceStrength ?? current.preferenceStrength);
    const preferenceNote = String(body.preferenceNote ?? current.preferenceNote ?? "").trim() || null;
    const data =
      action === "APPROVE"
        ? { status: MEMBER_FEEDBACK_STATUS.APPROVED, effective: true, reviewedAt: new Date(), reviewedByUserId: user.id, reviewReason: reason, preferredShiftType, preferenceStrength, preferenceNote }
        : { status: MEMBER_FEEDBACK_STATUS.REJECTED, effective: false, reviewedAt: new Date(), reviewedByUserId: user.id, reviewReason: reason };
    const feedback = await prisma.$transaction(async (tx) => {
      const updated = await tx.memberFeedback.update({ where: { id: current.id }, data });
      if (action === "APPROVE" && current.rosterEntryId) {
        const rosterEntry = await tx.rosterEntry.findUnique({ where: { id: current.rosterEntryId }, select: { staffProfileId: true } });
        if (rosterEntry?.staffProfileId) {
          await tx.staffProfile.update({
            where: { id: rosterEntry.staffProfileId },
            data: { preferredShiftType, preferenceStrength, preferenceNote }
          });
        }
      }
      return updated;
    });
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: unit.hospitalId,
      departmentId: unit.departmentId,
      unitId: unit.id,
      action: action === "APPROVE" ? "APPROVE_MEMBER_FEEDBACK" : "REJECT_MEMBER_FEEDBACK",
      targetType: "MemberFeedback",
      targetId: feedback.id,
      beforeJson: current,
      afterJson: { ...feedback, preferredShiftType, preferenceStrength },
      reason,
      request
    });
    return NextResponse.json({ feedback });
  } catch (error) {
    return authErrorResponse(error);
  }
}
