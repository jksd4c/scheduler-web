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
    if (typeof body.name === "string" && body.name.trim()) {
      data.name = body.name.trim();
    }
    if (typeof body.isActive === "boolean") {
      data.isActive = body.isActive;
    }
    const before = await prisma.department.findUnique({ where: { id: params.id } });
    if (!before) {
      return NextResponse.json({ message: "科室不存在" }, { status: 404 });
    }
    const department = await prisma.department.update({ where: { id: params.id }, data, include: { hospital: true } });
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: department.hospitalId,
      departmentId: department.id,
      action: "UPDATE_DEPARTMENT",
      targetType: "Department",
      targetId: department.id,
      beforeJson: { name: before.name, isActive: before.isActive },
      afterJson: { name: department.name, isActive: department.isActive },
      request
    });
    return NextResponse.json({ department });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    return NextResponse.json({ message: "更新科室失败" }, { status: 500 });
  }
}
