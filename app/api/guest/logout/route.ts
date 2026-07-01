import { NextResponse } from "next/server";
import { destroyGuestSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  await destroyGuestSession();
  return NextResponse.json({ ok: true });
}
