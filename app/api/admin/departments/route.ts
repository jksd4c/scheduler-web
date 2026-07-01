import { NextResponse } from "next/server";
import { authErrorResponse, requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSuperAdmin();
    const departments = await prisma.department.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { users: true, scheduleTasks: true } } }
    });
    return NextResponse.json({ departments });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireSuperAdmin();
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ message: "请输入科室名称" }, { status: 400 });
    }
    const department = await prisma.department.create({ data: { name, isActive: true } });
    return NextResponse.json({ department }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    return NextResponse.json({ message: "创建科室失败，名称可能已存在" }, { status: 500 });
  }
}
