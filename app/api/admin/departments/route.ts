import { NextResponse } from "next/server";
import { authErrorResponse, requireSuperAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSuperAdmin();
    const departments = await prisma.department.findMany({
      orderBy: { createdAt: "asc" },
      include: { hospital: true, _count: { select: { users: true, units: true, scheduleTasks: true } } }
    });
    return NextResponse.json({ departments });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSuperAdmin();
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const hospitalId = String(body.hospitalId ?? "").trim();
    if (!name) {
      return NextResponse.json({ message: "请输入科室名称" }, { status: 400 });
    }
    if (!hospitalId) {
      return NextResponse.json({ message: "请选择医院" }, { status: 400 });
    }
    const hospital = await prisma.hospital.findUnique({ where: { id: hospitalId } });
    if (!hospital || !hospital.isActive) {
      return NextResponse.json({ message: "医院不存在或已停用" }, { status: 400 });
    }
    const department = await prisma.department.create({ data: { hospitalId, name, isActive: true }, include: { hospital: true } });
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId,
      departmentId: department.id,
      action: "CREATE_DEPARTMENT",
      targetType: "Department",
      targetId: department.id,
      afterJson: { name: department.name, hospitalId, isActive: department.isActive },
      request
    });
    return NextResponse.json({ department }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    return NextResponse.json({ message: "创建科室失败，名称可能已存在" }, { status: 500 });
  }
}
