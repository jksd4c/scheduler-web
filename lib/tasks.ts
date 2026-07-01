import { prisma } from "@/lib/prisma";
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
      requirements: {
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

  const stats = calculateScheduleStats({
    mode: asScheduleMode(task.mode),
    weekStartDate: task.weekStartDate,
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
    conflicts: task.conflicts
  });

  return {
    ...task,
    stats
  };
}
