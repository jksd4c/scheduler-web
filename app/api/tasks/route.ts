import { NextResponse } from "next/server";
import { authErrorResponse, isSchedulerAdminRole, requireUser, USER_ROLE } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { dateFromKey, getWeekEndDateKey } from "@/lib/date-utils";
import { mergeDoctorNameLists } from "@/lib/name-parser";
import { getDefaultActiveUnit, getOrCreateDefaultUnit } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { DOCTOR_TYPE, SCHEDULE_MODE, SCHEDULE_STATUS } from "@/lib/schedule-rules";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const tasks = await prisma.scheduleTask.findMany({
      where:
        user.role === USER_ROLE.SUPER_ADMIN
          ? undefined
          : user.unitId
            ? { unitId: user.unitId }
            : { departmentId: user.departmentId ?? "__none__" },
      orderBy: { createdAt: "desc" },
      include: {
        hospital: true,
        department: true,
        unit: true,
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
      return NextResponse.json({ message: "请至少输入一名人员" }, { status: 400 });
    }

    let hospitalId: string | null = user.hospitalId ?? null;
    let departmentId = user.departmentId ?? "";
    let unitId = user.unitId ?? "";
    if (user.role === USER_ROLE.SUPER_ADMIN) {
      const requestedUnitId = String(body.unitId ?? "").trim();
      const unit = requestedUnitId
        ? await prisma.unit.findUnique({ where: { id: requestedUnitId }, include: { hospital: true, department: true } })
        : await getDefaultActiveUnit(user.id);
      if (!unit || !unit.isActive || !unit.department?.isActive) {
        return NextResponse.json({ message: "请选择有效的病区" }, { status: 400 });
      }
      hospitalId = unit.hospitalId;
      departmentId = unit.departmentId;
      unitId = unit.id;
    } else if (isSchedulerAdminRole(user.role) && !unitId && departmentId) {
      const unit = await getOrCreateDefaultUnit(departmentId, user.id);
      if (unit) {
        hospitalId = unit.hospitalId;
        unitId = unit.id;
        await prisma.user.update({ where: { id: user.id }, data: { hospitalId, unitId } });
      }
    }

    if (!departmentId || !unitId) {
      return NextResponse.json({ message: "当前账号没有所属病区" }, { status: 403 });
    }

    const unit = await prisma.unit.findUnique({ where: { id: unitId }, include: { department: true, hospital: true } });
    if (!unit || !unit.isActive || !unit.department.isActive || (unit.hospitalId && !unit.hospital?.isActive)) {
      return NextResponse.json({ message: "病区不存在或已停用" }, { status: 400 });
    }
    if (isSchedulerAdminRole(user.role) && user.unitId && user.unitId !== unitId) {
      return NextResponse.json({ message: "无权限在其他病区创建排班" }, { status: 403 });
    }

    const weekEndDate = getWeekEndDateKey(weekStartDate);
    const task = await prisma.scheduleTask.create({
      data: {
        hospitalId,
        departmentId,
        unitId,
        createdByUserId: user.id,
        weekStartDate: dateFromKey(weekStartDate),
        weekEndDate: dateFromKey(weekEndDate),
        mode,
        status: SCHEDULE_STATUS.DRAFT,
        doctors: {
          create: [
            ...residents.map((name) => ({ departmentId, name, doctorType: DOCTOR_TYPE.RESIDENT })),
            ...interns.map((name) => ({ departmentId, name, doctorType: DOCTOR_TYPE.INTERN }))
          ]
        }
      },
      include: {
        hospital: true,
        department: true,
        unit: true,
        doctors: true,
        requirements: true
      }
    });

    await writeAuditLog({
      actorUserId: user.id,
      hospitalId,
      departmentId,
      unitId,
      action: "CREATE_SCHEDULE_TASK",
      targetType: "ScheduleTask",
      targetId: task.id,
      afterJson: {
        weekStartDate,
        weekEndDate,
        mode,
        personnelCount: residents.length + interns.length
      },
      request
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
