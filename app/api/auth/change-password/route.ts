import { NextResponse } from "next/server";
import { authErrorResponse, getUserHomePath, requireUser } from "@/lib/auth";
import { hashSecret, verifySecret } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");

    if (!verifySecret(currentPassword, user.passwordHash)) {
      return NextResponse.json({ message: "当前密码不正确" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ message: "新密码至少 8 位" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashSecret(newPassword),
        mustChangePassword: false
      },
      include: { department: true }
    });

    return NextResponse.json({ ok: true, redirectTo: getUserHomePath(updated) });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    console.error(error);
    return NextResponse.json({ message: "修改密码失败" }, { status: 500 });
  }
}
