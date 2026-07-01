import { NextResponse } from "next/server";
import { authErrorResponse, requireSuperAdmin, USER_ROLE } from "@/lib/auth";
import { hashSecret } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSuperAdmin();
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { department: true }
    });
    return NextResponse.json({ users });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireSuperAdmin();
    const body = await request.json();
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const role = body.role === USER_ROLE.SUPER_ADMIN ? USER_ROLE.SUPER_ADMIN : USER_ROLE.DEPARTMENT_ADMIN;
    const departmentId = role === USER_ROLE.SUPER_ADMIN ? null : String(body.departmentId ?? "");

    if (!username || password.length < 8) {
      return NextResponse.json({ message: "用户名不能为空，密码至少 8 位" }, { status: 400 });
    }
    if (role === USER_ROLE.DEPARTMENT_ADMIN && !departmentId) {
      return NextResponse.json({ message: "科室管理员必须选择科室" }, { status: 400 });
    }

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: hashSecret(password),
        role,
        departmentId,
        mustChangePassword: body.mustChangePassword !== false,
        isActive: true
      }
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    return NextResponse.json({ message: "创建用户失败，用户名可能已存在" }, { status: 500 });
  }
}
