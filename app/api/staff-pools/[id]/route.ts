import { NextResponse } from "next/server";
import { authErrorResponse, requireManagedUnit } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { dateFromKey } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { normalizePoolType } from "@/lib/roster-workflow";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const current = await prisma.staffPool.findUnique({ where: { id: params.id } });
    if (!current) return NextResponse.json({ message: "人员池不存在" }, { status: 404 });
    const { user, unit } = await requireManagedUnit(current.unitId);
    const body = await request.json();
    const data: Record<string, unknown> = {};
    if ("name" in body) data.name = String(body.name ?? "").trim() || current.name;
    if ("poolType" in body) data.poolType = normalizePoolType(body.poolType);
    if ("startDate" in body) data.startDate = parseDate(body.startDate);
    if ("endDate" in body) data.endDate = parseDate(body.endDate);
    if ("active" in body) data.active = body.active !== false;
    const pool = await prisma.staffPool.update({ where: { id: current.id }, data });
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: unit.hospitalId,
      departmentId: unit.departmentId,
      unitId: unit.id,
      action: "UPDATE_STAFF_POOL",
      targetType: "StaffPool",
      targetId: pool.id,
      beforeJson: current,
      afterJson: pool,
      request
    });
    return NextResponse.json({ pool });
  } catch (error) {
    return authErrorResponse(error);
  }
}

function parseDate(value: unknown) {
  const text = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? dateFromKey(text) : null;
}
