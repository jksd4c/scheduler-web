import { NextResponse } from "next/server";
import { authErrorResponse, requireManagedUnit } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { unit } = await requireManagedUnit(url.searchParams.get("unitId"));
    const scheduleTaskId = url.searchParams.get("scheduleTaskId") || undefined;
    const claims = await prisma.joinClaim.findMany({
      where: { unitId: unit.id, ...(scheduleTaskId ? { scheduleTaskId } : {}) },
      orderBy: [{ reviewStatus: "asc" }, { createdAt: "desc" }]
    });
    const rosterIds = claims.map((item) => item.rosterEntryId).filter(Boolean) as string[];
    const users = await prisma.user.findMany({ where: { id: { in: claims.map((item) => item.userId) } }, select: { id: true, username: true, displayName: true, phone: true } });
    const roster = rosterIds.length ? await prisma.rosterEntry.findMany({ where: { id: { in: rosterIds } } }) : [];
    return NextResponse.json({ claims, users, roster });
  } catch (error) {
    return authErrorResponse(error);
  }
}
