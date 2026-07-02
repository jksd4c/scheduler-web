import { NextResponse } from "next/server";
import { authErrorResponse, requireSuperAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireSuperAdmin();
    const body = await request.json();
    const data: { name?: string; isActive?: boolean } = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;

    const before = await prisma.unit.findUnique({ where: { id: params.id } });
    if (!before) {
      return NextResponse.json({ message: "病区不存在" }, { status: 404 });
    }

    const unit = await prisma.unit.update({
      where: { id: params.id },
      data,
      include: { hospital: true, department: true, createdByUser: true }
    });
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: unit.hospitalId,
      departmentId: unit.departmentId,
      unitId: unit.id,
      action: "UPDATE_UNIT",
      targetType: "Unit",
      targetId: unit.id,
      beforeJson: { name: before.name, isActive: before.isActive },
      afterJson: { name: unit.name, isActive: unit.isActive },
      request
    });
    return NextResponse.json({ unit });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    return NextResponse.json({ message: "更新病区失败" }, { status: 500 });
  }
}
