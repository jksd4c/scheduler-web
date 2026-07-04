import { NextResponse } from "next/server";
import { createUserSession, USER_ROLE } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { hashSecret, verifySecret } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { JOIN_MATCH_STATUS, JOIN_REVIEW_STATUS, matchRosterEntry, normalizePhone, ROSTER_STATUS } from "@/lib/roster-workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const codeText = String(body.code ?? "").trim();
    const inputName = String(body.name ?? "").trim();
    const inputPhone = normalizePhone(body.phone);
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (!codeText || !inputName || !inputPhone || !username || password.length < 8) {
      return NextResponse.json({ message: "请填写加入码、姓名、手机号、用户名和至少 8 位密码" }, { status: 400 });
    }

    const codes = await prisma.joinCode.findMany({
      where: { active: true, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" }
    });
    const code = codes.find((item) => verifySecret(codeText, item.codeHash) && (!item.maxUses || item.useCount < item.maxUses));
    if (!code) return NextResponse.json({ message: "加入码无效、已过期或已达到使用上限" }, { status: 401 });

    const rosterEntries = await prisma.rosterEntry.findMany({
      where: {
        unitId: code.unitId,
        ...(code.scheduleTaskId ? { scheduleTaskId: code.scheduleTaskId } : {}),
        ...(code.staffPoolId ? { staffPoolId: code.staffPoolId } : {})
      },
      select: { id: true, expectedName: true, expectedPhone: true, status: true }
    });
    const match = matchRosterEntry({ name: inputName, phone: inputPhone }, rosterEntries);
    const requiresRosterMatch = Boolean(code.scheduleTaskId || code.staffPoolId);
    const isRosterException = requiresRosterMatch && match.matchStatus === JOIN_MATCH_STATUS.UNMATCHED;

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { OR: [{ username }, { phone: inputPhone }] }
      });
      let user = existing;
      if (existing) {
        if (existing.username !== username && existing.phone === inputPhone) {
          throw new JoinError("该手机号已绑定其他用户名，请使用原账号用户名加入", 409);
        }
        if (!verifySecret(password, existing.passwordHash)) {
          throw new JoinError("账号或密码错误，无法确认手机号", 401);
        }
        user = await tx.user.update({
          where: { id: existing.id },
          data: {
            displayName: existing.displayName || inputName,
            phone: inputPhone,
            hospitalId: existing.hospitalId ?? code.hospitalId,
            departmentId: existing.departmentId ?? code.departmentId,
            unitId: existing.unitId ?? code.unitId,
            isActive: true
          }
        });
      } else {
        user = await tx.user.create({
          data: {
            username,
            displayName: inputName,
            phone: inputPhone,
            passwordHash: hashSecret(password),
            role: USER_ROLE.MEMBER,
            hospitalId: code.hospitalId,
            departmentId: code.departmentId,
            unitId: code.unitId,
            mustChangePassword: false,
            isActive: true
          }
        });
      }

      const claim = await tx.joinClaim.create({
        data: {
          joinCodeId: code.id,
          userId: user.id,
          rosterEntryId: match.rosterEntry?.id ?? null,
          hospitalId: code.hospitalId,
          departmentId: code.departmentId,
          unitId: code.unitId,
          scheduleTaskId: code.scheduleTaskId,
          staffPoolId: code.staffPoolId,
          inputName,
          inputPhone,
          matchStatus: match.matchStatus,
          reviewStatus: isRosterException ? JOIN_REVIEW_STATUS.EXCEPTION_PENDING : JOIN_REVIEW_STATUS.PENDING,
          rejectReason: isRosterException ? "名单外申请：姓名和手机号未匹配到本次预录名单" : null
        }
      });
      if (match.rosterEntry) {
        await tx.rosterEntry.update({
          where: { id: match.rosterEntry.id },
          data: { status: ROSTER_STATUS.CLAIMED, userId: user.id }
        });
      }
      await tx.joinCode.update({ where: { id: code.id }, data: { useCount: { increment: 1 } } });
      return { user, claim };
    });

    await writeAuditLog({
      actorUserId: result.user.id,
      hospitalId: code.hospitalId,
      departmentId: code.departmentId,
      unitId: code.unitId,
      action: "SUBMIT_JOIN_CLAIM",
      targetType: "JoinClaim",
      targetId: result.claim.id,
      afterJson: { matchStatus: result.claim.matchStatus, reviewStatus: result.claim.reviewStatus, hasRosterEntry: Boolean(result.claim.rosterEntryId) },
      request
    });
    if (isRosterException) {
      await writeAuditLog({
        actorUserId: result.user.id,
        hospitalId: code.hospitalId,
        departmentId: code.departmentId,
        unitId: code.unitId,
        action: "SUBMIT_UNMATCHED_JOIN_CLAIM",
        targetType: "JoinClaim",
        targetId: result.claim.id,
        afterJson: {
          matchStatus: result.claim.matchStatus,
          reviewStatus: result.claim.reviewStatus,
          scheduleTaskId: code.scheduleTaskId,
          staffPoolId: code.staffPoolId
        },
        reason: "访问码绑定名单，但申请人未匹配预录名单",
        request
      });
      return NextResponse.json(
        {
          claim: result.claim,
          message: "你填写的姓名不在本次排班名单中，请联系排班管理员确认。"
        },
        { status: 409 }
      );
    }
    await createUserSession(result.user.id);
    return NextResponse.json({ claim: result.claim, redirectTo: "/member/feedback" }, { status: 201 });
  } catch (error) {
    if (error instanceof JoinError) return NextResponse.json({ message: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ message: "加入申请提交失败" }, { status: 500 });
  }
}

class JoinError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
