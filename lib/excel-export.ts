import ExcelJS from "exceljs";
import { getDateRangeDates, getWeekdayLabel, toDateKey } from "@/lib/date-utils";
import {
  MODE_LABELS,
  SLOT_LABELS,
  TASK_SCHEDULE_MODE,
  TIME_SLOT,
  asDoctorType,
  asScheduleMode,
  asTaskScheduleMode,
  asTimeSlot,
  getMaxRoomNumberFromRequirements,
  getTimeSlotsForMode,
  requirementsToCells,
  type DoctorTypeValue,
  type TimeSlotValue
} from "@/lib/schedule-rules";
import type { getTaskDetail } from "@/lib/tasks";

type TaskDetail = NonNullable<Awaited<ReturnType<typeof getTaskDetail>>>;

const DOCTOR_TYPE_LABEL: Record<DoctorTypeValue, string> = {
  RESIDENT: "固定",
  INTERN: "轮转"
};

function doctorNamesForCell(task: TaskDetail, dateKey: string, timeSlot: TimeSlotValue, roomNumber: number) {
  return task.assignments
    .filter(
      (assignment) =>
        toDateKey(assignment.date) === dateKey &&
        asTimeSlot(assignment.timeSlot) === timeSlot &&
        assignment.roomNumber === roomNumber
    )
    .map((assignment) => `${assignment.doctor.name}\uff08${DOCTOR_TYPE_LABEL[asDoctorType(assignment.doctor.doctorType)]}\uff09`)
    .join("\u3001");
}

function requirementLabel(requirement: ReturnType<typeof requirementsToCells>[number], taskScheduleMode: string) {
  return asTaskScheduleMode(taskScheduleMode) === TASK_SCHEDULE_MODE.MEDTECH_ROOM
    ? `单元${requirement.roomNumber}`
    : requirement.shiftType?.name ?? `班次${requirement.roomNumber}`;
}

function styleWorksheet(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: "FF1F2937" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEFF6FF" }
  };
  sheet.eachRow((row) => {
    row.alignment = { vertical: "middle", wrapText: true };
  });
}

export async function createScheduleWorkbook(task: TaskDetail) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "公平排班";
  workbook.created = new Date();

  const requirementCells = requirementsToCells(task.requirements);
  const rangeDays = getDateRangeDates((task as any).startDate ?? task.weekStartDate, (task as any).endDate ?? task.weekEndDate);
  const taskScheduleMode = asTaskScheduleMode((task as any).scheduleMode);
  if (taskScheduleMode === TASK_SCHEDULE_MODE.MEDTECH_ROOM) {
    const maxRoomNumber = Math.max(1, getMaxRoomNumberFromRequirements(task.requirements));
    const roomNumbers = Array.from({ length: maxRoomNumber }, (_, index) => index + 1);
    const roomHeaders = roomNumbers.map((room) => `单元${room}`);
    const scheduleSheet = workbook.addWorksheet("单元排班表");
    scheduleSheet.columns =
      task.mode === "FULL_DAY"
        ? [
            { header: "\u65e5\u671f", key: "date", width: 14 },
            { header: "\u661f\u671f", key: "weekday", width: 10 },
            ...roomHeaders.map((header, index) => ({ header, key: `room${index + 1}`, width: 26 }))
          ]
        : [
            { header: "\u65e5\u671f", key: "date", width: 14 },
            { header: "\u661f\u671f", key: "weekday", width: 10 },
            { header: "\u65f6\u6bb5", key: "timeSlot", width: 10 },
            ...roomHeaders.map((header, index) => ({ header, key: `room${index + 1}`, width: 26 }))
          ];

    for (const day of rangeDays) {
      for (const timeSlot of getTimeSlotsForMode(asScheduleMode(task.mode))) {
        const row: Record<string, string> = {
          date: day.dateKey,
          weekday: day.label,
          timeSlot: SLOT_LABELS[timeSlot]
        };
        const slotRequirements = requirementCells.filter((item) => item.dateKey === day.dateKey && item.timeSlot === timeSlot);
        if (slotRequirements.length === 0) {
          row.room1 = "\u672a\u5f00\u653e";
        } else {
          for (const roomNumber of roomNumbers) {
            const requirement = slotRequirements.find((item) => item.roomNumber === roomNumber);
            if (!requirement) {
              row[`room${roomNumber}`] = "";
              continue;
            }
            const names = doctorNamesForCell(task, day.dateKey, timeSlot, roomNumber);
            row[`room${roomNumber}`] = names || `\u672a\u6392\uff08\u9700${requirement.requiredDoctors}\u4eba\uff09`;
          }
        }
        scheduleSheet.addRow(row);
      }
    }
    styleWorksheet(scheduleSheet);
  } else {
    const shiftRequirements = requirementCells.filter((item) => item.shiftTypeId);
    const shiftColumns = Array.from(new Map(shiftRequirements.map((item) => [item.shiftTypeId!, item])).values());
    const scheduleSheet = workbook.addWorksheet(taskScheduleMode === TASK_SCHEDULE_MODE.CUSTOM ? "自定义排班表" : "班次排班表");
    scheduleSheet.columns = [
      { header: "\u65e5\u671f", key: "date", width: 14 },
      { header: "\u661f\u671f", key: "weekday", width: 10 },
      ...shiftColumns.map((requirement, index) => ({ header: requirementLabel(requirement, task.scheduleMode), key: `shift${index + 1}`, width: 28 }))
    ];
    for (const day of rangeDays) {
      const row: Record<string, string> = { date: day.dateKey, weekday: day.label };
      shiftColumns.forEach((column, index) => {
        const requirement = requirementCells.find((item) => item.dateKey === day.dateKey && item.shiftTypeId === column.shiftTypeId);
        if (!requirement) {
          row[`shift${index + 1}`] = "";
          return;
        }
        const names = doctorNamesForCell(task, day.dateKey, requirement.timeSlot, requirement.roomNumber);
        row[`shift${index + 1}`] = names || `未排（需${requirement.requiredDoctors}人）`;
      });
      scheduleSheet.addRow(row);
    }
    styleWorksheet(scheduleSheet);
  }

  const statsSheet = workbook.addWorksheet("人员个人排班统计");
  statsSheet.columns = [
    { header: "人员", key: "name", width: 14 },
    { header: "分组", key: "doctorType", width: 10 },
    { header: "身份/资格", key: "tags", width: 28 },
    { header: "最终资格摘要", key: "eligibilitySummary", width: 42 },
    { header: "总班次数", key: "totalAssignments", width: 12 },
    { header: "总工作量", key: "workloadTotal", width: 10 },
    { header: "工作量系数", key: "targetWorkloadFactor", width: 12 },
    { header: "白班", key: "dayShiftAssignments", width: 10 },
    { header: "夜班", key: "nightShiftAssignments", width: 10 },
    { header: "下夜班", key: "postNightAssignments", width: 10 },
    { header: "周末白班", key: "weekendDayAssignments", width: 12 },
    { header: "周末夜班", key: "weekendNightAssignments", width: 12 },
    { header: "节假日白班", key: "holidayDayAssignments", width: 12 },
    { header: "节假日夜班", key: "holidayNightAssignments", width: 12 },
    { header: "周六夜班", key: "saturdayNightAssignments", width: 12 },
    { header: "周日夜班", key: "sundayNightAssignments", width: 12 },
    { header: "黄金夜班", key: "goldenNightAssignments", width: 12 },
    { header: "高负担夜班", key: "highBurdenNightAssignments", width: 12 },
    { header: "一线班", key: "firstLineAssignments", width: 10 },
    { header: "二线班", key: "secondLineAssignments", width: 10 },
    { header: "留班", key: "onCallAssignments", width: 10 },
    { header: "急诊班", key: "emergencyAssignments", width: 10 },
    { header: "强制覆盖", key: "manualOverrideAssignments", width: 12 },
    { header: "偏好类型", key: "preferenceLabel", width: 18 },
    { header: "偏好满足情况", key: "preferenceSatisfaction", width: 32 },
    { header: "\u5468\u4e00\u5468\u4e8c\u9ad8\u5cf0\u73ed", key: "peakAssignments", width: 16 },
    { header: "\u6700\u957f\u8fde\u7eed\u4e0a\u73ed\u5929\u6570", key: "maxConsecutiveDays", width: 18 },
    { header: "\u4e0d\u53ef\u7528\u51b2\u7a81\u6570", key: "unavailableConflictCount", width: 14 },
    { header: "\u660e\u7ec6", key: "details", width: 42 }
  ];
  for (const item of task.stats.perDoctor) {
    statsSheet.addRow({
      ...item,
      doctorType: DOCTOR_TYPE_LABEL[item.doctorType],
      tags: item.tagNames?.join("、") ?? "",
      details: item.assignments
        .map((assignment) => {
          const requirement = requirementCells.find(
            (cell) => cell.dateKey === assignment.date && cell.timeSlot === assignment.timeSlot && cell.roomNumber === assignment.roomNumber
          );
          const place = requirement ? requirementLabel(requirement, task.scheduleMode) : `单元${assignment.roomNumber}`;
          return `${assignment.date}${assignment.weekdayLabel}${taskScheduleMode === TASK_SCHEDULE_MODE.MEDTECH_ROOM ? assignment.timeSlotLabel : ""} ${place}`;
        })
        .join("\uff1b")
    });
  }
  styleWorksheet(statsSheet);

  const identitySheet = workbook.addWorksheet("身份资格分组统计");
  identitySheet.columns = [
    { header: "身份/资格", key: "tagName", width: 20 },
    { header: "人数", key: "memberCount", width: 10 },
    { header: "总班次", key: "totalAssignments", width: 12 },
    { header: "夜班", key: "nightAssignments", width: 10 },
    { header: "二线班", key: "secondLineAssignments", width: 10 }
  ];
  for (const group of task.stats.identityGroups ?? []) {
    identitySheet.addRow(group);
  }
  if (!task.stats.identityGroups?.length) {
    identitySheet.addRow({ tagName: "暂无身份/资格分组", memberCount: 0, totalAssignments: 0, nightAssignments: 0, secondLineAssignments: 0 });
  }
  styleWorksheet(identitySheet);

  const conflictSheet = workbook.addWorksheet("\u51b2\u7a81\u62a5\u544a");
  conflictSheet.columns = [
    { header: "\u65e5\u671f", key: "date", width: 14 },
    { header: "\u661f\u671f", key: "weekday", width: 10 },
    { header: "\u65f6\u6bb5", key: "timeSlot", width: 10 },
    { header: taskScheduleMode === TASK_SCHEDULE_MODE.MEDTECH_ROOM ? "单元" : "班次", key: "roomNumber", width: 16 },
    { header: "\u7f3a\u5c11\u4eba\u6570", key: "missingCount", width: 12 },
    { header: "\u7c7b\u578b", key: "conflictType", width: 18 },
    { header: "\u4e25\u91cd\u7a0b\u5ea6", key: "severity", width: 12 },
    { header: "\u8bf4\u660e", key: "description", width: 60 }
  ];
  for (const conflict of task.conflicts) {
    conflictSheet.addRow({
      date: toDateKey(conflict.date),
      weekday: getWeekdayLabel(conflict.weekday),
      timeSlot: SLOT_LABELS[asTimeSlot(conflict.timeSlot)],
      roomNumber:
        taskScheduleMode === TASK_SCHEDULE_MODE.MEDTECH_ROOM
          ? `单元${conflict.roomNumber}`
          : requirementLabel(
              requirementCells.find(
                (cell) => cell.dateKey === toDateKey(conflict.date) && cell.timeSlot === asTimeSlot(conflict.timeSlot) && cell.roomNumber === conflict.roomNumber
              ) ?? {
                date: conflict.date,
                dateKey: toDateKey(conflict.date),
                weekday: conflict.weekday as any,
                roomNumber: conflict.roomNumber,
                timeSlot: asTimeSlot(conflict.timeSlot),
                requiredDoctors: 0
              },
              task.scheduleMode
            ),
      missingCount: conflict.missingCount ?? 0,
      conflictType: conflict.conflictType,
      severity: conflict.severity,
      description: conflict.description
    });
  }
  if (task.conflicts.length === 0) {
    conflictSheet.addRow({
      date: "-",
      weekday: "-",
      timeSlot: "-",
      roomNumber: "-",
      missingCount: 0,
      conflictType: "NONE",
      severity: "INFO",
      description: `\u672a\u53d1\u73b0\u51b2\u7a81\u3002\u6392\u73ed\u6a21\u5f0f\uff1a${MODE_LABELS[asScheduleMode(task.mode)]}`
    });
  }
  styleWorksheet(conflictSheet);

  return workbook;
}
