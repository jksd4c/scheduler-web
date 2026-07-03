import { NextResponse } from "next/server";
import { authErrorResponse, requireManagedUnit, USER_ROLE } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { decryptJoinCode, encryptJoinCode } from "@/lib/join-code-crypto";
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
      select: {
        id: true,
        hospitalId: true,
        departmentId: true,
        unitId: true,
        scheduleTaskId: true,
        staffPoolId: true,
        encryptedCode: true,
        expiresAt: true,
        active: true,
        maxUses: true,
        useCount: true,
        createdByUserId: true,
        createdAt: true,
        revokedAt: true
      }
    });
    const [hospitals, departments, units, tasks, pools, creators, claims] = await Promise.all([
      prisma.hospital.findMany({
        where: { id: { in: unique(codes.map((item) => item.hospitalId).filter(Boolean) as string[]) } },
        select: { id: true, name: true }
      }),
      prisma.department.findMany({
        where: { id: { in: unique(codes.map((item) => item.departmentId)) } },
        select: { id: true, name: true }
      }),
      prisma.unit.findMany({
        where: { id: { in: unique(codes.map((item) => item.unitId)) } },
        select: { id: true, name: true }
      }),
      prisma.scheduleTask.findMany({
        where: { id: { in: unique(codes.map((item) => item.scheduleTaskId).filter(Boolean) as string[]) } },
        select: { id: true, name: true, startDate: true, endDate: true, weekStartDate: true, weekEndDate: true, scheduleMode: true }
      }),
      prisma.staffPool.findMany({
        where: { id: { in: unique(codes.map((item) => item.staffPoolId).filter(Boolean) as string[]) } },
        select: { id: true, name: true, poolType: true }
      }),
      prisma.user.findMany({
        where: { id: { in: unique(codes.map((item) => item.createdByUserId).filter(Boolean) as string[]) } },
        select: { id: true, username: true, displayName: true }
      }),
      prisma.joinClaim.findMany({
        where: { joinCodeId: { in: codes.map((item) => item.id) } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          joinCodeId: true,
          inputName: true,
          inputPhone: true,
          matchStatus: true,
          reviewStatus: true,
          createdAt: true
        }
      })
    ]);

    const hospitalMap = new Map(hospitals.map((item) => [item.id, item.name]));
    const departmentMap = new Map(departments.map((item) => [item.id, item.name]));
    const unitMap = new Map(units.map((item) => [item.id, item.name]));
    const taskMap = new Map(tasks.map((item) => [item.id, item]));
    const poolMap = new Map(pools.map((item) => [item.id, item]));
    const creatorMap = new Map(creators.map((item) => [item.id, item.displayName || item.username]));
    const claimsByCode = new Map<string, typeof claims>();
    for (const claim of claims) {
      claimsByCode.set(claim.joinCodeId, [...(claimsByCode.get(claim.joinCodeId) ?? []), claim]);
    }

    return NextResponse.json({
      codes: codes.map((code) => {
        const task = code.scheduleTaskId ? taskMap.get(code.scheduleTaskId) : null;
        const pool = code.staffPoolId ? poolMap.get(code.staffPoolId) : null;
        const decrypted = safelyDecrypt(code.encryptedCode);
        return {
          id: code.id,
          purpose: pool ? `${pool.name}访问码` : task ? "排班任务访问码" : "通用访问码",
          hospitalName: code.hospitalId ? hospitalMap.get(code.hospitalId) ?? "-" : "-",
          departmentName: departmentMap.get(code.departmentId) ?? "-",
          unitName: unitMap.get(code.unitId) ?? "-",
          scheduleTaskId: code.scheduleTaskId,
          scheduleTaskLabel: task ? `${task.name || "排班任务"}：${formatDate((task as any).startDate ?? task.weekStartDate)} 至 ${formatDate((task as any).endDate ?? task.weekEndDate)}` : null,
          staffPoolId: code.staffPoolId,
          staffPoolLabel: pool ? pool.name : null,
          codeValue: decrypted.value,
          codeUnavailableReason: decrypted.value ? null : decrypted.reason,
          expiresAt: code.expiresAt,
          active: code.active,
          maxUses: code.maxUses,
          useCount: code.useCount,
          createdByName: code.createdByUserId ? creatorMap.get(code.createdByUserId) ?? "-" : "-",
          createdAt: code.createdAt,
          revokedAt: code.revokedAt,
          usageRecords: claimsByCode.get(code.id) ?? []
        };
      })
    });
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
    const encryptedCode = encryptJoinCode(plainCode);
    const code = await prisma.joinCode.create({
      data: {
        hospitalId: unit.hospitalId,
        departmentId: unit.departmentId,
        unitId: unit.id,
        scheduleTaskId,
        staffPoolId,
        codeHash: hashSecret(plainCode),
        encryptedCode,
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

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function safelyDecrypt(encryptedCode: string | null) {
  if (!encryptedCode) {
    return { value: null, reason: "历史访问码无法查看，请重新生成" };
  }
  try {
    const value = decryptJoinCode(encryptedCode);
    return value
      ? { value, reason: null }
      : { value: null, reason: "访问码格式无法识别，请重新生成" };
  } catch {
    return { value: null, reason: "访问码加密密钥不匹配，请重新生成" };
  }
}
