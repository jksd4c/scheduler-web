import { NextResponse } from "next/server";
import { authErrorResponse, requireSuperAdmin, USER_ROLE } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { hashSecret } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSuperAdmin();
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { hospital: true, department: true, unit: true }
    });
    return NextResponse.json({ users });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireSuperAdmin();
    const body = await request.json();
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const role =
      body.role === USER_ROLE.SUPER_ADMIN
        ? USER_ROLE.SUPER_ADMIN
        : body.role === USER_ROLE.MEMBER
          ? USER_ROLE.MEMBER
          : USER_ROLE.SCHEDULER_ADMIN;
    const unitId = role === USER_ROLE.SUPER_ADMIN ? null : String(body.unitId ?? "");
    const displayName = String(body.displayName ?? username).trim();

    if (!username || password.length < 8) {
      return NextResponse.json({ message: "用户名不能为空，密码至少 8 位" }, { status: 400 });
    }

    let org: { hospitalId: string | null; departmentId: string; unitId: string } | null = null;
    if (role !== USER_ROLE.SUPER_ADMIN) {
      if (!unitId) {
        return NextResponse.json({ message: "排班管理员或成员必须选择病区" }, { status: 400 });
      }
      const unit = await prisma.unit.findUnique({ where: { id: unitId } });
      if (!unit || !unit.isActive) {
        return NextResponse.json({ message: "病区不存在或已停用" }, { status: 400 });
      }
      org = { hospitalId: unit.hospitalId, departmentId: unit.departmentId, unitId: unit.id };
    }

    const user = await prisma.user.create({
      data: {
        username,
        displayName,
        passwordHash: hashSecret(password),
        role,
        hospitalId: org?.hospitalId ?? null,
        departmentId: org?.departmentId ?? null,
        unitId: org?.unitId ?? null,
        mustChangePassword: body.mustChangePassword !== false,
        isActive: true
      },
      include: { hospital: true, department: true, unit: true }
    });
    await writeAuditLog({
      actorUserId: actor.id,
      hospitalId: user.hospitalId,
      departmentId: user.departmentId,
      unitId: user.unitId,
      action: "CREATE_USER",
      targetType: "User",
      targetId: user.id,
      afterJson: { username: user.username, role: user.role },
      request
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    return NextResponse.json({ message: "创建用户失败，用户名可能已存在" }, { status: 500 });
  }
}
