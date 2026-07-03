import { NextResponse } from "next/server";
import { nowMs, withApiTiming } from "@/lib/api-timing";
import { writeAuditLog } from "@/lib/audit";
import { authErrorResponse, requireManagedUnit } from "@/lib/auth";
import { dateFromKey, toDateKey } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const dateTypes = new Set([
  "PUBLIC_HOLIDAY",
  "MAKEUP_WORKDAY",
  "CUSTOM_REST_DAY",
  "CUSTOM_SPECIAL_DAY"
]);

export async function GET(request: Request) {
  const start = nowMs();
  let role: string | null = null;
  try {
    const url = new URL(request.url);
    const { user, unit } = await requireManagedUnit(url.searchParams.get("unitId"));
    role = user.role;
    const startDate = normalizeDateKey(url.searchParams.get("startDate"));
    const endDate = normalizeDateKey(url.searchParams.get("endDate"));

    const specialDates = await prisma.specialDate.findMany({
      where: {
        unitId: unit.id,
        ...(startDate && endDate
          ? { date: { gte: dateFromKey(startDate), lte: dateFromKey(endDate) } }
          : {})
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        date: true,
        dateType: true,
        name: true,
        note: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return withApiTiming(
      NextResponse.json({
        specialDates: specialDates.map((item) => ({
          ...item,
          date: toDateKey(item.date)
        }))
      }),
      { route: "GET /api/special-dates", start, role }
    );
  } catch (error) {
    const response = authErrorResponse(error);
    return withApiTiming(response, { route: "GET /api/special-dates", start, role });
  }
}

export async function POST(request: Request) {
  const start = nowMs();
  let role: string | null = null;
  try {
    const body = await request.json();
    const { user, unit } = await requireManagedUnit(body.unitId);
    role = user.role;
    const dateKey = normalizeDateKey(body.date);
    const dateType = normalizeDateType(body.dateType);
    const name = nullableString(body.name);
    const note = nullableString(body.note);

    if (!dateKey || !dateType) {
      return withApiTiming(NextResponse.json({ message: "请选择有效日期和日期类型" }, { status: 400 }), {
        route: "POST /api/special-dates",
        start,
        role
      });
    }

    const specialDate = await prisma.$transaction(async (tx) => {
      await tx.specialDate.deleteMany({
        where: {
          unitId: unit.id,
          date: dateFromKey(dateKey),
          dateType: { not: dateType }
        }
      });
      return tx.specialDate.upsert({
        where: {
          unitId_date_dateType: {
            unitId: unit.id,
            date: dateFromKey(dateKey),
            dateType
          }
        },
        update: {
          hospitalId: unit.hospitalId,
          departmentId: unit.departmentId,
          name,
          note
        },
        create: {
          hospitalId: unit.hospitalId,
          departmentId: unit.departmentId,
          unitId: unit.id,
          date: dateFromKey(dateKey),
          dateType,
          name,
          note
        },
        select: {
          id: true,
          date: true,
          dateType: true,
          name: true,
          note: true
        }
      });
    });

    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: unit.hospitalId,
      departmentId: unit.departmentId,
      unitId: unit.id,
      action: "UPSERT_SPECIAL_DATE",
      targetType: "SpecialDate",
      targetId: specialDate.id,
      afterJson: { date: dateKey, dateType, name },
      request
    });

    return withApiTiming(
      NextResponse.json({ specialDate: { ...specialDate, date: toDateKey(specialDate.date) } }, { status: 201 }),
      { route: "POST /api/special-dates", start, role }
    );
  } catch (error) {
    const response = authErrorResponse(error);
    return withApiTiming(response, { route: "POST /api/special-dates", start, role });
  }
}

function normalizeDateKey(value: unknown) {
  const text = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeDateType(value: unknown) {
  const text = String(value ?? "").trim().toUpperCase();
  return dateTypes.has(text) ? text : "";
}

function nullableString(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}
