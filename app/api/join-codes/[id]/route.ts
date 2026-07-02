import { NextResponse } from "next/server";
import { authErrorResponse, requireManagedUnit } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { encryptJoinCode } from "@/lib/join-code-crypto";
import { createAccessCode, hashSecret } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const current = await prisma.joinCode.findUnique({ where: { id: params.id } });
    if (!current) return NextResponse.json({ message: "加入码不存在" }, { status: 404 });
    const { user, unit } = await requireManagedUnit(current.unitId);
    const code = await prisma.joinCode.update({ where: { id: current.id }, data: { active: false, revokedAt: new Date() } });
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: unit.hospitalId,
      departmentId: unit.departmentId,
      unitId: unit.id,
      action: "REVOKE_JOIN_CODE",
      targetType: "JoinCode",
      targetId: code.id,
      request
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "").trim();
    const current = await prisma.joinCode.findUnique({ where: { id: params.id } });
    if (!current) return NextResponse.json({ message: "访问码不存在" }, { status: 404 });
    const { user, unit } = await requireManagedUnit(current.unitId);

    if (action === "COPY_CODE" || action === "COPY_LINK") {
      await writeAuditLog({
        actorUserId: user.id,
        hospitalId: unit.hospitalId,
        departmentId: unit.departmentId,
        unitId: unit.id,
        action,
        targetType: "JoinCode",
        targetId: current.id,
        request
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "REGENERATE") {
      const plainCode = createAccessCode();
      const code = await prisma.joinCode.update({
        where: { id: current.id },
        data: {
          codeHash: hashSecret(plainCode),
          encryptedCode: encryptJoinCode(plainCode),
          active: true,
          revokedAt: null,
          useCount: 0,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 35)
        },
        select: { id: true, expiresAt: true, active: true, useCount: true, maxUses: true }
      });
      await writeAuditLog({
        actorUserId: user.id,
        hospitalId: unit.hospitalId,
        departmentId: unit.departmentId,
        unitId: unit.id,
        action: "REGENERATE_JOIN_CODE",
        targetType: "JoinCode",
        targetId: code.id,
        afterJson: { expiresAt: code.expiresAt, active: code.active, maxUses: code.maxUses },
        request
      });
      return NextResponse.json({ code, plainCode });
    }

    return NextResponse.json({ message: "不支持的访问码操作" }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
    console.error(error);
    return NextResponse.json({ message: "访问码操作失败" }, { status: 500 });
  }
}
