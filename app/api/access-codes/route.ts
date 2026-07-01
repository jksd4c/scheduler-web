import { NextResponse } from "next/server";
import { authErrorResponse, requireDepartmentAdmin } from "@/lib/auth";
import { createAccessCode, hashSecret } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireDepartmentAdmin();
    const departmentId = user.departmentId!;
    const codes = await prisma.departmentAccessCode.findMany({
      where: { departmentId },
      orderBy: { createdAt: "desc" },
      select: { id: true, expiresAt: true, isActive: true, createdAt: true }
    });
    return NextResponse.json({ codes });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST() {
  try {
    const user = await requireDepartmentAdmin();
    const departmentId = user.departmentId!;
    const plainCode = createAccessCode();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    const code = await prisma.departmentAccessCode.create({
      data: {
        departmentId,
        codeHash: hashSecret(plainCode),
        expiresAt,
        isActive: true
      },
      select: { id: true, expiresAt: true, isActive: true, createdAt: true }
    });
    return NextResponse.json({ code, plainCode }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    return NextResponse.json({ message: "生成访问密码失败" }, { status: 500 });
  }
}
