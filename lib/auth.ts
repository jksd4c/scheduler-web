import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPlainToken, hashToken } from "@/lib/password";

export const USER_SESSION_COOKIE = "ecg_session";
export const GUEST_SESSION_COOKIE = "ecg_guest_session";

export const USER_ROLE = {
  SUPER_ADMIN: "SUPER_ADMIN",
  DEPARTMENT_ADMIN: "DEPARTMENT_ADMIN"
} as const;

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  return NextResponse.json({ message: "服务器错误" }, { status: 500 });
}

export function getUserHomePath(user: { role: string; mustChangePassword?: boolean }) {
  if (user.mustChangePassword) {
    return "/change-password";
  }
  return user.role === USER_ROLE.SUPER_ADMIN ? "/admin" : "/dashboard";
}

export async function createUserSession(userId: string) {
  const token = createPlainToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt
    }
  });

  cookies().set(USER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export async function destroyUserSession() {
  const token = cookies().get(USER_SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  cookies().delete(USER_SESSION_COOKIE);
}

export async function getCurrentUser() {
  const token = cookies().get(USER_SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: { department: true }
      }
    }
  });

  if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
    if (session) {
      await prisma.session.deleteMany({ where: { id: session.id } });
    }
    return null;
  }

  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError("请先登录", 401);
  }
  return user;
}

export async function requireSuperAdmin() {
  const user = await requireUser();
  if (user.role !== USER_ROLE.SUPER_ADMIN) {
    throw new AuthError("无权限访问", 403);
  }
  return user;
}

export async function requireDepartmentAdmin() {
  const user = await requireUser();
  if (user.role !== USER_ROLE.DEPARTMENT_ADMIN || !user.departmentId) {
    throw new AuthError("无权限访问", 403);
  }
  if (!user.department?.isActive) {
    throw new AuthError("所属科室已停用", 403);
  }
  return user;
}

export async function requireDepartmentAccess(departmentId: string) {
  const user = await requireUser();
  if (user.role === USER_ROLE.SUPER_ADMIN) {
    return user;
  }
  if (user.role === USER_ROLE.DEPARTMENT_ADMIN && user.departmentId === departmentId && user.department?.isActive) {
    return user;
  }
  throw new AuthError("无权限访问该科室", 403);
}

export async function requireScheduleTaskAccess(taskId: string) {
  const user = await requireUser();
  const task = await prisma.scheduleTask.findUnique({
    where: { id: taskId },
    select: { id: true, departmentId: true }
  });

  if (!task) {
    throw new AuthError("排班任务不存在", 404);
  }

  if (user.role === USER_ROLE.SUPER_ADMIN) {
    return { user, task };
  }

  if (user.role === USER_ROLE.DEPARTMENT_ADMIN && user.departmentId === task.departmentId && user.department?.isActive) {
    return { user, task };
  }

  throw new AuthError("无权限访问该排班任务", 403);
}

export async function requirePageUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.mustChangePassword) {
    redirect("/change-password");
  }
  return user;
}

export async function requirePageSuperAdmin() {
  const user = await requirePageUser();
  if (user.role !== USER_ROLE.SUPER_ADMIN) {
    return null;
  }
  return user;
}

export async function createGuestSession(departmentId: string) {
  const token = createPlainToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  await prisma.guestSession.create({
    data: {
      departmentId,
      tokenHash: hashToken(token),
      expiresAt
    }
  });

  cookies().set(GUEST_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export async function destroyGuestSession() {
  const token = cookies().get(GUEST_SESSION_COOKIE)?.value;
  if (token) {
    await prisma.guestSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  cookies().delete(GUEST_SESSION_COOKIE);
}

export async function getCurrentGuest() {
  const token = cookies().get(GUEST_SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const session = await prisma.guestSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { department: true }
  });

  if (!session || session.expiresAt <= new Date() || !session.department.isActive) {
    if (session) {
      await prisma.guestSession.deleteMany({ where: { id: session.id } });
    }
    return null;
  }

  return session;
}

export async function requireGuest() {
  const guest = await getCurrentGuest();
  if (!guest) {
    throw new AuthError("访客会话已失效，请重新输入访问密码", 401);
  }
  return guest;
}
