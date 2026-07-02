import { NextResponse } from "next/server";
import { authErrorResponse, requireSuperAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSuperAdmin();
    const units = await prisma.unit.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        hospital: true,
        department: true,
        createdByUser: true,
        _count: { select: { users: true, scheduleTasks: true } }
      }
    });
    return NextResponse.json({ units });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSuperAdmin();
    const body = await request.json();
    const departmentId = String(body.departmentId ?? "").trim();
    const name = String(body.name ?? "").trim();
    if (!departmentId || !name) {
      return NextResponse.json({ message: "请选择科室并填写病区名称" }, { status: 400 });
    }
    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department || !department.isActive) {
      return NextResponse.json({ message: "科室不存在或已停用" }, { status: 400 });
    }
    const unit = await prisma.unit.create({
      data: {
        hospitalId: department.hospitalId,
        departmentId,
        name,
        isActive: true,
        createdByUserId: user.id
      },
      include: { hospital: true, department: true, createdByUser: true }
    });
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: unit.hospitalId,
      departmentId: unit.departmentId,
      unitId: unit.id,
      action: "CREATE_UNIT",
      targetType: "Unit",
      targetId: unit.id,
      afterJson: { name: unit.name, isActive: unit.isActive },
      request
    });
    return NextResponse.json({ unit }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    return NextResponse.json({ message: "创建病区失败，名称可能已存在" }, { status: 500 });
  }
}
