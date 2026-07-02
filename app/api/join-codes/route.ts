import { NextResponse } from "next/server";
import { authErrorResponse, requireManagedUnit, USER_ROLE } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { createAccessCode, hashSecret } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { unit } = await requireManagedUnit(url.searchParams.get("unitId"));
    const codes = await prisma.joinCode.findMany({
      where: { unitId: unit.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, scheduleTaskId: true, staffPoolId: true, expiresAt: true, active: true, maxUses: true, useCount: true, createdAt: true, revokedAt: true }
    });
    return NextResponse.json({ codes });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { user, unit } = await requireManagedUnit(body.unitId);
    const scheduleTaskId = String(body.scheduleTaskId ?? "").trim() || null;
    const staffPoolId = String(body.staffPoolId ?? "").trim() || null;
    if (scheduleTaskId) {
      const task = await prisma.scheduleTask.findUnique({ where: { id: scheduleTaskId }, select: { unitId: true } });
      if (!task || task.unitId !== unit.id) return NextResponse.json({ message: "排班任务不存在或无权限" }, { status: 404 });
    }
    if (staffPoolId) {
      const pool = await prisma.staffPool.findUnique({ where: { id: staffPoolId }, select: { unitId: true } });
      if (!pool || pool.unitId !== unit.id) return NextResponse.json({ message: "人员池不存在或无权限" }, { status: 404 });
    }
    const plainCode = createAccessCode();
    const code = await prisma.joinCode.create({
      data: {
        hospitalId: unit.hospitalId,
        departmentId: unit.departmentId,
        unitId: unit.id,
        scheduleTaskId,
        staffPoolId,
        codeHash: hashSecret(plainCode),
        roleToGrant: USER_ROLE.MEMBER,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 35),
        active: true,
        maxUses: normalizeNullableInt(body.maxUses),
        createdByUserId: user.id
      },
      select: { id: true, scheduleTaskId: true, staffPoolId: true, expiresAt: true, active: true, maxUses: true, useCount: true, createdAt: true }
    });
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: unit.hospitalId,
      departmentId: unit.departmentId,
      unitId: unit.id,
      action: "CREATE_JOIN_CODE",
      targetType: "JoinCode",
      targetId: code.id,
      afterJson: { scheduleTaskId, staffPoolId, maxUses: code.maxUses },
      request
    });
    return NextResponse.json({ code, plainCode }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
    console.error(error);
    return NextResponse.json({ message: "生成加入码失败" }, { status: 500 });
  }
}

function normalizeNullableInt(value: unknown) {
  if (value == null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.floor(numberValue) : null;
}
