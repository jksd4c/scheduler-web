import { NextResponse } from "next/server";
import { createUserSession, getUserHomePath } from "@/lib/auth";
import { verifySecret } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");

    if (!username || !password) {
      return NextResponse.json({ message: "请输入用户名和密码" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      include: { department: true }
    });

    if (!user || !user.isActive || !verifySecret(password, user.passwordHash)) {
      return NextResponse.json({ message: "用户名或密码错误" }, { status: 401 });
    }

    if (user.departmentId && !user.department?.isActive) {
      return NextResponse.json({ message: "所属科室已停用" }, { status: 403 });
    }

    await createUserSession(user.id);
    return NextResponse.json({ ok: true, redirectTo: getUserHomePath(user) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "登录失败" }, { status: 500 });
  }
}
