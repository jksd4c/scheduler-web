import { NextResponse } from "next/server";
import { nowMs, withApiTiming } from "@/lib/api-timing";
import { writeAuditLog } from "@/lib/audit";
import { authErrorResponse, requireManagedUnit } from "@/lib/auth";
import { toDateKey } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const start = nowMs();
  let role: string | null = null;
  try {
    const current = await prisma.specialDate.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        hospitalId: true,
        departmentId: true,
        unitId: true,
        date: true,
        dateType: true,
        name: true
      }
    });
    if (!current || !current.unitId) {
      return withApiTiming(NextResponse.json({ message: "特殊日期不存在" }, { status: 404 }), {
        route: "DELETE /api/special-dates/[id]",
        start,
        role
      });
    }

    const { user, unit } = await requireManagedUnit(current.unitId);
    role = user.role;
    if (unit.id !== current.unitId) {
      return withApiTiming(NextResponse.json({ message: "无权限删除该特殊日期" }, { status: 403 }), {
        route: "DELETE /api/special-dates/[id]",
        start,
        role
      });
    }

    await prisma.specialDate.delete({ where: { id: current.id } });

    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: unit.hospitalId,
      departmentId: unit.departmentId,
      unitId: unit.id,
      action: "DELETE_SPECIAL_DATE",
      targetType: "SpecialDate",
      targetId: current.id,
      beforeJson: { date: toDateKey(current.date), dateType: current.dateType, name: current.name },
      request
    });

    return withApiTiming(NextResponse.json({ ok: true }), {
      route: "DELETE /api/special-dates/[id]",
      start,
      role
    });
  } catch (error) {
    const response = authErrorResponse(error);
    return withApiTiming(response, { route: "DELETE /api/special-dates/[id]", start, role });
  }
}
