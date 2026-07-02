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

    const before = await prisma.hospital.findUnique({ where: { id: params.id } });
    if (!before) {
      return NextResponse.json({ message: "医院不存在" }, { status: 404 });
    }

    const hospital = await prisma.hospital.update({ where: { id: params.id }, data });
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: hospital.id,
      action: "UPDATE_HOSPITAL",
      targetType: "Hospital",
      targetId: hospital.id,
      beforeJson: { name: before.name, isActive: before.isActive },
      afterJson: { name: hospital.name, isActive: hospital.isActive },
      request
    });
    return NextResponse.json({ hospital });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    return NextResponse.json({ message: "更新医院失败" }, { status: 500 });
  }
}
