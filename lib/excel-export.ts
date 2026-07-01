import ExcelJS from "exceljs";
import { getWeekDates, getWeekdayLabel, toDateKey } from "@/lib/date-utils";
import {
  MODE_LABELS,
  SLOT_LABELS,
  TIME_SLOT,
  asDoctorType,
  asScheduleMode,
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
  RESIDENT: "\u89c4\u57f9",
  INTERN: "\u5b9e\u4e60"
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
  workbook.creator = "\u5fc3\u7535\u56fe\u5ba4\u5468\u6392\u73ed\u7cfb\u7edf";
  workbook.created = new Date();

  const requirementCells = requirementsToCells(task.requirements);
  const maxRoomNumber = Math.max(1, getMaxRoomNumberFromRequirements(task.requirements));
  const roomNumbers = Array.from({ length: maxRoomNumber }, (_, index) => index + 1);
  const roomHeaders = roomNumbers.map((room) => `\u8bca\u5ba4${room}`);
  const scheduleSheet = workbook.addWorksheet("\u8bca\u5ba4\u6392\u73ed\u8868");
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

  for (const day of getWeekDates(task.weekStartDate)) {
    for (const timeSlot of getTimeSlotsForMode(asScheduleMode(task.mode))) {
      const row: Record<string, string> = {
        date: day.dateKey,
        weekday: day.label,
        timeSlot: SLOT_LABELS[timeSlot]
      };
      const slotRequirements = requirementCells.filter(
        (item) => item.dateKey === day.dateKey && item.timeSlot === timeSlot
      );
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

  const statsSheet = workbook.addWorksheet("\u533b\u751f\u4e2a\u4eba\u6392\u73ed\u7edf\u8ba1");
  statsSheet.columns = [
    { header: "\u533b\u751f", key: "name", width: 14 },
    { header: "\u7c7b\u578b", key: "doctorType", width: 10 },
    { header: "\u603b\u73ed\u6b21\u6570", key: "totalAssignments", width: 12 },
    { header: "\u5168\u5929\u73ed\u6b21\u6570", key: "fullDayAssignments", width: 12 },
    { header: "\u4e0a\u5348\u73ed\u6b21\u6570", key: "morningAssignments", width: 12 },
    { header: "\u4e0b\u5348\u73ed\u6b21\u6570", key: "afternoonAssignments", width: 12 },
    { header: "\u5468\u672b\u73ed\u6b21\u6570", key: "weekendAssignments", width: 12 },
    { header: "\u5468\u4e00\u5468\u4e8c\u9ad8\u5cf0\u73ed", key: "peakAssignments", width: 16 },
    { header: "\u6700\u957f\u8fde\u7eed\u4e0a\u73ed\u5929\u6570", key: "maxConsecutiveDays", width: 18 },
    { header: "\u4e0d\u53ef\u7528\u51b2\u7a81\u6570", key: "unavailableConflictCount", width: 14 },
    { header: "\u660e\u7ec6", key: "details", width: 42 }
  ];
  for (const item of task.stats.perDoctor) {
    statsSheet.addRow({
      ...item,
      doctorType: DOCTOR_TYPE_LABEL[item.doctorType],
      details: item.assignments
        .map((assignment) => `${assignment.date}${assignment.weekdayLabel}${assignment.timeSlotLabel} \u8bca\u5ba4${assignment.roomNumber}`)
        .join("\uff1b")
    });
  }
  styleWorksheet(statsSheet);

  const conflictSheet = workbook.addWorksheet("\u51b2\u7a81\u62a5\u544a");
  conflictSheet.columns = [
    { header: "\u65e5\u671f", key: "date", width: 14 },
    { header: "\u661f\u671f", key: "weekday", width: 10 },
    { header: "\u65f6\u6bb5", key: "timeSlot", width: 10 },
    { header: "\u8bca\u5ba4", key: "roomNumber", width: 10 },
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
      roomNumber: `\u8bca\u5ba4${conflict.roomNumber}`,
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
