import { NextResponse } from "next/server";
import { authErrorResponse, requireManagedUnit } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
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
