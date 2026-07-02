import { NextResponse } from "next/server";
import { authErrorResponse, requireSuperAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSuperAdmin();
    const hospitals = await prisma.hospital.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { departments: true, units: true, users: true, scheduleTasks: true } } }
    });
    return NextResponse.json({ hospitals });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSuperAdmin();
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ message: "请输入医院名称" }, { status: 400 });
    }
    const hospital = await prisma.hospital.create({ data: { name, isActive: true } });
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: hospital.id,
      action: "CREATE_HOSPITAL",
      targetType: "Hospital",
      targetId: hospital.id,
      afterJson: { name: hospital.name, isActive: hospital.isActive },
      request
    });
    return NextResponse.json({ hospital }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    return NextResponse.json({ message: "创建医院失败，名称可能已存在" }, { status: 500 });
  }
}
