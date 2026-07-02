import { NextResponse } from "next/server";
import { authErrorResponse, requireUser, USER_ROLE } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const FEEDBACK_TYPES = new Set(["BUG", "FEATURE", "SCHEDULING_RULE", "FAIRNESS_REPORT", "EXPORT", "LOGIN", "OTHER"]);

export async function GET() {
  try {
    const user = await requireUser();
    const feedback = await prisma.feedback.findMany({
      where: user.role === USER_ROLE.SUPER_ADMIN ? undefined : { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { username: true, displayName: true } },
        hospital: true,
        department: true,
        unit: true
      }
    });
    return NextResponse.json({ feedback });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const type = FEEDBACK_TYPES.has(String(body.type)) ? String(body.type) : "OTHER";
    const title = String(body.title ?? "").trim();
    const content = String(body.content ?? "").trim();
    const pageUrl = String(body.pageUrl ?? "").trim() || null;
    const contact = String(body.contact ?? "").trim() || null;

    if (!title || !content) {
      return NextResponse.json({ message: "请填写标题和反馈内容" }, { status: 400 });
    }

    const feedback = await prisma.feedback.create({
      data: {
        userId: user.id,
        hospitalId: user.hospitalId,
        departmentId: user.departmentId,
        unitId: user.unitId,
        type,
        title,
        content,
        pageUrl,
        contact,
        status: "NEW"
      }
    });

    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: user.hospitalId,
      departmentId: user.departmentId,
      unitId: user.unitId,
      action: "CREATE_FEEDBACK",
      targetType: "Feedback",
      targetId: feedback.id,
      afterJson: { type, title, status: feedback.status },
      request
    });

    return NextResponse.json({ feedback }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    console.error(error);
    return NextResponse.json({ message: "提交反馈失败" }, { status: 500 });
  }
}
