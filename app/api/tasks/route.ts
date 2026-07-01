import { NextResponse } from "next/server";
import { authErrorResponse, requireUser, USER_ROLE } from "@/lib/auth";
import { dateFromKey, getWeekEndDateKey } from "@/lib/date-utils";
import { getDefaultDepartmentId } from "@/lib/departments";
import { mergeDoctorNameLists } from "@/lib/name-parser";
import { prisma } from "@/lib/prisma";
import { DOCTOR_TYPE, SCHEDULE_MODE, SCHEDULE_STATUS, buildDefaultRequirements } from "@/lib/schedule-rules";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const tasks = await prisma.scheduleTask.findMany({
      where: user.role === USER_ROLE.SUPER_ADMIN ? undefined : { departmentId: user.departmentId ?? "__none__" },
      orderBy: { createdAt: "desc" },
      include: {
        department: true,
        _count: {
          select: {
            doctors: true,
            assignments: true,
            conflicts: true
          }
        }
      }
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const weekStartDate = String(body.weekStartDate ?? "").slice(0, 10);
    const mode = body.mode === SCHEDULE_MODE.HALF_DAY ? SCHEDULE_MODE.HALF_DAY : SCHEDULE_MODE.FULL_DAY;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate)) {
      return NextResponse.json({ message: "排班周开始日期格式无效" }, { status: 400 });
    }

    const { residents, interns } = mergeDoctorNameLists(
      String(body.residentNames ?? body.residentsText ?? ""),
      String(body.internNames ?? body.internsText ?? "")
    );

    if (residents.length + interns.length === 0) {
      return NextResponse.json({ message: "请至少输入一名医生" }, { status: 400 });
    }

    let departmentId = user.departmentId ?? "";
    if (user.role === USER_ROLE.SUPER_ADMIN) {
      departmentId = String(body.departmentId ?? "") || (await getDefaultDepartmentId());
    }

    if (!departmentId) {
      return NextResponse.json({ message: "当前账号没有所属科室" }, { status: 403 });
    }

    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department || !department.isActive) {
      return NextResponse.json({ message: "科室不存在或已停用" }, { status: 400 });
    }
    if (user.role === USER_ROLE.DEPARTMENT_ADMIN && user.departmentId !== departmentId) {
      return NextResponse.json({ message: "无权限在其他科室创建排班" }, { status: 403 });
    }

    const weekEndDate = getWeekEndDateKey(weekStartDate);
    const task = await prisma.scheduleTask.create({
      data: {
        departmentId,
        weekStartDate: dateFromKey(weekStartDate),
        weekEndDate: dateFromKey(weekEndDate),
        mode,
        status: SCHEDULE_STATUS.RULES_SET,
        doctors: {
          create: [
            ...residents.map((name) => ({ departmentId, name, doctorType: DOCTOR_TYPE.RESIDENT })),
            ...interns.map((name) => ({ departmentId, name, doctorType: DOCTOR_TYPE.INTERN }))
          ]
        },
        requirements: {
          create: buildDefaultRequirements(mode, weekStartDate).map((requirement) => ({
            departmentId,
            date: requirement.date,
            weekday: requirement.weekday,
            timeSlot: requirement.timeSlot,
            enabled: requirement.enabled,
            roomNumber: requirement.roomNumber,
            requiredDoctors: requirement.requiredDoctors
          }))
        }
      },
      include: {
        department: true,
        doctors: true,
        requirements: true
      }
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    console.error(error);
    return NextResponse.json({ message: "创建排班任务失败" }, { status: 500 });
  }
}
