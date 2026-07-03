import { NextResponse } from "next/server";
import { nowMs, withApiTiming } from "@/lib/api-timing";
import { authErrorResponse, isSchedulerAdminRole, requireUser, USER_ROLE } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { dateFromKey, getDateRangeDayCount, getPeriodRange, getTodayDateKey, toDateKey } from "@/lib/date-utils";
import { mergeDoctorNameLists } from "@/lib/name-parser";
import { getDefaultActiveUnit, getOrCreateDefaultUnit } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { ROSTER_STATUS, STAFF_POOL_TYPE } from "@/lib/roster-workflow";
import { DOCTOR_TYPE, SCHEDULE_MODE, SCHEDULE_PERIOD_TYPE, SCHEDULE_STATUS, TASK_SCHEDULE_MODE, asPeriodType, asTaskScheduleMode } from "@/lib/schedule-rules";
import { buildTagSnapshot, resolveEffectivePolicy } from "@/lib/staff-policy";

export const runtime = "nodejs";

const TASK_LIST_PAGE_SIZE = 30;

export async function GET(request: Request) {
  const start = nowMs();
  let role: string | null = null;
  try {
    const user = await requireUser();
    role = user.role;
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(10, Number(url.searchParams.get("pageSize") ?? TASK_LIST_PAGE_SIZE) || TASK_LIST_PAGE_SIZE));
    const where =
      user.role === USER_ROLE.SUPER_ADMIN
        ? undefined
        : user.unitId
          ? { unitId: user.unitId }
          : { departmentId: user.departmentId ?? "__none__" };

    const [tasks, total] = await Promise.all([
      prisma.scheduleTask.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          periodType: true,
          weekStartDate: true,
          weekEndDate: true,
          mode: true,
          scheduleMode: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          department: { select: { id: true, name: true, isActive: true } },
          unit: { select: { id: true, name: true, isActive: true } },
          _count: {
            select: {
              doctors: true,
              assignments: true,
              conflicts: true
            }
          }
        }
      }),
      prisma.scheduleTask.count({ where })
    ]);

    return withApiTiming(NextResponse.json({ tasks, pagination: { page, pageSize, total } }), {
      route: "GET /api/tasks",
      start,
      role
    });
  } catch (error) {
    const response = authErrorResponse(error);
    return withApiTiming(response, { route: "GET /api/tasks", start, role });
  }
}

export async function POST(request: Request) {
  const start = nowMs();
  let role: string | null = null;
  try {
    const user = await requireUser();
    role = user.role;
    const body = await request.json();
    const taskName = String(body.name ?? "").trim() || "排班任务";
    const periodType = asPeriodType(String(body.periodType ?? SCHEDULE_PERIOD_TYPE.DAYS_30));
    const requestedStartDate = String(body.startDate ?? body.weekStartDate ?? getTodayDateKey()).slice(0, 10);
    const requestedEndDate = String(body.endDate ?? "").slice(0, 10);
    const periodRange = getPeriodRange(periodType, requestedStartDate, {
      year: Number(body.year) || undefined,
      month: Number(body.month) || undefined,
      quarter: Number(body.quarter) || undefined,
      half: Number(body.half) || undefined,
      endDate: requestedEndDate || undefined
    });
    const startDate = periodRange.startDate;
    const endDate = periodRange.endDate;
    const hasExplicitScheduleMode = body.scheduleMode != null && String(body.scheduleMode).trim() !== "";
    const scheduleMode = hasExplicitScheduleMode
      ? asTaskScheduleMode(String(body.scheduleMode))
      : TASK_SCHEDULE_MODE.WARD_SHIFT;
    const mode =
      scheduleMode === TASK_SCHEDULE_MODE.MEDTECH_ROOM && body.mode === SCHEDULE_MODE.HALF_DAY
        ? SCHEDULE_MODE.HALF_DAY
        : SCHEDULE_MODE.FULL_DAY;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return withApiTiming(NextResponse.json({ message: "排班日期格式无效" }, { status: 400 }), {
        route: "POST /api/tasks",
        start,
        role
      });
    }
    if (dateFromKey(endDate).getTime() < dateFromKey(startDate).getTime()) {
      return withApiTiming(NextResponse.json({ message: "结束日期不能早于开始日期" }, { status: 400 }), {
        route: "POST /api/tasks",
        start,
        role
      });
    }
    const periodDays = getDateRangeDayCount(startDate, endDate);
    if (periodDays > 366) {
      return withApiTiming(NextResponse.json({ message: "自定义周期最长暂定 366 天，请拆分任务" }, { status: 400 }), {
        route: "POST /api/tasks",
        start,
        role
      });
    }

    const { residents, interns } = mergeDoctorNameLists(
      String(body.residentNames ?? body.residentsText ?? ""),
      String(body.internNames ?? body.internsText ?? "")
    );
    const requestedStaffProfileIds: string[] = Array.isArray(body.staffProfileIds) ? body.staffProfileIds.map(String).filter(Boolean) : [];

    if ((scheduleMode === TASK_SCHEDULE_MODE.WARD_SHIFT || scheduleMode === TASK_SCHEDULE_MODE.CUSTOM) && residents.length + interns.length > 0) {
      return withApiTiming(NextResponse.json({ message: "请从本次排班工作池选择人员，病房白班/夜班和高级自定义不再使用 A/B 文本名单。" }, { status: 400 }), {
        route: "POST /api/tasks",
        start,
        role
      });
    }

    if (residents.length + interns.length + requestedStaffProfileIds.length === 0) {
      return withApiTiming(NextResponse.json({ message: "请至少输入一名人员" }, { status: 400 }), {
        route: "POST /api/tasks",
        start,
        role
      });
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
        return withApiTiming(NextResponse.json({ message: "请选择有效的病区/小组" }, { status: 400 }), {
          route: "POST /api/tasks",
          start,
          role
        });
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
      return withApiTiming(NextResponse.json({ message: "当前账号没有所属病区/小组" }, { status: 403 }), {
        route: "POST /api/tasks",
        start,
        role
      });
    }

    const unit = await prisma.unit.findUnique({ where: { id: unitId }, include: { department: true, hospital: true } });
    if (!unit || !unit.isActive || !unit.department.isActive || (unit.hospitalId && !unit.hospital?.isActive)) {
      return withApiTiming(NextResponse.json({ message: "病区/小组不存在或已停用" }, { status: 400 }), {
        route: "POST /api/tasks",
        start,
        role
      });
    }
    if (isSchedulerAdminRole(user.role) && user.unitId && user.unitId !== unitId) {
      return withApiTiming(NextResponse.json({ message: "无权在其他病区/小组创建排班" }, { status: 403 }), {
        route: "POST /api/tasks",
        start,
        role
      });
    }

    if (scheduleMode === TASK_SCHEDULE_MODE.WARD_SHIFT || scheduleMode === TASK_SCHEDULE_MODE.CUSTOM) {
      await ensureDefaultWardShiftTypes(unitId);
    }

    const staffProfiles = requestedStaffProfileIds.length
      ? await prisma.staffProfile.findMany({
          where: { unitId, id: { in: requestedStaffProfileIds }, active: true },
          include: {
            tags: {
              include: { staffTag: { include: { policy: true } } },
              orderBy: { createdAt: "asc" }
            },
            rosterEntries: {
              where: {
                unitId,
                poolType: STAFF_POOL_TYPE.ROTATION,
                status: ROSTER_STATUS.CONFIRMED,
                includeInScheduling: true
              },
              select: { id: true },
              take: 1
            }
          }
        })
      : [];
    const eligibleStaffProfiles = staffProfiles.filter((profile) => profile.poolType !== STAFF_POOL_TYPE.ROTATION || profile.rosterEntries.length > 0);
    const selectedProfileIds = new Set(eligibleStaffProfiles.map((profile) => profile.id));
    const invalidProfileIds = requestedStaffProfileIds.filter((id) => !selectedProfileIds.has(id));
    if (invalidProfileIds.length > 0) {
      return withApiTiming(NextResponse.json({ message: "本次排班工作池中存在未确认或不可用的轮转人员，请先完成确认后再创建任务。" }, { status: 400 }), {
        route: "POST /api/tasks",
        start,
        role
      });
    }
    const selectedNames = new Set(eligibleStaffProfiles.map((profile) => profile.displayName));
    const manualDoctors = [
      ...residents.filter((name) => !selectedNames.has(name)).map((name) => ({ departmentId, name, doctorType: DOCTOR_TYPE.RESIDENT })),
      ...interns.filter((name) => !selectedNames.has(name)).map((name) => ({ departmentId, name, doctorType: DOCTOR_TYPE.INTERN }))
    ];
    const profileDoctors = eligibleStaffProfiles.map((profile) => {
      const tags = profile.tags.map((item) => item.staffTag);
      const tagSnapshot = buildTagSnapshot(tags);
      const policySnapshot = resolveEffectivePolicy(tags);
      return {
        departmentId,
        staffProfileId: profile.id,
        name: profile.displayName,
        doctorType: profile.poolType === STAFF_POOL_TYPE.ROTATION ? DOCTOR_TYPE.INTERN : DOCTOR_TYPE.RESIDENT,
        active: profile.active,
        preferredShiftType: profile.preferredShiftType,
        preferenceStrength: profile.preferenceStrength,
        preferenceNote: profile.preferenceNote,
        tagSnapshotJson: tagSnapshot,
        policySnapshotJson: policySnapshot
      };
    });

    const task = await prisma.scheduleTask.create({
      data: {
        name: taskName,
        hospitalId,
        departmentId,
        unitId,
        createdByUserId: user.id,
        weekStartDate: dateFromKey(startDate),
        weekEndDate: dateFromKey(endDate),
        startDate: dateFromKey(startDate),
        endDate: dateFromKey(endDate),
        periodType,
        mode,
        scheduleMode,
        status: SCHEDULE_STATUS.DRAFT,
        doctors: {
          create: [
            ...profileDoctors,
            ...manualDoctors.map((doctor) => ({
              ...doctor,
              active: true,
              preferredShiftType: "NONE",
              preferenceStrength: "NORMAL",
              preferenceNote: null,
              tagSnapshotJson: [],
              policySnapshotJson: { participatesInScheduling: true, workloadFactor: 1, sourceTagNames: [] }
            }))
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

    if (task.doctors.length > 0) {
      await prisma.scheduleParticipant.createMany({
        data: task.doctors.map((doctor) => ({
          scheduleTaskId: task.id,
          scheduleDoctorId: doctor.id,
          staffProfileId: doctor.staffProfileId,
          displayName: doctor.name,
          active: doctor.active,
          tagSnapshotJson: doctor.tagSnapshotJson ?? [],
          policySnapshotJson: doctor.policySnapshotJson ?? { participatesInScheduling: true, workloadFactor: 1, sourceTagNames: [] }
        })),
        skipDuplicates: true
      });
    }

    await writeAuditLog({
      actorUserId: user.id,
      hospitalId,
      departmentId,
      unitId,
      action: "CREATE_SCHEDULE_TASK",
      targetType: "ScheduleTask",
      targetId: task.id,
      afterJson: {
        name: taskName,
        startDate,
        endDate,
        periodType,
        mode,
        scheduleMode,
        periodDays,
        staffProfileCount: eligibleStaffProfiles.length,
        manualPersonnelCount: manualDoctors.length,
        personnelCount: task.doctors.length
      },
      request
    });

    return withApiTiming(NextResponse.json({ task }, { status: 201 }), {
      route: "POST /api/tasks",
      start,
      role
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const response = authErrorResponse(error);
      return withApiTiming(response, { route: "POST /api/tasks", start, role });
    }
    console.error(error);
    return withApiTiming(NextResponse.json({ message: "创建排班任务失败" }, { status: 500 }), {
      route: "POST /api/tasks",
      start,
      role
    });
  }
}

async function ensureDefaultWardShiftTypes(unitId: string) {
  const defaults = [
    { name: "白班", category: "DAY", isNight: false, workloadWeight: 1, color: "#0f766e" },
    { name: "夜班", category: "NIGHT", isNight: true, workloadWeight: 1.5, color: "#1d4ed8" }
  ];
  for (const item of defaults) {
    await prisma.shiftType.upsert({
      where: { unitId_name: { unitId, name: item.name } },
      update: { active: true, category: item.category, isNight: item.isNight, workloadWeight: item.workloadWeight },
      create: {
        unitId,
        name: item.name,
        category: item.category,
        isNight: item.isNight,
        workloadWeight: item.workloadWeight,
        color: item.color,
        active: true
      }
    });
  }
}
