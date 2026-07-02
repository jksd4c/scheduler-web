import { NextResponse } from "next/server";
import { nowMs, withApiTiming } from "@/lib/api-timing";
import { authErrorResponse, requireSuperAdmin, USER_ROLE } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { hashSecret } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const PAGE_SIZE = 30;

export async function GET(request: Request) {
  const start = nowMs();
  let role: string | null = null;
  try {
    const actor = await requireSuperAdmin();
    role = actor.role;
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(10, Number(url.searchParams.get("pageSize") ?? PAGE_SIZE) || PAGE_SIZE));
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        orderBy: { createdAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          username: true,
          displayName: true,
          phone: true,
          email: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          createdAt: true,
          lastLoginAt: true,
          hospital: { select: { name: true } },
          department: { select: { name: true } },
          unit: { select: { id: true, name: true } }
        }
      }),
      prisma.user.count()
    ]);
    return withApiTiming(NextResponse.json({ users, pagination: { page, pageSize, total } }), {
      route: "GET /api/admin/users",
      start,
      role
    });
  } catch (error) {
    const response = authErrorResponse(error);
    return withApiTiming(response, { route: "GET /api/admin/users", start, role });
  }
}

export async function POST(request: Request) {
  const start = nowMs();
  let roleForLog: string | null = null;
  try {
    const actor = await requireSuperAdmin();
    roleForLog = actor.role;
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
      return withApiTiming(NextResponse.json({ message: "用户名不能为空，密码至少 8 位" }, { status: 400 }), {
        route: "POST /api/admin/users",
        start,
        role: roleForLog
      });
    }

    let org: { hospitalId: string | null; departmentId: string; unitId: string } | null = null;
    if (role !== USER_ROLE.SUPER_ADMIN) {
      if (!unitId) {
        return withApiTiming(NextResponse.json({ message: "排班管理员或成员必须选择病区/小组" }, { status: 400 }), {
          route: "POST /api/admin/users",
          start,
          role: roleForLog
        });
      }
      const unit = await prisma.unit.findUnique({ where: { id: unitId } });
      if (!unit || !unit.isActive) {
        return withApiTiming(NextResponse.json({ message: "病区/小组不存在或已停用" }, { status: 400 }), {
          route: "POST /api/admin/users",
          start,
          role: roleForLog
        });
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
    return withApiTiming(NextResponse.json({ user }, { status: 201 }), {
      route: "POST /api/admin/users",
      start,
      role: roleForLog
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const response = authErrorResponse(error);
      return withApiTiming(response, { route: "POST /api/admin/users", start, role: roleForLog });
    }
    return withApiTiming(NextResponse.json({ message: "创建用户失败，用户名可能已存在" }, { status: 500 }), {
      route: "POST /api/admin/users",
      start,
      role: roleForLog
    });
  }
}
