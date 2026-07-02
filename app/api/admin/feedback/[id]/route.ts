import { NextResponse } from "next/server";
import { authErrorResponse, requireSuperAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const STATUSES = new Set(["NEW", "REVIEWING", "RESOLVED", "REJECTED"]);

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireSuperAdmin();
    const body = await request.json();
    const status = String(body.status ?? "");
    if (!STATUSES.has(status)) {
      return NextResponse.json({ message: "反馈状态无效" }, { status: 400 });
    }

    const before = await prisma.feedback.findUnique({ where: { id: params.id } });
    if (!before) {
      return NextResponse.json({ message: "反馈不存在" }, { status: 404 });
    }

    const feedback = await prisma.feedback.update({
      where: { id: params.id },
      data: { status },
      include: {
        user: { select: { username: true, displayName: true } },
        hospital: true,
        department: true,
        unit: true
      }
    });

    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: feedback.hospitalId,
      departmentId: feedback.departmentId,
      unitId: feedback.unitId,
      action: "UPDATE_FEEDBACK_STATUS",
      targetType: "Feedback",
      targetId: feedback.id,
      beforeJson: { status: before.status },
      afterJson: { status: feedback.status },
      request
    });

    return NextResponse.json({ feedback });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    return NextResponse.json({ message: "更新反馈失败" }, { status: 500 });
  }
}
