import { NextResponse } from "next/server";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { isDoctorUnavailable } from "@/lib/availability";
import { dateFromKey, getWeekDates, toDateKey } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { rebuildConflictsForTask } from "@/lib/scheduler";
import { SCHEDULE_STATUS, TIME_SLOT, asTimeSlot, type TimeSlotValue } from "@/lib/schedule-rules";
import { parseEffectivePolicy, parseTagSnapshot, SHIFT_TAG_REQUIREMENT, SHIFT_TYPE_CATEGORY } from "@/lib/staff-policy";

export const runtime = "nodejs";

type ManualAdjustBody = {
  assignmentId?: string;
  doctorId?: string;
  date?: string;
  weekday?: number;
  roomNumber?: number;
  timeSlot?: TimeSlotValue;
};

function sameSlot(left: { date: Date; timeSlot: string }, dateKey: string, timeSlot: TimeSlotValue) {
  return toDateKey(left.date) === dateKey && left.timeSlot === timeSlot;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireScheduleTaskAccess(params.id);
    const body = (await request.json()) as ManualAdjustBody;
    const task = await prisma.scheduleTask.findUnique({
      where: { id: params.id },
      include: {
        doctors: true,
        unavailableTimes: true,
        requirements: {
          include: {
            shiftType: {
              include: {
                requiredTags: { include: { staffTag: true } }
              }
            }
          }
        },
        assignments: true
      }
    });

    if (!task) {
      return NextResponse.json({ message: "排班任务不存在" }, { status: 404 });
    }

    const doctor = task.doctors.find((item) => item.id === body.doctorId);
    if (!doctor) {
      return NextResponse.json({ message: "人员不在本次排班任务名单中" }, { status: 400 });
    }

    const existingAssignment = body.assignmentId ? task.assignments.find((assignment) => assignment.id === body.assignmentId) : null;

    if (body.assignmentId && !existingAssignment) {
      return NextResponse.json({ message: "原排班记录不存在" }, { status: 404 });
    }

    const dateKey = existingAssignment ? toDateKey(existingAssignment.date) : String(body.date ?? "").slice(0, 10);
    const timeSlot = existingAssignment ? asTimeSlot(existingAssignment.timeSlot) : body.timeSlot;
    const roomNumber = existingAssignment ? existingAssignment.roomNumber : Number(body.roomNumber);

    if (!dateKey || !timeSlot || !([TIME_SLOT.FULL_DAY, TIME_SLOT.MORNING, TIME_SLOT.AFTERNOON] as string[]).includes(timeSlot)) {
      return NextResponse.json({ message: "排班日期或时段无效" }, { status: 400 });
    }
    if (task.mode === "FULL_DAY" && timeSlot !== TIME_SLOT.FULL_DAY) {
      return NextResponse.json({ message: "全天班模式只能调整全天班" }, { status: 400 });
    }
    if (task.mode === "HALF_DAY" && timeSlot === TIME_SLOT.FULL_DAY) {
      return NextResponse.json({ message: "半天班模式只能调整上午或下午" }, { status: 400 });
    }

    const weekday = existingAssignment ? existingAssignment.weekday : getWeekDates(task.weekStartDate).find((day) => day.dateKey === dateKey)?.weekday;

    if (!weekday) {
      return NextResponse.json({ message: "日期不在本次排班周范围内" }, { status: 400 });
    }

    const requirement = task.requirements.find(
      (item) =>
        toDateKey(item.date) === dateKey &&
        asTimeSlot(item.timeSlot) === timeSlot &&
        item.roomNumber === roomNumber &&
        item.enabled &&
        item.requiredDoctors > 0
    );
    if (!requirement) {
      return NextResponse.json({ message: "该日期、时段或单元未开放" }, { status: 400 });
    }

    if (isDoctorUnavailable(task.unavailableTimes, doctor.id, dateKey, timeSlot)) {
      return NextResponse.json({ message: "所选人员在该时间段不可用，不能保存" }, { status: 409 });
    }

    const identityBlock = identityBlockReason(doctor, requirement);
    if (identityBlock) {
      return NextResponse.json({ message: `所选人员不符合该班次身份要求：${identityBlock}` }, { status: 409 });
    }

    const duplicate = task.assignments.find(
      (assignment) => assignment.doctorId === doctor.id && assignment.id !== existingAssignment?.id && sameSlot(assignment, dateKey, timeSlot)
    );

    if (duplicate) {
      return NextResponse.json({ message: "同一人员同一时间不能重复排到多个单元" }, { status: 409 });
    }

    if (!existingAssignment) {
      const currentCellCount = task.assignments.filter((assignment) => sameSlot(assignment, dateKey, timeSlot) && assignment.roomNumber === roomNumber).length;
      if (currentCellCount >= requirement.requiredDoctors) {
        return NextResponse.json({ message: "该单元当前时段已排满" }, { status: 400 });
      }
    }

    if (existingAssignment) {
      await prisma.scheduleAssignment.update({
        where: { id: existingAssignment.id },
        data: { doctorId: doctor.id }
      });
    } else {
      await prisma.scheduleAssignment.create({
        data: {
          departmentId: task.departmentId,
          scheduleTaskId: task.id,
          date: dateFromKey(dateKey),
          weekday,
          roomNumber,
          timeSlot,
          doctorId: doctor.id,
          locked: false
        }
      });
    }

    await prisma.scheduleTask.update({
      where: { id: task.id },
      data: { status: SCHEDULE_STATUS.GENERATED }
    });

    const updated = await rebuildConflictsForTask(task.id);
    return NextResponse.json({ task: updated });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    console.error(error);
    return NextResponse.json({ message: "手动调整失败" }, { status: 500 });
  }
}

function identityBlockReason(doctor: any, requirement: any) {
  if (doctor.active === false) return "人员未启用";
  const tagIds = new Set(parseTagSnapshot(doctor.tagSnapshotJson).map((tag) => tag.id));
  const policy = parseEffectivePolicy(doctor.policySnapshotJson);
  if (!policy.participatesInScheduling) return "身份策略不参与自动排班";

  const rules = requirement.shiftType?.requiredTags ?? [];
  for (const rule of rules.filter((item: any) => item.requirementType === SHIFT_TAG_REQUIREMENT.FORBIDDEN)) {
    if (tagIds.has(rule.staffTagId)) return `拥有禁排身份 ${rule.staffTag?.name ?? ""}`;
  }
  for (const rule of rules.filter((item: any) => item.requirementType === SHIFT_TAG_REQUIREMENT.REQUIRED)) {
    if (!tagIds.has(rule.staffTagId)) return `缺少必需身份 ${rule.staffTag?.name ?? ""}`;
  }
  const allowed = rules.filter((item: any) => item.requirementType === SHIFT_TAG_REQUIREMENT.ALLOWED);
  if (allowed.length && !allowed.some((rule: any) => tagIds.has(rule.staffTagId))) return "不在允许身份范围内";

  const category = requirement.shiftType?.category ?? "";
  const isNightShift = Boolean(requirement.shiftType?.isNight) || category === SHIFT_TYPE_CATEGORY.NIGHT;
  if (isNightShift && policy.canWorkNightShift === false) return "身份策略禁止夜班";
  if (!isNightShift && policy.canWorkDayShift === false) return "身份策略禁止白班";
  if (category === SHIFT_TYPE_CATEGORY.FIRST_LINE && policy.canWorkFirstLine === false) return "身份策略禁止一线班";
  if (category === SHIFT_TYPE_CATEGORY.SECOND_LINE && policy.canWorkSecondLine === false) return "身份策略禁止二线班";
  if (category === SHIFT_TYPE_CATEGORY.EMERGENCY && policy.canWorkEmergency === false) return "身份策略禁止急诊班";
  if (category === SHIFT_TYPE_CATEGORY.ON_CALL && policy.canWorkOnCall === false) return "身份策略禁止留班";
  if (category === SHIFT_TYPE_CATEGORY.BACKUP && policy.canWorkBackup === false) return "身份策略禁止备班";
  return "";
}
