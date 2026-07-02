import { NextResponse } from "next/server";
import { nowMs, withApiTiming } from "@/lib/api-timing";
import { authErrorResponse, requireSuperAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const STATUSES = new Set(["NEW", "REVIEWING", "RESOLVED", "REJECTED"]);

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const start = nowMs();
  let role: string | null = null;
  try {
    const user = await requireSuperAdmin();
    role = user.role;
    const body = await request.json();
    const status = String(body.status ?? "");
    if (!STATUSES.has(status)) {
      return withApiTiming(NextResponse.json({ message: "反馈状态无效" }, { status: 400 }), {
        route: "PATCH /api/admin/feedback/[id]",
        start,
        role
      });
    }

    const before = await prisma.feedback.findUnique({ where: { id: params.id } });
    if (!before) {
      return withApiTiming(NextResponse.json({ message: "反馈不存在" }, { status: 404 }), {
        route: "PATCH /api/admin/feedback/[id]",
        start,
        role
      });
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

    return withApiTiming(NextResponse.json({ feedback }), { route: "PATCH /api/admin/feedback/[id]", start, role });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const response = authErrorResponse(error);
      return withApiTiming(response, { route: "PATCH /api/admin/feedback/[id]", start, role });
    }
    return withApiTiming(NextResponse.json({ message: "更新反馈失败" }, { status: 500 }), {
      route: "PATCH /api/admin/feedback/[id]",
      start,
      role
    });
  }
}
