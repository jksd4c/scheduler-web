import { NextResponse } from "next/server";
import { createGuestSession } from "@/lib/auth";
import { verifySecret } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const plainCode = String(body.code ?? "").trim();
    if (!plainCode) {
      return NextResponse.json({ message: "请输入查看密码" }, { status: 400 });
    }

    const codes = await prisma.departmentAccessCode.findMany({
      where: {
        isActive: true,
        expiresAt: { gt: new Date() },
        department: { isActive: true }
      },
      include: { department: true },
      orderBy: { createdAt: "desc" }
    });
    const matched = codes.find((code) => verifySecret(plainCode, code.codeHash));
    if (!matched) {
      return NextResponse.json({ message: "查看密码无效或已过期" }, { status: 401 });
    }

    await createGuestSession(matched.departmentId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "查看登录失败" }, { status: 500 });
  }
}
