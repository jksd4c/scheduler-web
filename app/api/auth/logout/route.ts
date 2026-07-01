import { NextResponse } from "next/server";
import { destroyUserSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  await destroyUserSession();
  return NextResponse.json({ ok: true });
}
