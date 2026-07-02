import { NextResponse } from "next/server";
import { nowMs, withApiTiming } from "@/lib/api-timing";
import { authErrorResponse, requireUser, USER_ROLE } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const FEEDBACK_TYPES = new Set(["BUG", "FEATURE", "SCHEDULING_RULE", "FAIRNESS_REPORT", "EXPORT", "LOGIN", "OTHER"]);
const PAGE_SIZE = 30;

export async function GET(request: Request) {
  const start = nowMs();
  let role: string | null = null;
  try {
    const user = await requireUser();
    role = user.role;
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(10, Number(url.searchParams.get("pageSize") ?? PAGE_SIZE) || PAGE_SIZE));
    const where = user.role === USER_ROLE.SUPER_ADMIN ? undefined : { userId: user.id };
    const [feedback, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          type: true,
          title: true,
          content: true,
          pageUrl: true,
          contact: true,
          status: true,
          createdAt: true,
          user: { select: { username: true, displayName: true } },
          hospital: { select: { name: true } },
          department: { select: { name: true } },
          unit: { select: { name: true } }
        }
      }),
      prisma.feedback.count({ where })
    ]);
    return withApiTiming(NextResponse.json({ feedback, pagination: { page, pageSize, total } }), {
      route: "GET /api/feedback",
      start,
      role
    });
  } catch (error) {
    const response = authErrorResponse(error);
    return withApiTiming(response, { route: "GET /api/feedback", start, role });
  }
}

export async function POST(request: Request) {
  const start = nowMs();
  let role: string | null = null;
  try {
    const user = await requireUser();
    role = user.role;
    const body = await request.json();
    const type = FEEDBACK_TYPES.has(String(body.type)) ? String(body.type) : "OTHER";
    const title = String(body.title ?? "").trim();
    const content = String(body.content ?? "").trim();
    const pageUrl = String(body.pageUrl ?? "").trim() || null;
    const contact = String(body.contact ?? "").trim() || null;

    if (!title || !content) {
      return withApiTiming(NextResponse.json({ message: "请填写标题和反馈内容" }, { status: 400 }), {
        route: "POST /api/feedback",
        start,
        role
      });
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

    return withApiTiming(NextResponse.json({ feedback }, { status: 201 }), {
      route: "POST /api/feedback",
      start,
      role
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const response = authErrorResponse(error);
      return withApiTiming(response, { route: "POST /api/feedback", start, role });
    }
    console.error(error);
    return withApiTiming(NextResponse.json({ message: "提交反馈失败" }, { status: 500 }), {
      route: "POST /api/feedback",
      start,
      role
    });
  }
}
