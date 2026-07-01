import { NextResponse } from "next/server";
import { authErrorResponse, requireSuperAdmin, USER_ROLE } from "@/lib/auth";
import { hashSecret } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function wouldRemoveLastActiveSuperAdmin(userId: string, next: { role?: string; isActive?: boolean }) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.role !== USER_ROLE.SUPER_ADMIN || !target.isActive) {
    return false;
  }

  const activeSuperAdminCount = await prisma.user.count({
    where: { role: USER_ROLE.SUPER_ADMIN, isActive: true }
  });

  const deactivating = next.isActive === false;
  const demoting = typeof next.role === "string" && next.role !== USER_ROLE.SUPER_ADMIN;
  return activeSuperAdminCount <= 1 && (deactivating || demoting);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireSuperAdmin();
    const body = await request.json();
    const data: {
      isActive?: boolean;
      mustChangePassword?: boolean;
      departmentId?: string | null;
      passwordHash?: string;
      role?: string;
    } = {};

    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (typeof body.mustChangePassword === "boolean") data.mustChangePassword = body.mustChangePassword;
    if (typeof body.departmentId === "string") data.departmentId = body.departmentId || null;
    if (body.role === USER_ROLE.SUPER_ADMIN || body.role === USER_ROLE.DEPARTMENT_ADMIN) {
      data.role = body.role;
      if (body.role === USER_ROLE.SUPER_ADMIN) data.departmentId = null;
    }
    if (typeof body.password === "string" && body.password.length > 0) {
      if (body.password.length < 8) {
        return NextResponse.json({ message: "新密码至少 8 位" }, { status: 400 });
      }
      data.passwordHash = hashSecret(body.password);
      data.mustChangePassword = body.mustChangePassword !== false;
    }

    if (await wouldRemoveLastActiveSuperAdmin(params.id, data)) {
      return NextResponse.json({ message: "不能禁用或降级最后一个最高管理员" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data,
      include: { department: true }
    });
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    return NextResponse.json({ message: "更新用户失败" }, { status: 500 });
  }
}
