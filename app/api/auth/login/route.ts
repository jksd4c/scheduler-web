import { NextResponse } from "next/server";
import { nowMs, withApiTiming } from "@/lib/api-timing";
import { createUserSession, getUserHomePath } from "@/lib/auth";
import { verifySecret } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const start = nowMs();
  let role: string | null = null;
  try {
    const body = await request.json();
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");

    if (!username || !password) {
      return withApiTiming(NextResponse.json({ message: "请输入用户名和密码" }, { status: 400 }), {
        route: "POST /api/auth/login",
        start,
        role
      });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      include: { hospital: true, department: true, unit: true }
    });
    role = user?.role ?? null;

    if (!user || !user.isActive || !verifySecret(password, user.passwordHash)) {
      return withApiTiming(NextResponse.json({ message: "用户名或密码错误" }, { status: 401 }), {
        route: "POST /api/auth/login",
        start,
        role
      });
    }

    if (user.hospitalId && !user.hospital?.isActive) {
      return withApiTiming(NextResponse.json({ message: "所属医院已停用" }, { status: 403 }), {
        route: "POST /api/auth/login",
        start,
        role
      });
    }
    if (user.departmentId && !user.department?.isActive) {
      return withApiTiming(NextResponse.json({ message: "所属科室已停用" }, { status: 403 }), {
        route: "POST /api/auth/login",
        start,
        role
      });
    }
    if (user.unitId && !user.unit?.isActive) {
      return withApiTiming(NextResponse.json({ message: "所属病区/小组已停用" }, { status: 403 }), {
        route: "POST /api/auth/login",
        start,
        role
      });
    }

    await createUserSession(user.id);
    return withApiTiming(NextResponse.json({ ok: true, redirectTo: getUserHomePath(user) }), {
      route: "POST /api/auth/login",
      start,
      role
    });
  } catch (error) {
    console.error(error);
    return withApiTiming(NextResponse.json({ message: "登录失败" }, { status: 500 }), {
      route: "POST /api/auth/login",
      start,
      role
    });
  }
}
