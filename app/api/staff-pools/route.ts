import { NextResponse } from "next/server";
import { authErrorResponse, requireManagedUnit } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { dateFromKey } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { normalizePoolType } from "@/lib/roster-workflow";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { unit } = await requireManagedUnit(url.searchParams.get("unitId"));
    const pools = await prisma.staffPool.findMany({
      where: { unitId: unit.id },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }]
    });
    return NextResponse.json({ pools });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { user, unit } = await requireManagedUnit(body.unitId);
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ message: "请填写人员池名称" }, { status: 400 });
    const poolType = normalizePoolType(body.poolType);
    const scheduleTaskId = String(body.scheduleTaskId ?? "").trim() || null;
    if (scheduleTaskId) {
      const task = await prisma.scheduleTask.findUnique({ where: { id: scheduleTaskId }, select: { unitId: true } });
      if (!task || task.unitId !== unit.id) return NextResponse.json({ message: "排班任务不存在或无权限" }, { status: 404 });
    }
    const pool = await prisma.staffPool.create({
      data: {
        hospitalId: unit.hospitalId,
        departmentId: unit.departmentId,
        unitId: unit.id,
        scheduleTaskId,
        poolType,
        name,
        startDate: parseDate(body.startDate),
        endDate: parseDate(body.endDate),
        active: body.active !== false,
        createdByUserId: user.id
      }
    });
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: unit.hospitalId,
      departmentId: unit.departmentId,
      unitId: unit.id,
      action: "CREATE_STAFF_POOL",
      targetType: "StaffPool",
      targetId: pool.id,
      afterJson: { name, poolType, scheduleTaskId },
      request
    });
    return NextResponse.json({ pool }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
    console.error(error);
    return NextResponse.json({ message: "创建人员池失败" }, { status: 500 });
  }
}

function parseDate(value: unknown) {
  const text = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? dateFromKey(text) : null;
}
