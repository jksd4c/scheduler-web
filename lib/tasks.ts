import { prisma } from "@/lib/prisma";
import { dateFromKey, toDateKey } from "@/lib/date-utils";
import { asDoctorType, asScheduleMode, asTimeSlot } from "@/lib/schedule-rules";
import { calculateScheduleStats } from "@/lib/statistics";

export async function getTaskDetail(taskId: string) {
  const task = await prisma.scheduleTask.findUnique({
    where: { id: taskId },
    include: {
      doctors: {
        orderBy: [{ createdAt: "asc" }]
      },
      unavailableTimes: {
        orderBy: [{ date: "asc" }, { timeSlot: "asc" }]
      },
      weeklyTemplates: {
        include: {
          shiftType: {
            include: {
              requiredTags: { include: { staffTag: true } }
            }
          }
        },
        orderBy: [{ weekday: "asc" }]
      },
      dateOverrides: {
        include: {
          shiftType: {
            include: {
              requiredTags: { include: { staffTag: true } }
            }
          }
        },
        orderBy: [{ date: "asc" }]
      },
      requirements: {
        include: {
          shiftType: {
            include: {
              requiredTags: { include: { staffTag: true } }
            }
          }
        },
        orderBy: [{ date: "asc" }, { timeSlot: "asc" }, { roomNumber: "asc" }]
      },
      assignments: {
        include: { doctor: true },
        orderBy: [{ date: "asc" }, { timeSlot: "asc" }, { roomNumber: "asc" }, { createdAt: "asc" }]
      },
      conflicts: {
        orderBy: [{ severity: "desc" }, { date: "asc" }, { timeSlot: "asc" }, { roomNumber: "asc" }]
      }
    }
  });

  if (!task) {
    return null;
  }

  const taskStartDate = (task as any).startDate ?? task.weekStartDate;
  const taskEndDate = (task as any).endDate ?? task.weekEndDate;
  const specialDates = await prisma.specialDate.findMany({
    where: {
      date: { gte: dateFromKey(toDateKey(taskStartDate)), lte: dateFromKey(toDateKey(taskEndDate)) },
      OR: [
        { unitId: task.unitId },
        { unitId: null, departmentId: task.departmentId },
        { unitId: null, departmentId: null, hospitalId: task.hospitalId }
      ]
    },
    orderBy: [{ date: "asc" }, { createdAt: "desc" }],
    select: { date: true, dateType: true }
  });
  const specialDateTypes = buildSpecialDateTypeMap(specialDates);

  const stats = calculateScheduleStats({
    mode: asScheduleMode(task.mode),
    weekStartDate: task.weekStartDate,
    startDate: taskStartDate,
    endDate: taskEndDate,
    doctors: task.doctors.map((doctor) => ({
        ...doctor,
        doctorType: asDoctorType(doctor.doctorType)
      })),
    requirements: task.requirements.map((requirement) => ({
      ...requirement,
      timeSlot: asTimeSlot(requirement.timeSlot)
    })),
    assignments: task.assignments.map((assignment) => ({
      ...assignment,
      timeSlot: asTimeSlot(assignment.timeSlot)
    })),
    unavailableTimes: task.unavailableTimes,
    conflicts: task.conflicts,
    specialDateTypes
  });

  return {
    ...task,
    stats
  };
}

function buildSpecialDateTypeMap(items: Array<{ date: Date; dateType: string }>) {
  const output: Record<string, string> = {};
  for (const item of items) {
    const key = toDateKey(item.date);
    if (!output[key] || specialDatePriority(item.dateType) > specialDatePriority(output[key])) {
      output[key] = item.dateType;
    }
  }
  return output;
}

function specialDatePriority(type: string) {
  if (type === "MAKEUP_WORKDAY") return 40;
  if (type === "PUBLIC_HOLIDAY" || type === "HOLIDAY") return 30;
  if (type === "CUSTOM_REST_DAY" || type === "CUSTOM_REST") return 20;
  if (type === "CUSTOM_SPECIAL_DAY" || type === "CUSTOM_SPECIAL") return 10;
  return 0;
}
