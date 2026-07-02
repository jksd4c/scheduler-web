import { NextResponse } from "next/server";
import { authErrorResponse, requireManagedUnit } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { unit } = await requireManagedUnit(url.searchParams.get("unitId"));
    const scheduleTaskId = url.searchParams.get("scheduleTaskId") || undefined;
    const feedback = await prisma.memberFeedback.findMany({
      where: { unitId: unit.id, ...(scheduleTaskId ? { scheduleTaskId } : {}) },
      include: { unavailableTimes: true },
      orderBy: [{ createdAt: "desc" }]
    });
    const userIds = feedback.map((item) => item.userId);
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, displayName: true, phone: true } });
    return NextResponse.json({ feedback, users });
  } catch (error) {
    return authErrorResponse(error);
  }
}
