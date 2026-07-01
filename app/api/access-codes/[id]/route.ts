import { NextResponse } from "next/server";
import { authErrorResponse, requireDepartmentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireDepartmentAdmin();
    const departmentId = user.departmentId!;
    const code = await prisma.departmentAccessCode.findUnique({ where: { id: params.id } });
    if (!code || code.departmentId !== departmentId) {
      return NextResponse.json({ message: "访问密码不存在" }, { status: 404 });
    }
    await prisma.departmentAccessCode.update({
      where: { id: params.id },
      data: { isActive: false }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
