import { NextResponse } from "next/server";
import { authErrorResponse, requireScheduleTaskAccess } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { dateFromKey, toDateKey } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { candidateReasons, getEffectiveFeedbackUnavailableTimes, getSchedulePreviewData } from "@/lib/preview-data";
import { rebuildConflictsForTask } from "@/lib/scheduler";
import { SCHEDULE_STATUS, asTimeSlot, requirementsToCells, type TimeSlotValue } from "@/lib/schedule-rules";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, task: accessTask } = await requireScheduleTaskAccess(params.id);
    const body = await request.json();
    const dateKey = String(body.date ?? "").slice(0, 10);
    const timeSlot = asTimeSlot(String(body.timeSlot ?? ""));
    const roomNumber = Number(body.roomNumber);
    const doctorIds: string[] = Array.from(new Set(Array.isArray(body.doctorIds) ? body.doctorIds.map(String).filter(Boolean) : []));
    const forceOverride = body.forceOverride === true;
    const overrideReason = String(body.overrideReason ?? "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !roomNumber) {
      return NextResponse.json({ message: "日期或单元无效" }, { status: 400 });
    }

    const task = await prisma.scheduleTask.findUnique({
      where: { id: params.id },
      include: {
        doctors: true,
        unavailableTimes: true,
        requirements: {
          include: {
            shiftType: {
              include: { requiredTags: { include: { staffTag: true } } }
            }
          }
        },
        assignments: true
      }
    });
    if (!task) return NextResponse.json({ message: "排班任务不存在" }, { status: 404 });

    const cells = requirementsToCells(task.requirements);
    const cell = cells.find((item) => item.dateKey === dateKey && item.timeSlot === timeSlot && item.roomNumber === roomNumber);
    if (!cell) return NextResponse.json({ message: "该日期或班次未配置排班需求" }, { status: 400 });
    if (doctorIds.length > cell.requiredDoctors) {
      return NextResponse.json({ message: `该单元最多安排 ${cell.requiredDoctors} 人` }, { status: 400 });
    }

    const currentAssignments = task.assignments.filter(
      (assignment) => toDateKey(assignment.date) === dateKey && asTimeSlot(assignment.timeSlot) === timeSlot && assignment.roomNumber === roomNumber
    );
    if (currentAssignments.some((assignment) => assignment.locked)) {
      return NextResponse.json({ message: "该单元已锁定，请先解锁后再修改" }, { status: 409 });
    }

    const doctorsById = new Map(task.doctors.map((doctor) => [doctor.id, doctor]));
    const missing = doctorIds.filter((doctorId) => !doctorsById.has(doctorId));
    if (missing.length) return NextResponse.json({ message: "包含不在本任务名单中的人员" }, { status: 400 });

    const effectiveUnavailableTimes = [...task.unavailableTimes, ...(await getEffectiveFeedbackUnavailableTimes(task.id, task.doctors))];
    const currentDoctorIds = new Set(currentAssignments.map((assignment) => assignment.doctorId));
    const violations = doctorIds
      .map((doctorId) => {
        const doctor = doctorsById.get(doctorId)!;
        return { doctorId, name: doctor.name, reasons: candidateReasons({ task, doctor, cell, currentDoctorIds, effectiveUnavailableTimes }) };
      })
      .filter((item) => item.reasons.length > 0);

    if (violations.length && !forceOverride) {
      return NextResponse.json({ message: "存在不合规人员，需强制覆盖后才能保存", violations }, { status: 409 });
    }
    if (violations.length && !overrideReason) {
      return NextResponse.json({ message: "强制覆盖必须填写原因", violations }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.scheduleAssignment.deleteMany({
        where: { scheduleTaskId: task.id, date: dateFromKey(dateKey), timeSlot, roomNumber }
      });
      if (doctorIds.length) {
        await tx.scheduleAssignment.createMany({
          data: doctorIds.map((doctorId) => {
            const violation = violations.find((item) => item.doctorId === doctorId);
            return {
              departmentId: task.departmentId,
              scheduleTaskId: task.id,
              date: dateFromKey(dateKey),
              weekday: cell.weekday,
              roomNumber,
              timeSlot,
              doctorId,
              locked: false,
              manualOverride: Boolean(violation),
              overrideReason: violation ? overrideReason : null
            };
          })
        });
      }
      await tx.scheduleTask.update({ where: { id: task.id }, data: { status: SCHEDULE_STATUS.PREVIEW } });
    });

    await rebuildConflictsForTask(task.id);
    const preview = await getSchedulePreviewData(task.id);
    await writeAuditLog({
      actorUserId: user.id,
      hospitalId: accessTask.hospitalId,
      departmentId: accessTask.departmentId,
      unitId: accessTask.unitId,
      action: violations.length ? "FORCE_OVERRIDE_PREVIEW_ASSIGNMENT" : "EDIT_PREVIEW_ASSIGNMENT",
      targetType: "ScheduleAssignment",
      targetId: task.id,
      beforeJson: currentAssignments,
      afterJson: { date: dateKey, timeSlot, roomNumber, doctorIds, violations },
      reason: violations.length ? overrideReason : null,
      request
    });
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
    console.error(error);
    return NextResponse.json({ message: "修改预览排班失败" }, { status: 500 });
  }
}
