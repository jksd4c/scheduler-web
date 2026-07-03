"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CalendarX,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Settings2,
  Table2,
  UsersRound,
  Wand2
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getDateRangeDates, getDateRangeDayCount, getWeekdayLabel, toDateKey } from "@/lib/date-utils";
import {
  MODE_LABELS,
  PERIOD_TYPE_LABELS,
  SLOT_LABELS,
  STATUS_LABELS,
  TASK_SCHEDULE_MODE_LABELS,
  TASK_SCHEDULE_MODE,
  TIME_SLOT,
  clampRequiredDoctors,
  clampRoomCount,
  getTimeSlotsForMode,
  requirementsToCells
} from "@/lib/schedule-rules";
import {
  DOCTOR_TYPE_LABEL,
  type ApiAssignment,
  type ApiDoctor,
  type ApiRequirement,
  type ApiTaskDetail,
  type TaskScheduleMode,
  type TimeSlot
} from "@/components/schedule-types";
import { defaultWeeklyCount, isDayShiftType, isNightShiftType, sortWardShiftTypes, SPECIAL_DATE_TYPES } from "@/lib/ward-rules";

type TabId = "requirements" | "unavailable" | "generate" | "schedule" | "adjust" | "export";
type ScheduleView = "room" | "doctor";
type BusyState = "load" | "save-requirements" | "save-unavailable" | "delete-result" | "generate" | "preview" | "manual" | "export" | "";

type UnavailableDraft = Record<string, Record<string, { morning: boolean; afternoon: boolean }>>;
type RequirementSlotDraft = { enabled: boolean; rooms: number; requiredDoctors: number; shiftTypeId?: string };
type RequirementDayDraft = {
  fullDay: RequirementSlotDraft;
  morning: RequirementSlotDraft;
  afternoon: RequirementSlotDraft;
};
type RequirementDraft = Record<string, RequirementDayDraft>;
type ShiftRequirementDraft = Record<string, Record<string, number>>;
type WeeklyTemplateDraft = Record<number, Record<string, number>>;
type DateOverrideDraft = Record<string, { overrideEnabled: boolean; dateType: string; note: string; counts: Record<string, number> }>;
type ShiftTypeOption = { id: string; name: string; category: string; isNight: boolean; active: boolean };

const TABS: Array<{ id: TabId; label: string; Icon: LucideIcon }> = [
  { id: "requirements", label: "排班规则", Icon: Table2 },
  { id: "unavailable", label: "不可排班", Icon: CalendarX },
  { id: "generate", label: "自动排班", Icon: Wand2 },
  { id: "schedule", label: "排班表", Icon: Table2 },
  { id: "adjust", label: "手动调整", Icon: Pencil },
  { id: "export", label: "导出", Icon: FileSpreadsheet }
];

const WEEKDAY_ROWS = [1, 2, 3, 4, 5, 6, 7];
const SPECIAL_DATE_OPTIONS = [
  { value: "", label: "按普通日期" },
  { value: SPECIAL_DATE_TYPES.PUBLIC_HOLIDAY, label: "法定节假日" },
  { value: SPECIAL_DATE_TYPES.MAKEUP_WORKDAY, label: "调休上班日" },
  { value: SPECIAL_DATE_TYPES.CUSTOM_REST_DAY, label: "自定义休息日" },
  { value: SPECIAL_DATE_TYPES.CUSTOM_SPECIAL_DAY, label: "自定义特殊日" }
];

const specialDateLabels: Record<string, string> = {
  [SPECIAL_DATE_TYPES.PUBLIC_HOLIDAY]: "法定节假日",
  [SPECIAL_DATE_TYPES.MAKEUP_WORKDAY]: "调休上班日",
  [SPECIAL_DATE_TYPES.CUSTOM_REST_DAY]: "自定义休息日",
  [SPECIAL_DATE_TYPES.CUSTOM_SPECIAL_DAY]: "自定义特殊日"
};

function dateCardClass(weekday: number, dateType?: string) {
  if (dateType === SPECIAL_DATE_TYPES.PUBLIC_HOLIDAY) return "bg-red-50 border-red-100";
  if (dateType === SPECIAL_DATE_TYPES.MAKEUP_WORKDAY) return "bg-orange-50 border-orange-100";
  if (dateType === SPECIAL_DATE_TYPES.CUSTOM_REST_DAY) return "bg-purple-50 border-purple-100";
  if (dateType === SPECIAL_DATE_TYPES.CUSTOM_SPECIAL_DAY) return "bg-yellow-50 border-yellow-100";
  if (weekday === 6 || weekday === 7) return "bg-sky-50 border-sky-100";
  return "bg-white border-slate-200";
}

function doctorTypeBadge(doctorType: ApiDoctor["doctorType"]) {
  return doctorType === "RESIDENT"
    ? "border-teal-200 bg-teal-50 text-hospital-green"
    : "border-blue-200 bg-blue-50 text-hospital-blue";
}

function severityClass(severity: string) {
  if (severity === "ERROR") return "border-red-200 bg-red-50 text-red-700";
  if (severity === "WARNING") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function createClosedSlot(): RequirementSlotDraft {
  return { enabled: false, rooms: 0, requiredDoctors: 1, shiftTypeId: "" };
}

function buildUnavailableDraft(task: ApiTaskDetail) {
  const draft: UnavailableDraft = {};
  const notes: Record<string, string> = {};
  for (const doctor of task.doctors) {
    draft[doctor.id] = {};
    for (const day of getTaskDateRange(task)) {
      draft[doctor.id][day.dateKey] = { morning: false, afternoon: false };
    }
  }
  for (const record of task.unavailableTimes) {
    const dateKey = toDateKey(record.date);
    const slot = draft[record.doctorId]?.[dateKey];
    if (!slot) continue;
    if (record.timeSlot === TIME_SLOT.FULL_DAY) {
      slot.morning = true;
      slot.afternoon = true;
    }
    if (record.timeSlot === TIME_SLOT.MORNING) slot.morning = true;
    if (record.timeSlot === TIME_SLOT.AFTERNOON) slot.afternoon = true;
    if (record.reason && !notes[record.doctorId]) notes[record.doctorId] = record.reason;
  }
  return { draft, notes };
}

function buildRequirementDraft(task: ApiTaskDetail): RequirementDraft {
  const draft: RequirementDraft = {};
  for (const day of getTaskDateRange(task)) {
    draft[day.dateKey] = {
      fullDay: createClosedSlot(),
      morning: createClosedSlot(),
      afternoon: createClosedSlot()
    };
  }
  for (const requirement of task.requirements) {
    const dateKey = toDateKey(requirement.date);
    const day = draft[dateKey];
    if (!day || !requirement.enabled) continue;
    const key =
      requirement.timeSlot === TIME_SLOT.MORNING
        ? "morning"
        : requirement.timeSlot === TIME_SLOT.AFTERNOON
          ? "afternoon"
          : "fullDay";
    day[key].enabled = true;
    day[key].rooms = Math.max(day[key].rooms, requirement.roomNumber);
    day[key].requiredDoctors = clampRequiredDoctors(requirement.requiredDoctors);
    day[key].shiftTypeId = requirement.shiftTypeId ?? "";
  }
  return draft;
}

function buildShiftRequirementDraft(task: ApiTaskDetail, shiftTypes: ShiftTypeOption[]): ShiftRequirementDraft {
  const draft: ShiftRequirementDraft = {};
  for (const day of getTaskDateRange(task)) {
    draft[day.dateKey] = {};
    for (const shiftType of shiftTypes) {
      draft[day.dateKey][shiftType.id] = 0;
    }
  }
  for (const requirement of task.requirements) {
    const dateKey = toDateKey(requirement.date);
    if (!requirement.enabled || !requirement.shiftTypeId || !draft[dateKey]) continue;
    draft[dateKey][requirement.shiftTypeId] = clampRoomCount(requirement.requiredDoctors);
  }
  return draft;
}

function buildWeeklyTemplateDraft(task: ApiTaskDetail, shiftTypes: ShiftTypeOption[]): WeeklyTemplateDraft {
  const sortedShiftTypes = sortWardShiftTypes(shiftTypes.filter((item) => item.active));
  const draft: WeeklyTemplateDraft = {};
  for (const weekday of WEEKDAY_ROWS) {
    draft[weekday] = {};
    for (const shiftType of sortedShiftTypes) {
      draft[weekday][shiftType.id] = defaultWeeklyCount(weekday, shiftType);
    }
  }
  if (task.weeklyTemplates?.length) {
    for (const item of task.weeklyTemplates) {
      if (!draft[item.weekday] || !sortedShiftTypes.some((shiftType) => shiftType.id === item.shiftTypeId)) continue;
      draft[item.weekday][item.shiftTypeId] = item.enabled ? Math.max(0, Math.min(50, Math.floor(item.requiredDoctors))) : 0;
    }
  }
  return draft;
}

function buildDateOverrideDraft(task: ApiTaskDetail, shiftTypes: ShiftTypeOption[]): DateOverrideDraft {
  const sortedShiftTypes = sortWardShiftTypes(shiftTypes.filter((item) => item.active));
  const draft: DateOverrideDraft = {};
  for (const item of task.dateOverrides ?? []) {
    const dateKey = toDateKey(item.date);
    if (!draft[dateKey]) {
      draft[dateKey] = {
        overrideEnabled: Boolean(item.overrideEnabled),
        dateType: item.dateType ?? "",
        note: item.note ?? "",
        counts: {}
      };
      for (const shiftType of sortedShiftTypes) draft[dateKey].counts[shiftType.id] = 0;
    }
    draft[dateKey].overrideEnabled = draft[dateKey].overrideEnabled || Boolean(item.overrideEnabled);
    if (item.dateType) draft[dateKey].dateType = item.dateType;
    if (item.note) draft[dateKey].note = item.note;
    draft[dateKey].counts[item.shiftTypeId] = item.enabled ? Math.max(0, Math.min(50, Math.floor(item.requiredDoctors))) : 0;
  }
  return draft;
}

function expandRequirementDraft(task: ApiTaskDetail, draft: RequirementDraft) {
  const records: Array<{
    date: string;
    weekday: number;
    timeSlot: TimeSlot;
    shiftTypeId?: string;
    enabled: boolean;
    roomNumber: number;
    requiredDoctors: number;
  }> = [];
  for (const day of getTaskDateRange(task)) {
    const value = draft[day.dateKey];
    if (!value) continue;
    const slots =
      task.mode === "FULL_DAY"
        ? [{ timeSlot: TIME_SLOT.FULL_DAY as TimeSlot, slot: value.fullDay }]
        : [
            { timeSlot: TIME_SLOT.MORNING as TimeSlot, slot: value.morning },
            { timeSlot: TIME_SLOT.AFTERNOON as TimeSlot, slot: value.afternoon }
          ];
    for (const item of slots) {
      const rooms = item.slot.enabled ? clampRoomCount(item.slot.rooms) : 0;
      const requiredDoctors = clampRequiredDoctors(item.slot.requiredDoctors);
      for (let roomNumber = 1; roomNumber <= rooms; roomNumber += 1) {
        records.push({
          date: day.dateKey,
          weekday: day.weekday,
          timeSlot: item.timeSlot,
          shiftTypeId: item.slot.shiftTypeId || undefined,
          enabled: true,
          roomNumber,
          requiredDoctors
        });
      }
    }
  }
  return records;
}

function expandShiftRequirementDraft(task: ApiTaskDetail, draft: ShiftRequirementDraft, shiftTypes: ShiftTypeOption[]) {
  const activeShiftTypes = shiftTypes.filter((item) => item.active);
  return getTaskDateRange(task).flatMap((day) =>
    activeShiftTypes
      .map((shiftType, index) => {
        const requiredDoctors = clampRoomCount(Number(draft[day.dateKey]?.[shiftType.id] ?? 0));
        if (requiredDoctors <= 0) return null;
        return {
          date: day.dateKey,
          weekday: day.weekday,
          timeSlot: TIME_SLOT.FULL_DAY as TimeSlot,
          shiftTypeId: shiftType.id,
          enabled: true,
          roomNumber: index + 1,
          requiredDoctors
        };
      })
      .filter(Boolean)
  ) as Array<{
    date: string;
    weekday: number;
    timeSlot: TimeSlot;
    shiftTypeId?: string;
    enabled: boolean;
    roomNumber: number;
    requiredDoctors: number;
  }>;
}

function doctorLabel(doctor: ApiDoctor) {
  return `${doctor.name}（${DOCTOR_TYPE_LABEL[doctor.doctorType]}）`;
}

function currentTaskMode(value: unknown): TaskScheduleMode {
  return value === TASK_SCHEDULE_MODE.WARD_SHIFT || value === TASK_SCHEDULE_MODE.CUSTOM ? value : TASK_SCHEDULE_MODE.MEDTECH_ROOM;
}

function getTaskStartDate(task: ApiTaskDetail) {
  return task.startDate ?? task.weekStartDate;
}

function getTaskEndDate(task: ApiTaskDetail) {
  return task.endDate ?? task.weekEndDate;
}

function getTaskDateRange(task: ApiTaskDetail) {
  return getDateRangeDates(getTaskStartDate(task), getTaskEndDate(task));
}

export function TaskDetailClient({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<ApiTaskDetail | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("requirements");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeRulesMonth, setActiveRulesMonth] = useState("");
  const [scheduleView, setScheduleView] = useState<ScheduleView>("room");
  const [busy, setBusy] = useState<BusyState>("load");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requirementDraft, setRequirementDraft] = useState<RequirementDraft>({});
  const [shiftRequirementDraft, setShiftRequirementDraft] = useState<ShiftRequirementDraft>({});
  const [weeklyTemplateDraft, setWeeklyTemplateDraft] = useState<WeeklyTemplateDraft>({});
  const [dateOverrideDraft, setDateOverrideDraft] = useState<DateOverrideDraft>({});
  const [selectedOverrideDate, setSelectedOverrideDate] = useState("");
  const [shiftTypes, setShiftTypes] = useState<ShiftTypeOption[]>([]);
  const [unavailableDraft, setUnavailableDraft] = useState<UnavailableDraft>({});
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const loadTask = useCallback(async () => {
    setBusy("load");
    setError("");
    try {
      const response = await fetch(`/api/tasks/${taskId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "获取排班任务失败");
      setTask(data.task);
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取排班任务失败");
    } finally {
      setBusy("");
    }
  }, [taskId]);

  useEffect(() => {
    void loadTask();
  }, [loadTask]);

  useEffect(() => {
    fetch("/api/shift-types")
      .then((response) => (response.ok ? response.json() : { shiftTypes: [] }))
      .then((data) => setShiftTypes((data.shiftTypes ?? []).filter((item: ShiftTypeOption) => item.active)))
      .catch(() => setShiftTypes([]));
  }, []);

  useEffect(() => {
    if (!task) return;
    setRequirementDraft(buildRequirementDraft(task));
    setShiftRequirementDraft(buildShiftRequirementDraft(task, shiftTypes));
    setWeeklyTemplateDraft(buildWeeklyTemplateDraft(task, shiftTypes));
    setDateOverrideDraft(buildDateOverrideDraft(task, shiftTypes));
    const { draft, notes } = buildUnavailableDraft(task);
    setUnavailableDraft(draft);
    setNoteDraft(notes);
  }, [task, shiftTypes]);

  const weekDays = useMemo(() => (task ? getTaskDateRange(task) : []), [task]);
  const ruleMonthOptions = useMemo(() => Array.from(new Set(weekDays.map((day) => day.monthKey))), [weekDays]);
  const visibleWeekDays = useMemo(
    () => (ruleMonthOptions.length > 2 && activeRulesMonth ? weekDays.filter((day) => day.monthKey === activeRulesMonth) : weekDays),
    [activeRulesMonth, ruleMonthOptions.length, weekDays]
  );
  const requirementCells = useMemo(() => (task ? requirementsToCells(task.requirements) : []), [task]);
  const activeShiftTypes = useMemo(() => shiftTypes.filter((item) => item.active), [shiftTypes]);
  const wardShiftTypes = useMemo(() => sortWardShiftTypes(activeShiftTypes), [activeShiftTypes]);
  const taskScheduleMode = currentTaskMode(task?.scheduleMode);

  useEffect(() => {
    if (!ruleMonthOptions.length) return;
    if (!activeRulesMonth || !ruleMonthOptions.includes(activeRulesMonth)) {
      setActiveRulesMonth(ruleMonthOptions[0]);
    }
  }, [activeRulesMonth, ruleMonthOptions]);

  function assignmentsFor(dateKey: string, timeSlot: TimeSlot, roomNumber: number) {
    return (
      task?.assignments.filter(
        (assignment) =>
          toDateKey(assignment.date) === dateKey &&
          assignment.timeSlot === timeSlot &&
          assignment.roomNumber === roomNumber
      ) ?? []
    );
  }

  function isDoctorUnavailable(doctorId: string, dateKey: string, timeSlot: TimeSlot) {
    if (!task) return false;
    return task.unavailableTimes.some((record) => {
      if (record.doctorId !== doctorId || toDateKey(record.date) !== dateKey) return false;
      if (timeSlot === TIME_SLOT.FULL_DAY) return true;
      return record.timeSlot === TIME_SLOT.FULL_DAY || record.timeSlot === timeSlot;
    });
  }

  function isDoctorTaken(doctorId: string, dateKey: string, timeSlot: TimeSlot, ignoreAssignmentId?: string) {
    if (!task) return false;
    return task.assignments.some(
      (assignment) =>
        assignment.id !== ignoreAssignmentId &&
        assignment.doctorId === doctorId &&
        toDateKey(assignment.date) === dateKey &&
        assignment.timeSlot === timeSlot
    );
  }

  function availableDoctors(dateKey: string, timeSlot: TimeSlot, ignoreAssignmentId?: string, currentDoctorId?: string) {
    if (!task) return [];
    const candidates = task.doctors.filter(
      (doctor) => !isDoctorUnavailable(doctor.id, dateKey, timeSlot) && !isDoctorTaken(doctor.id, dateKey, timeSlot, ignoreAssignmentId)
    );
    const current = currentDoctorId ? task.doctors.find((doctor) => doctor.id === currentDoctorId) : undefined;
    return current && !candidates.some((doctor) => doctor.id === current.id) ? [current, ...candidates] : candidates;
  }

  function updateRequirementSlot(dateKey: string, slotName: keyof RequirementDayDraft, patch: Partial<RequirementSlotDraft>) {
    setRequirementDraft((previous) => {
      const day = previous[dateKey] ?? {
        fullDay: createClosedSlot(),
        morning: createClosedSlot(),
        afternoon: createClosedSlot()
      };
      return {
        ...previous,
        [dateKey]: {
          ...day,
          [slotName]: { ...day[slotName], ...patch }
        }
      };
    });
  }

  function toggleUnavailable(doctorId: string, dateKey: string, slot: TimeSlot) {
    setUnavailableDraft((previous) => {
      const days = { ...(previous[doctorId] ?? {}) };
      const current = days[dateKey] ?? { morning: false, afternoon: false };
      if (slot === TIME_SLOT.FULL_DAY) {
        const next = !(current.morning && current.afternoon);
        days[dateKey] = { morning: next, afternoon: next };
      } else if (slot === TIME_SLOT.MORNING) {
        days[dateKey] = { ...current, morning: !current.morning };
      } else {
        days[dateKey] = { ...current, afternoon: !current.afternoon };
      }
      return { ...previous, [doctorId]: days };
    });
  }

  async function saveRequirements() {
    if (!task) return;
    if (
      task.assignments.length > 0 &&
      !window.confirm("修改排班规则会导致当前排班结果不再适用，是否清空当前排班结果并保存新规则？")
    ) {
      return;
    }
    setBusy("save-requirements");
    setError("");
    setNotice("");
    try {
      const isWardTemplate = currentTaskMode(task.scheduleMode) === TASK_SCHEDULE_MODE.WARD_SHIFT;
      const response = await fetch(`/api/tasks/${task.id}/requirements`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isWardTemplate
            ? {
                ruleMode: "WARD_WEEKLY_TEMPLATE",
                weeklyTemplates: WEEKDAY_ROWS.flatMap((weekday) =>
                  wardShiftTypes.map((shiftType) => ({
                    weekday,
                    shiftTypeId: shiftType.id,
                    enabled: Number(weeklyTemplateDraft[weekday]?.[shiftType.id] ?? 0) > 0,
                    requiredDoctors: Math.max(0, Math.min(50, Math.floor(Number(weeklyTemplateDraft[weekday]?.[shiftType.id] ?? 0))))
                  }))
                ),
                dateOverrides: Object.entries(dateOverrideDraft)
                  .filter(([, value]) => value.overrideEnabled || value.dateType || value.note.trim())
                  .flatMap(([date, value]) =>
                    wardShiftTypes.map((shiftType) => ({
                      date,
                      shiftTypeId: shiftType.id,
                      dateType: value.dateType || null,
                      note: value.note.trim() || null,
                      overrideEnabled: value.overrideEnabled,
                      enabled: Number(value.counts[shiftType.id] ?? 0) > 0,
                      requiredDoctors: Math.max(0, Math.min(50, Math.floor(Number(value.counts[shiftType.id] ?? 0))))
                    }))
                  )
              }
            : {
                records:
                  currentTaskMode(task.scheduleMode) === TASK_SCHEDULE_MODE.MEDTECH_ROOM
                    ? expandRequirementDraft(task, requirementDraft)
                    : expandShiftRequirementDraft(task, shiftRequirementDraft, activeShiftTypes)
              }
        )
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "保存排班规则失败");
      setTask(data.task);
      setNotice("排班规则已保存，旧排班结果已清空。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存排班规则失败");
    } finally {
      setBusy("");
    }
  }

  async function saveUnavailable() {
    if (!task) return;
    setBusy("save-unavailable");
    setError("");
    setNotice("");
    const records: Array<{ doctorId: string; date: string; timeSlot: TimeSlot; reason?: string }> = [];
    for (const doctor of task.doctors) {
      for (const day of weekDays) {
        const value = unavailableDraft[doctor.id]?.[day.dateKey];
        if (!value?.morning && !value?.afternoon) continue;
        const reason = noteDraft[doctor.id]?.trim() || undefined;
        if (value.morning && value.afternoon) {
          records.push({ doctorId: doctor.id, date: day.dateKey, timeSlot: TIME_SLOT.FULL_DAY, reason });
        } else {
          if (value.morning) records.push({ doctorId: doctor.id, date: day.dateKey, timeSlot: TIME_SLOT.MORNING, reason });
          if (value.afternoon) records.push({ doctorId: doctor.id, date: day.dateKey, timeSlot: TIME_SLOT.AFTERNOON, reason });
        }
      }
    }
    try {
      const response = await fetch(`/api/tasks/${task.id}/unavailable`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "保存失败");
      setTask(data.task);
      setNotice("不可排班时间已保存，旧排班结果已清空。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy("");
    }
  }

  async function generateSchedule() {
    if (!task) return;
    setBusy("generate");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/tasks/${task.id}/generate`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "生成排班失败");
      setTask(data.task);
      setActiveTab("schedule");
      setNotice("排班已生成。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成排班失败");
    } finally {
      setBusy("");
    }
  }

  async function generatePreviewFromWizard() {
    if (!task) return;
    setBusy("preview");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/tasks/${task.id}/preview/generate`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "生成预览失败");
      window.location.assign(`/tasks/${task.id}/preview`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成预览失败");
    } finally {
      setBusy("");
    }
  }

  async function clearScheduleResult() {
    if (!task) return;
    if (busy === "delete-result") return;
    if (!window.confirm("确认清空当前排班结果吗？人员名单、不可排班时间和排班规则将保留。")) return;
    setBusy("delete-result");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/tasks/${task.id}/schedule-result`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "清空排班结果失败");
      setTask(data.task);
      setNotice("排班结果已清空，可以重新生成。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "清空排班结果失败");
    } finally {
      setBusy("");
    }
  }

  async function exportExcel() {
    if (!task || busy === "export") return;
    setBusy("export");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/tasks/${task.id}/export`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message ?? "导出 Excel 失败");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `公平排班_${toDateKey(getTaskStartDate(task))}至${toDateKey(getTaskEndDate(task))}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Excel 已开始下载。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "导出 Excel 失败");
    } finally {
      setBusy("");
    }
  }

  async function manualAdjust(payload: {
    assignmentId?: string;
    doctorId: string;
    date?: string;
    weekday?: number;
    roomNumber?: number;
    timeSlot?: TimeSlot;
  }) {
    if (!task) return;
    setBusy("manual");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/tasks/${task.id}/manual-adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "手动调整失败");
      setTask(data.task);
      setNotice("排班已更新。");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "手动调整失败");
    } finally {
      setBusy("");
    }
  }

  if (busy === "load" && !task) {
    return <div className="rounded-lg border border-slate-200 bg-white p-6 text-slate-600">正在加载排班任务...</div>;
  }

  if (error && !task) {
    return (
      <div className="space-y-4">
        <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft size={16} />
          返回任务列表
        </Link>
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (!task) return null;

  const currentTask = task;
  const stats = currentTask.stats;
  const slotsForMode = getTimeSlotsForMode(currentTask.mode);
  const hasScheduleResult = currentTask.assignments.length > 0 || currentTask.conflicts.length > 0;

  function renderWizard() {
    const hasRequirements = stats.overall.expectedAssignments > 0;
    const rangeDays = getDateRangeDayCount(getTaskStartDate(currentTask), getTaskEndDate(currentTask));
    const hasPreview = currentTask.assignments.length > 0 || currentTask.status === "PREVIEW" || currentTask.status === "GENERATED";
    const hasFeedback = currentTask.unavailableTimes.length > 0;
    const hasIdentitySnapshot = currentTask.doctors.some((doctor) => {
      const tags = Array.isArray(doctor.tagSnapshotJson) ? doctor.tagSnapshotJson : [];
      return tags.length > 0 || Boolean(doctor.staffProfileId);
    });
    const stepClass = (status: "done" | "warning" | "pending" | "optional") => {
      if (status === "done") return "border-teal-200 bg-teal-50 text-hospital-green";
      if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
      if (status === "optional") return "border-blue-200 bg-blue-50 text-blue-700";
      return "border-slate-200 bg-white text-slate-700";
    };
    const statusLabel = (status: "done" | "warning" | "pending" | "optional") => {
      if (status === "done") return "已完成";
      if (status === "warning") return "有异常";
      if (status === "optional") return "可跳过";
      return "未完成";
    };
    const wizardActionClass =
      "focus-ring inline-flex items-center justify-center rounded-md bg-hospital-green px-3 py-2 text-sm font-medium text-white hover:bg-teal-800";
    const steps: Array<{
      number: number;
      title: string;
      desc: string;
      status: "done" | "warning" | "pending" | "optional";
      action: ReactNode;
    }> = [
      {
        number: 1,
        title: "导入人员",
        desc: `${currentTask.doctors.length} 名人员已在本任务中。可继续维护固定人员池和轮转人员池。`,
        status: currentTask.doctors.length ? "done" : "pending",
        action: <Link href="/dashboard/roster" className={wizardActionClass}>去导入人员</Link>
      },
      {
        number: 2,
        title: "设置分类/身份",
        desc: hasIdentitySnapshot ? "已读取人员身份和排班策略快照。" : "可设置是否参与自动排班、工作量系数、最多班次数等简化策略。",
        status: hasIdentitySnapshot ? "done" : "optional",
        action: <Link href="/dashboard/staff-tags" className={wizardActionClass}>去设置身份</Link>
      },
      {
        number: 3,
        title: "收集并分析反馈",
        desc: hasFeedback ? `已录入 ${currentTask.unavailableTimes.length} 条不可排/反馈约束。` : "可查看谁已加入、谁未反馈，以及哪些反馈会进入算法。",
        status: hasFeedback ? "done" : "optional",
        action: <Link href="/dashboard/feedback-review" className={wizardActionClass}>去查看反馈</Link>
      },
      {
        number: 4,
        title: "自动生成预览",
        desc: hasRequirements ? `当前规则需求 ${stats.overall.expectedAssignments} 个人员班次。` : "请先在高级设置中保存白班/夜班或自定义规则。",
        status: hasPreview ? "done" : hasRequirements ? "pending" : "warning",
        action: (
          <button
            type="button"
            onClick={() => void generatePreviewFromWizard()}
            disabled={busy === "preview" || !hasRequirements}
            className={`${wizardActionClass} disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400`}
          >
            {busy === "preview" ? "生成中..." : "生成预览"}
          </button>
        )
      },
      {
        number: 5,
        title: "网页内修改排班",
        desc: "进入日历预览，点击日期/班次即可调整人员，强制覆盖需要填写原因。",
        status: hasPreview ? "done" : "pending",
        action: <Link href={`/tasks/${currentTask.id}/preview`} className={wizardActionClass}>进入预览修改</Link>
      },
      {
        number: 6,
        title: "导出结果与公平报告",
        desc: "导出 Excel、人员统计、冲突报告和公平性概览。",
        status: currentTask.status === "GENERATED" ? "done" : "pending",
        action: (
          <button
            type="button"
            onClick={() => {
              setShowAdvanced(true);
              setActiveTab("export");
            }}
            className={wizardActionClass}
          >
            导出结果
          </button>
        )
      }
    ];

    return (
      <div className="rounded-xl border border-teal-100 bg-gradient-to-br from-white to-teal-50/40 p-5 shadow-table">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-hospital-green ring-1 ring-teal-100">
              <CheckCircle2 size={14} />
              默认主流程
            </div>
            <h3 className="mt-3 text-xl font-semibold text-slate-950">排班向导</h3>
            <p className="mt-1 text-sm text-slate-600">
              从导入人员到生成预览、网页修改和导出报告，按这 6 步走即可完成一次排班。
            </p>
          </div>
          <div className="text-sm text-slate-600">
              当前模式：<span className="font-medium text-slate-900">{TASK_SCHEDULE_MODE_LABELS[taskScheduleMode]}</span>
              <span className="mx-2 text-slate-300">/</span>
              <span className="font-medium text-slate-900">{PERIOD_TYPE_LABELS[currentTask.periodType] ?? "日期范围"} · {rangeDays} 天</span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {steps.map((step) => (
            <div key={step.number} className={`rounded-lg border p-4 ${stepClass(step.status)}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-semibold ring-1 ring-current/20">
                    {step.number}
                  </span>
                  <div className="font-semibold">{step.title}</div>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] ring-1 ring-current/10">{statusLabel(step.status)}</span>
              </div>
              <p className="mt-3 min-h-10 text-sm leading-6 text-slate-600">{step.desc}</p>
              <div className="mt-4">{step.action}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderDoctorBadge(assignment: ApiAssignment) {
    return (
      <span
        key={assignment.id}
        className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 shadow-sm"
      >
        <span className="truncate font-medium">{assignment.doctor.name}</span>
        <span className={`rounded border px-1 text-[11px] ${doctorTypeBadge(assignment.doctor.doctorType)}`}>
          {DOCTOR_TYPE_LABEL[assignment.doctor.doctorType]}
        </span>
      </span>
    );
  }

  function renderStaticCell(dateKey: string, timeSlot: TimeSlot, roomNumber: number, required: number) {
    const assignments = assignmentsFor(dateKey, timeSlot, roomNumber);
    const missing = Math.max(0, required - assignments.length);
    return (
      <div className="min-h-16 space-y-1">
        {assignments.map((assignment) => renderDoctorBadge(assignment))}
        {missing > 0 ? (
          <span className="inline-flex rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
            缺 {missing} 人
          </span>
        ) : null}
      </div>
    );
  }

  function renderManualCell(dateKey: string, weekday: number, timeSlot: TimeSlot, roomNumber: number, required: number) {
    const assignments = assignmentsFor(dateKey, timeSlot, roomNumber);
    const missing = Math.max(0, required - assignments.length);
    return (
      <div className="min-w-44 space-y-2">
        {assignments.map((assignment) => {
          const candidates = availableDoctors(dateKey, timeSlot, assignment.id, assignment.doctorId);
          return (
            <select
              key={assignment.id}
              value={assignment.doctorId}
              disabled={busy === "manual"}
              onChange={(event) => {
                if (event.target.value !== assignment.doctorId) void manualAdjust({ assignmentId: assignment.id, doctorId: event.target.value });
              }}
              className="focus-ring w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
            >
              {candidates.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctorLabel(doctor)}
                </option>
              ))}
            </select>
          );
        })}
        {Array.from({ length: missing }).map((_, index) => {
          const candidates = availableDoctors(dateKey, timeSlot);
          return (
            <select
              key={`${dateKey}:${timeSlot}:${roomNumber}:${index}`}
              value=""
              disabled={busy === "manual" || candidates.length === 0}
              onChange={(event) => {
                if (event.target.value) {
                  void manualAdjust({ doctorId: event.target.value, date: dateKey, weekday, roomNumber, timeSlot });
                }
              }}
              className="focus-ring w-full rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800 disabled:text-slate-400"
            >
              <option value="">{candidates.length ? "补排人员" : "无可用人员"}</option>
              {candidates.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctorLabel(doctor)}
                </option>
              ))}
            </select>
          );
        })}
      </div>
    );
  }

  function setShiftRequirement(dateKey: string, shiftTypeId: string, value: number) {
    const count = Math.max(0, Math.min(50, Math.floor(Number.isFinite(value) ? value : 0)));
    setShiftRequirementDraft((previous) => ({
      ...previous,
      [dateKey]: {
        ...(previous[dateKey] ?? {}),
        [shiftTypeId]: count
      }
    }));
  }

  function fillShiftRequirements(target: "workday" | "weekend", value: number) {
    const count = Math.max(0, Math.min(50, Math.floor(Number.isFinite(value) ? value : 0)));
    setShiftRequirementDraft((previous) => {
      const next: ShiftRequirementDraft = { ...previous };
      for (const day of weekDays) {
        const isWeekendDay = day.weekday === 6 || day.weekday === 7;
        if ((target === "weekend" && !isWeekendDay) || (target === "workday" && isWeekendDay)) continue;
        next[day.dateKey] = { ...(next[day.dateKey] ?? {}) };
        for (const shiftType of activeShiftTypes) {
          next[day.dateKey][shiftType.id] = count;
        }
      }
      return next;
    });
  }

  function copyPreviousShiftDay(dateKey: string) {
    const index = weekDays.findIndex((day) => day.dateKey === dateKey);
    if (index <= 0) return;
    const previousDateKey = weekDays[index - 1].dateKey;
    setShiftRequirementDraft((previous) => ({
      ...previous,
      [dateKey]: { ...(previous[previousDateKey] ?? {}) }
    }));
  }

  function setWeeklyTemplateCount(weekday: number, shiftTypeId: string, value: number) {
    const count = Math.max(0, Math.min(50, Math.floor(Number.isFinite(value) ? value : 0)));
    setWeeklyTemplateDraft((previous) => ({
      ...previous,
      [weekday]: {
        ...(previous[weekday] ?? {}),
        [shiftTypeId]: count
      }
    }));
  }

  function fillWeeklyTemplate(target: "workday" | "weekend", shiftKind: "day" | "night", count: number) {
    setWeeklyTemplateDraft((previous) => {
      const next: WeeklyTemplateDraft = { ...previous };
      for (const weekday of WEEKDAY_ROWS) {
        const isWeekendDay = weekday === 6 || weekday === 7;
        if ((target === "workday" && isWeekendDay) || (target === "weekend" && !isWeekendDay)) continue;
        next[weekday] = { ...(next[weekday] ?? {}) };
        for (const shiftType of wardShiftTypes) {
          if (shiftKind === "day" && !isDayShiftType(shiftType)) continue;
          if (shiftKind === "night" && !isNightShiftType(shiftType)) continue;
          next[weekday][shiftType.id] = count;
        }
      }
      return next;
    });
  }

  function ensureOverrideDraft(dateKey: string) {
    const day = weekDays.find((item) => item.dateKey === dateKey);
    const counts: Record<string, number> = {};
    for (const shiftType of wardShiftTypes) {
      counts[shiftType.id] = weeklyTemplateDraft[day?.weekday ?? 1]?.[shiftType.id] ?? defaultWeeklyCount(day?.weekday ?? 1, shiftType);
    }
    const current = dateOverrideDraft[dateKey];
    return {
      overrideEnabled: current?.overrideEnabled ?? false,
      dateType: current?.dateType ?? "",
      note: current?.note ?? "",
      counts: current?.counts ?? counts
    };
  }

  function updateDateOverride(dateKey: string, patch: Partial<DateOverrideDraft[string]>) {
    setDateOverrideDraft((previous) => {
      const current = ensureOverrideDraft(dateKey);
      return {
        ...previous,
        [dateKey]: {
          ...current,
          ...patch,
          counts: patch.counts ?? current.counts
        }
      };
    });
  }

  function setDateOverrideCount(dateKey: string, shiftTypeId: string, value: number) {
    const count = Math.max(0, Math.min(50, Math.floor(Number.isFinite(value) ? value : 0)));
    setDateOverrideDraft((previous) => {
      const current = ensureOverrideDraft(dateKey);
      return {
        ...previous,
        [dateKey]: {
          ...current,
          counts: {
            ...current.counts,
            [shiftTypeId]: count
          }
        }
      };
    });
  }

  function renderWardShiftRequirementControls() {
    const selectedDay = selectedOverrideDate ? weekDays.find((day) => day.dateKey === selectedOverrideDate) : undefined;
    const selectedOverride = selectedOverrideDate ? ensureOverrideDraft(selectedOverrideDate) : null;
    const displayedDays = activeRulesMonth ? weekDays.filter((day) => day.monthKey === activeRulesMonth) : visibleWeekDays;

    return (
      <div className="space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">病房白班/夜班规则</h3>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              先按一周模板设置每天白班、夜班所需人数，系统会自动套用到整个排班周期。遇到节假日、调休或科室特殊安排，可在特殊日期日历中单独调整。
            </p>
          </div>
          <button
            onClick={() => void saveRequirements()}
            disabled={busy === "save-requirements" || wardShiftTypes.length === 0}
            className="focus-ring inline-flex w-fit items-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:bg-slate-300"
          >
            <Save size={16} />
            {busy === "save-requirements" ? "正在保存..." : "保存规则"}
          </button>
        </div>

        {wardShiftTypes.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            暂无启用班次。请先到“班次身份要求”新增白班、夜班等班次。
          </div>
        ) : null}

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h4 className="font-semibold text-slate-950">一周模板</h4>
              <p className="mt-1 text-xs text-slate-500">只维护 7 行，系统会按周期自动展开。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => fillWeeklyTemplate("workday", "day", 1)} className="focus-ring rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">工作日白班填 1</button>
              <button type="button" onClick={() => fillWeeklyTemplate("workday", "night", 1)} className="focus-ring rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">工作日夜班填 1</button>
              <button type="button" onClick={() => fillWeeklyTemplate("weekend", "day", 1)} className="focus-ring rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">周末白班填 1</button>
              <button type="button" onClick={() => fillWeeklyTemplate("weekend", "night", 1)} className="focus-ring rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">周末夜班填 1</button>
              <button
                type="button"
                onClick={() => {
                  const next: WeeklyTemplateDraft = {};
                  for (const weekday of WEEKDAY_ROWS) {
                    next[weekday] = {};
                    for (const shiftType of wardShiftTypes) next[weekday][shiftType.id] = 0;
                  }
                  setWeeklyTemplateDraft(next);
                }}
                className="focus-ring rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                全部清空
              </button>
              <button
                type="button"
                onClick={() => {
                  const monday = weeklyTemplateDraft[1] ?? {};
                  setWeeklyTemplateDraft((previous) => {
                    const next = { ...previous };
                    for (const weekday of [1, 2, 3, 4, 5]) next[weekday] = { ...monday };
                    return next;
                  });
                }}
                className="focus-ring rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                复制周一到工作日
              </button>
              <button
                type="button"
                onClick={() => setWeeklyTemplateDraft((previous) => ({ ...previous, 7: { ...(previous[6] ?? {}) } }))}
                className="focus-ring rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                复制周六到周日
              </button>
            </div>
          </div>
          <div className="table-scroll">
            <table className="min-w-[560px] w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-3 font-medium">星期</th>
                  {wardShiftTypes.map((shiftType) => (
                    <th key={shiftType.id} className="border-b border-slate-200 px-3 py-3 font-medium">
                      {shiftType.name}
                      {isNightShiftType(shiftType) ? <span className="ml-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">夜班</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WEEKDAY_ROWS.map((weekday) => (
                  <tr key={weekday}>
                    <td className="border-b border-slate-100 px-3 py-3 font-medium text-slate-900">{getWeekdayLabel(weekday)}</td>
                    {wardShiftTypes.map((shiftType) => (
                      <td key={shiftType.id} className="border-b border-slate-100 px-3 py-3">
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={weeklyTemplateDraft[weekday]?.[shiftType.id] ?? 0}
                          onChange={(event) => setWeeklyTemplateCount(weekday, shiftType.id, Number(event.target.value))}
                          className="focus-ring w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-table">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h4 className="font-semibold text-slate-950">特殊日期调整</h4>
              <p className="mt-1 text-xs text-slate-500">点击日期卡片，单独设置节假日、调休或覆盖当日白班/夜班人数。</p>
            </div>
            {ruleMonthOptions.length > 1 ? (
              <select value={activeRulesMonth} onChange={(event) => setActiveRulesMonth(event.target.value)} className="focus-ring w-fit rounded-md border border-slate-300 px-3 py-2 text-sm">
                {ruleMonthOptions.map((month) => <option key={month} value={month}>{month}</option>)}
              </select>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border border-slate-200 bg-white" />普通工作日</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border border-sky-100 bg-sky-50" />周末</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border border-red-100 bg-red-50" />法定节假日</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border border-orange-100 bg-orange-50" />调休上班日</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border border-purple-100 bg-purple-50" />自定义休息日</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border border-yellow-100 bg-yellow-50" />自定义特殊日</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
            {displayedDays.map((day) => {
              const override = dateOverrideDraft[day.dateKey];
              const counts = override?.overrideEnabled ? override.counts : weeklyTemplateDraft[day.weekday] ?? {};
              return (
                <button
                  type="button"
                  key={day.dateKey}
                  onClick={() => setSelectedOverrideDate(day.dateKey)}
                  className={`focus-ring min-h-36 rounded-lg border p-3 text-left shadow-sm ${dateCardClass(day.weekday, override?.dateType)} ${selectedOverrideDate === day.dateKey ? "ring-2 ring-hospital-green" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-950">{day.dateKey.slice(5)}</div>
                      <div className="text-xs text-slate-500">{day.label}</div>
                    </div>
                    {override?.overrideEnabled ? <span className="rounded-full bg-hospital-green px-2 py-0.5 text-[11px] text-white">已覆盖</span> : null}
                  </div>
                  {override?.dateType ? <div className="mt-2 inline-flex rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-slate-700">{specialDateLabels[override.dateType] ?? override.dateType}</div> : null}
                  <div className="mt-3 space-y-1 text-xs text-slate-700">
                    {wardShiftTypes.map((shiftType) => (
                      <div key={shiftType.id} className="flex justify-between gap-2">
                        <span>{shiftType.name}</span>
                        <span className="font-medium">{counts[shiftType.id] ?? 0} 人</span>
                      </div>
                    ))}
                  </div>
                  {override?.note ? <div className="mt-2 line-clamp-2 text-xs text-slate-500">{override.note}</div> : null}
                </button>
              );
            })}
          </div>

          {selectedDay && selectedOverride ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h5 className="font-semibold text-slate-950">{selectedDay.dateKey} {selectedDay.label}</h5>
                <button type="button" onClick={() => setSelectedOverrideDate("")} className="w-fit text-xs font-medium text-slate-500 hover:text-slate-900">关闭</button>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">日期类型</span>
                  <select
                    value={selectedOverride.dateType}
                    onChange={(event) => updateDateOverride(selectedDay.dateKey, { dateType: event.target.value })}
                    className="focus-ring mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {SPECIAL_DATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 self-end rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedOverride.overrideEnabled}
                    onChange={(event) => updateDateOverride(selectedDay.dateKey, { overrideEnabled: event.target.checked })}
                  />
                  覆盖一周模板，使用下方人数
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {wardShiftTypes.map((shiftType) => (
                  <label key={shiftType.id} className="block">
                    <span className="text-xs font-medium text-slate-600">{shiftType.name}人数</span>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      disabled={!selectedOverride.overrideEnabled}
                      value={selectedOverride.counts[shiftType.id] ?? 0}
                      onChange={(event) => setDateOverrideCount(selectedDay.dateKey, shiftType.id, Number(event.target.value))}
                      className="focus-ring mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                    />
                  </label>
                ))}
              </div>
              <label className="mt-3 block">
                <span className="text-xs font-medium text-slate-600">备注</span>
                <input
                  value={selectedOverride.note}
                  onChange={(event) => updateDateOverride(selectedDay.dateKey, { note: event.target.value })}
                  className="focus-ring mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  placeholder="例如节假日、调休、科室临时安排"
                />
              </label>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  function renderShiftRequirementControls() {
    const isCustom = taskScheduleMode === TASK_SCHEDULE_MODE.CUSTOM;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">{isCustom ? "自定义排班规则" : "病房白班/夜班规则"}</h3>
            <p className="text-sm text-slate-600">按班次设置每天所需人数，例如白班、夜班、一线班、二线班等。班次资格要求请到“班次身份要求”中维护。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fillShiftRequirements("workday", 1)} className="focus-ring rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              工作日填 1
            </button>
            <button type="button" onClick={() => fillShiftRequirements("weekend", 1)} className="focus-ring rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              周末填 1
            </button>
            <button
              onClick={() => setShiftRequirementDraft(buildShiftRequirementDraft(currentTask, activeShiftTypes.map((item) => ({ ...item, active: true }))))}
              className="focus-ring rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              恢复当前
            </button>
            <button
              onClick={() => {
                const next: ShiftRequirementDraft = {};
                for (const day of weekDays) {
                  next[day.dateKey] = {};
                  for (const shiftType of activeShiftTypes) next[day.dateKey][shiftType.id] = 0;
                }
                setShiftRequirementDraft(next);
              }}
              className="focus-ring rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              清空规则
            </button>
            <button
              onClick={() => void saveRequirements()}
              disabled={busy === "save-requirements" || activeShiftTypes.length === 0}
              className="focus-ring inline-flex items-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:bg-slate-300"
            >
              <Save size={16} />
              {busy === "save-requirements" ? "正在保存..." : "保存规则"}
            </button>
          </div>
        </div>

        {activeShiftTypes.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            暂无启用班次。请先到“班次身份要求”新增白班、夜班、一线班等班次。
          </div>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
          <div className="table-scroll">
            <table className="min-w-[860px] w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-3 font-medium">星期</th>
                  <th className="border-b border-slate-200 px-3 py-3 font-medium">日期</th>
                  {activeShiftTypes.map((shiftType) => (
                    <th key={shiftType.id} className="border-b border-slate-200 px-3 py-3 font-medium">
                      {shiftType.name}
                      {shiftType.isNight ? <span className="ml-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">夜班</span> : null}
                    </th>
                  ))}
                  <th className="border-b border-slate-200 px-3 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleWeekDays.map((day) => (
                  <tr key={day.dateKey}>
                    <td className="border-b border-slate-100 px-3 py-3 font-medium text-slate-900">{day.label}</td>
                    <td className="border-b border-slate-100 px-3 py-3 text-slate-600">{day.dateKey}</td>
                    {activeShiftTypes.map((shiftType) => (
                      <td key={shiftType.id} className="border-b border-slate-100 px-3 py-3">
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={shiftRequirementDraft[day.dateKey]?.[shiftType.id] ?? 0}
                          onChange={(event) => setShiftRequirement(day.dateKey, shiftType.id, Number(event.target.value))}
                          className="focus-ring w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </td>
                    ))}
                    <td className="border-b border-slate-100 px-3 py-3">
                      <button type="button" onClick={() => copyPreviousShiftDay(day.dateKey)} disabled={weekDays[0]?.dateKey === day.dateKey} className="focus-ring rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                        复制上一日
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  function renderRequirementControls() {
    if (taskScheduleMode === TASK_SCHEDULE_MODE.WARD_SHIFT) {
      return renderWardShiftRequirementControls();
    }
    if (taskScheduleMode === TASK_SCHEDULE_MODE.CUSTOM) {
      return renderShiftRequirementControls();
    }

    const renderSlotControls = (dateKey: string, slotName: keyof RequirementDayDraft, label?: string) => {
      const value = requirementDraft[dateKey]?.[slotName] ?? createClosedSlot();
      return (
        <div className="grid min-w-[26rem] grid-cols-[auto_1fr_1fr_1.4fr] items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={value.enabled}
              onChange={(event) => updateRequirementSlot(dateKey, slotName, { enabled: event.target.checked, rooms: event.target.checked ? Math.max(1, value.rooms) : 0 })}
            />
            {label ?? "开放"}
          </label>
          <input
            type="number"
            min={0}
            max={20}
            value={value.enabled ? value.rooms : 0}
            onChange={(event) => {
              const rooms = clampRoomCount(Number(event.target.value));
              updateRequirementSlot(dateKey, slotName, { rooms, enabled: rooms > 0 });
            }}
            className="focus-ring w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <input
            type="number"
            min={1}
            max={5}
            value={value.requiredDoctors}
            disabled={!value.enabled}
            onChange={(event) => updateRequirementSlot(dateKey, slotName, { requiredDoctors: clampRequiredDoctors(Number(event.target.value)) })}
            className="focus-ring w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
          />
          <select
            value={value.shiftTypeId ?? ""}
            disabled={!value.enabled}
            onChange={(event) => updateRequirementSlot(dateKey, slotName, { shiftTypeId: event.target.value })}
            className="focus-ring w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
          >
            <option value="">未绑定班次</option>
            {shiftTypes.map((shiftType) => (
              <option key={shiftType.id} value={shiftType.id}>
                {shiftType.name}
              </option>
            ))}
          </select>
        </div>
      );
    };

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">排班规则设置</h3>
            <p className="text-sm text-slate-600">医技科室按房间/检查室/窗口排班：单元数量 0-20；每单元人数 1-5。保存规则会清空旧排班结果。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                const next: RequirementDraft = {};
                for (const day of weekDays) {
                  next[day.dateKey] = { fullDay: createClosedSlot(), morning: createClosedSlot(), afternoon: createClosedSlot() };
                }
                setRequirementDraft(next);
              }}
              className="focus-ring rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              清空全部规则
            </button>
            <button
              onClick={() => void saveRequirements()}
              disabled={busy === "save-requirements"}
              className="focus-ring inline-flex items-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:bg-slate-300"
            >
              <Save size={16} />
              {busy === "save-requirements" ? "正在保存..." : "保存规则"}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
          <div className="table-scroll">
            <table className="min-w-[900px] w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-3 font-medium">星期</th>
                  <th className="border-b border-slate-200 px-3 py-3 font-medium">日期</th>
                  {currentTask.mode === "FULL_DAY" ? (
                    <>
                      <th className="border-b border-slate-200 px-3 py-3 font-medium">是否开放 / 单元数 / 每单元人数</th>
                    </>
                  ) : (
                    <>
                      <th className="border-b border-slate-200 px-3 py-3 font-medium">上午</th>
                      <th className="border-b border-slate-200 px-3 py-3 font-medium">下午</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {visibleWeekDays.map((day) => (
                  <tr key={day.dateKey}>
                    <td className="border-b border-slate-100 px-3 py-3 font-medium text-slate-900">{day.label}</td>
                    <td className="border-b border-slate-100 px-3 py-3 text-slate-600">{day.dateKey}</td>
                    {currentTask.mode === "FULL_DAY" ? (
                      <td className="border-b border-slate-100 px-3 py-3">{renderSlotControls(day.dateKey, "fullDay")}</td>
                    ) : (
                      <>
                        <td className="border-b border-slate-100 px-3 py-3">{renderSlotControls(day.dateKey, "morning", "上午开放")}</td>
                        <td className="border-b border-slate-100 px-3 py-3">{renderSlotControls(day.dateKey, "afternoon", "下午开放")}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  function renderRoomTable(interactive = false) {
    const rows = weekDays.flatMap((day) =>
      slotsForMode.map((timeSlot) => ({
        day,
        timeSlot,
        requirements: requirementCells.filter((cell) => cell.dateKey === day.dateKey && cell.timeSlot === timeSlot)
      }))
    );

    return (
      <div className="space-y-3">
        {rows.map(({ day, timeSlot, requirements }) => {
          const title = currentTask.mode === "HALF_DAY" ? `${day.dateKey} ${day.label} ${SLOT_LABELS[timeSlot]}` : `${day.dateKey} ${day.label}`;
          if (requirements.length === 0) {
            return (
              <div key={`${day.dateKey}:${timeSlot}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-table">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-slate-900">{title}</div>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500">未开放</span>
                </div>
              </div>
            );
          }
          return (
            <div key={`${day.dateKey}:${timeSlot}`} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-900">{title}</div>
              <div className="table-scroll">
                <table className="w-full min-w-[680px] border-collapse text-sm">
                  <thead className="bg-white text-left text-slate-600">
                    <tr>
                      {requirements.map((requirement) => (
                        <th key={requirement.roomNumber} className="border-b border-slate-200 px-3 py-3 font-medium">
                          单元{requirement.roomNumber}
                          <span className="ml-1 text-xs font-normal text-slate-400">/{requirement.requiredDoctors}人</span>
                          {requirement.shiftType ? <div className="mt-1 text-xs font-normal text-hospital-green">{requirement.shiftType.name}</div> : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="align-top">
                      {requirements.map((requirement) => (
                        <td key={requirement.roomNumber} className="border-b border-slate-100 px-3 py-3">
                          {interactive
                            ? renderManualCell(day.dateKey, day.weekday, timeSlot, requirement.roomNumber, requirement.requiredDoctors)
                            : renderStaticCell(day.dateKey, timeSlot, requirement.roomNumber, requirement.requiredDoctors)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function shiftLabelForRequirement(requirement?: { shiftType?: { name?: string | null } | null; shiftTypeId?: string | null } | null) {
    return requirement?.shiftType?.name ?? (requirement?.shiftTypeId ? "未命名班次" : "班次");
  }

  function renderShiftTable(interactive = false) {
    const configuredShiftTypes = activeShiftTypes.filter((shiftType) =>
      requirementCells.some((cell) => cell.shiftTypeId === shiftType.id)
    );
    const columns = configuredShiftTypes.length ? configuredShiftTypes : activeShiftTypes;

    if (!columns.length) {
      return <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">暂无班次规则，请先在规则页设置每天所需人数。</div>;
    }

    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
        <div className="table-scroll">
          <table className="min-w-[860px] w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">日期</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">星期</th>
                {columns.map((shiftType) => {
                  const sample = requirementCells.find((cell) => cell.shiftTypeId === shiftType.id);
                  return (
                    <th key={shiftType.id} className="border-b border-slate-200 px-3 py-3 font-medium">
                      {shiftType.name}
                      {sample ? <span className="ml-1 text-xs font-normal text-slate-400">/需{sample.requiredDoctors}人</span> : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleWeekDays.map((day) => (
                <tr key={day.dateKey} className="align-top">
                  <td className="border-b border-slate-100 px-3 py-3 font-medium text-slate-900">{day.dateKey}</td>
                  <td className="border-b border-slate-100 px-3 py-3 text-slate-600">{day.label}</td>
                  {columns.map((shiftType) => {
                    const requirement = requirementCells.find((cell) => cell.dateKey === day.dateKey && cell.shiftTypeId === shiftType.id);
                    return (
                      <td key={shiftType.id} className="border-b border-slate-100 px-3 py-3">
                        {requirement ? (
                          interactive
                            ? renderManualCell(day.dateKey, day.weekday, TIME_SLOT.FULL_DAY, requirement.roomNumber, requirement.requiredDoctors)
                            : renderStaticCell(day.dateKey, TIME_SLOT.FULL_DAY, requirement.roomNumber, requirement.requiredDoctors)
                        ) : (
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500">未设置</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderScheduleGrid(interactive = false) {
    return taskScheduleMode === TASK_SCHEDULE_MODE.MEDTECH_ROOM ? renderRoomTable(interactive) : renderShiftTable(interactive);
  }

  function requirementForAssignmentSummary(assignment: { date: string; timeSlot: TimeSlot; roomNumber: number }) {
    return requirementCells.find(
      (cell) => cell.dateKey === assignment.date && cell.timeSlot === assignment.timeSlot && cell.roomNumber === assignment.roomNumber
    );
  }

  function assignmentPlaceLabel(assignment: { date: string; timeSlot: TimeSlot; roomNumber: number }) {
    if (taskScheduleMode === TASK_SCHEDULE_MODE.MEDTECH_ROOM) return `单元${assignment.roomNumber}`;
    return shiftLabelForRequirement(requirementForAssignmentSummary(assignment));
  }

  function renderStatsOverview() {
    const items = [
      ["应排班次数", stats.overall.expectedAssignments],
      ["实际已排班", stats.overall.actualAssignments],
      ["未排满班次", stats.overall.unfilledAssignments],
      ["平均每人班次", stats.overall.averageAssignments]
    ];
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-table">
            <dt className="text-sm text-slate-500">{label}</dt>
            <dd className="mt-2 text-2xl font-semibold text-slate-950">{value}</dd>
          </div>
        ))}
      </div>
    );
  }

  function renderWarnings() {
    if (!stats.warnings.length) {
      return <div className="rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-hospital-green">当前统计未发现明显风险。</div>;
    }
    return (
      <div className="space-y-2">
        {stats.warnings.map((warning) => (
          <div key={warning} className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {warning}
          </div>
        ))}
      </div>
    );
  }

  function renderIdentityGroupStats() {
    if (!stats.identityGroups?.length) {
      return <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">暂无身份/资格分组统计。未绑定资格的人不会参与对应班次公平比较。</div>;
    }
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="font-semibold text-slate-950">身份/资格分组公平统计</h3>
          <p className="mt-1 text-xs text-slate-500">不具备某班次资格的人，不参与该班次公平比较。</p>
        </div>
        <div className="table-scroll">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">身份/资格</th>
                <th className="px-3 py-2 font-medium">人数</th>
                <th className="px-3 py-2 font-medium">总班次</th>
                <th className="px-3 py-2 font-medium">夜班</th>
                <th className="px-3 py-2 font-medium">二线班</th>
              </tr>
            </thead>
            <tbody>
              {stats.identityGroups.map((group) => (
                <tr key={group.tagName}>
                  <td className="border-t border-slate-100 px-3 py-2 font-medium text-slate-900">{group.tagName}</td>
                  <td className="border-t border-slate-100 px-3 py-2">{group.memberCount}</td>
                  <td className="border-t border-slate-100 px-3 py-2">{group.totalAssignments}</td>
                  <td className="border-t border-slate-100 px-3 py-2">{group.nightAssignments}</td>
                  <td className="border-t border-slate-100 px-3 py-2">{group.secondLineAssignments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderConflictReport() {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="font-semibold text-slate-900">冲突报告</h3>
          <span className={currentTask.conflicts.length ? "text-sm font-medium text-hospital-red" : "text-sm text-hospital-green"}>
            {currentTask.conflicts.length ? `${currentTask.conflicts.length} 条` : "无冲突"}
          </span>
        </div>
        {currentTask.conflicts.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-600">暂无未排满需求或不可用冲突。</div>
        ) : (
          <div className="table-scroll">
            <table className="min-w-[860px] w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-3 font-medium">日期</th>
                  <th className="border-b border-slate-200 px-3 py-3 font-medium">星期</th>
                  <th className="border-b border-slate-200 px-3 py-3 font-medium">时段</th>
                  <th className="border-b border-slate-200 px-3 py-3 font-medium">{taskScheduleMode === TASK_SCHEDULE_MODE.MEDTECH_ROOM ? "单元" : "班次"}</th>
                  <th className="border-b border-slate-200 px-3 py-3 font-medium">缺少人数</th>
                  <th className="border-b border-slate-200 px-3 py-3 font-medium">类型</th>
                  <th className="border-b border-slate-200 px-3 py-3 font-medium">说明</th>
                </tr>
              </thead>
              <tbody>
                {currentTask.conflicts.map((conflict) => (
                  <tr key={conflict.id}>
                    <td className="border-b border-slate-100 px-3 py-3">{toDateKey(conflict.date)}</td>
                    <td className="border-b border-slate-100 px-3 py-3">{getWeekdayLabel(conflict.weekday)}</td>
                    <td className="border-b border-slate-100 px-3 py-3">{SLOT_LABELS[conflict.timeSlot]}</td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      {taskScheduleMode === TASK_SCHEDULE_MODE.MEDTECH_ROOM
                        ? `单元${conflict.roomNumber}`
                        : shiftLabelForRequirement(requirementCells.find((cell) => cell.dateKey === toDateKey(conflict.date) && cell.timeSlot === conflict.timeSlot && cell.roomNumber === conflict.roomNumber))}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">{conflict.missingCount ?? 0}</td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      <span className={`rounded border px-2 py-1 text-xs ${severityClass(conflict.severity)}`}>{conflict.conflictType}</span>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3 text-slate-700">{conflict.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderDoctorView() {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
        <div className="table-scroll">
          <table className="min-w-[1500px] w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">人员</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">总班次</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">总工作量</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">白班</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">夜班</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">下夜班</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">周末白班</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">周末夜班</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">节假日白班</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">节假日夜班</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">黄金夜班</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">高负担夜班</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">偏好</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">偏好满足情况</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">连续</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">安排明细</th>
              </tr>
            </thead>
            <tbody>
              {stats.perDoctor.map((doctor) => (
                <tr key={doctor.doctorId} className="align-top">
                  <td className="border-b border-slate-100 px-3 py-3">
                    <div className="font-medium text-slate-900">{doctor.name}</div>
                    <span className={`mt-1 inline-flex rounded border px-1.5 py-0.5 text-xs ${doctorTypeBadge(doctor.doctorType)}`}>
                      {DOCTOR_TYPE_LABEL[doctor.doctorType]}
                    </span>
                    {doctor.tagNames?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {doctor.tagNames.map((tagName) => (
                          <span key={tagName} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{tagName}</span>
                        ))}
                      </div>
                    ) : null}
                    {doctor.eligibilitySummary ? <div className="mt-1 max-w-xs text-xs text-slate-500">{doctor.eligibilitySummary}</div> : null}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3 font-semibold">{doctor.totalAssignments}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{doctor.workloadTotal ?? 0}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{doctor.dayShiftAssignments ?? 0}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{doctor.nightShiftAssignments ?? 0}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{doctor.postNightAssignments ?? 0}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{doctor.weekendDayAssignments ?? 0}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{doctor.weekendNightAssignments ?? 0}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{doctor.holidayDayAssignments ?? 0}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{doctor.holidayNightAssignments ?? 0}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{doctor.goldenNightAssignments ?? 0}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{doctor.highBurdenNightAssignments ?? 0}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{doctor.preferenceLabel ?? "无偏好"}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{doctor.preferenceSatisfaction ?? "无偏好"}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{doctor.maxConsecutiveDays} 天</td>
                  <td className="border-b border-slate-100 px-3 py-3">
                    {doctor.assignments.length ? (
                      <div className="flex flex-wrap gap-1">
                        {doctor.assignments.map((assignment) => (
                          <span key={assignment.id} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                            {assignment.date}
                            {assignment.weekdayLabel}
                            {taskScheduleMode === TASK_SCHEDULE_MODE.MEDTECH_ROOM ? `${assignment.timeSlotLabel} ${assignmentPlaceLabel(assignment)}` : assignmentPlaceLabel(assignment)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400">未安排</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowLeft size={16} />
            返回任务列表
          </Link>
          <h2 className="mt-3 text-2xl font-semibold text-slate-950">
            {toDateKey(getTaskStartDate(task))} 至 {toDateKey(getTaskEndDate(task))}
          </h2>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">{task.name || "排班任务"}</span>
            <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">{PERIOD_TYPE_LABELS[task.periodType] ?? "7 天"} · {getDateRangeDayCount(getTaskStartDate(task), getTaskEndDate(task))} 天</span>
            <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">{TASK_SCHEDULE_MODE_LABELS[taskScheduleMode]}</span>
            <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">{taskScheduleMode === TASK_SCHEDULE_MODE.MEDTECH_ROOM ? MODE_LABELS[task.mode] : "按班次"}</span>
            <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">{STATUS_LABELS[task.status]}</span>
            <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">{task.doctors.length} 名人员</span>
            <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">{task.requirements.length} 条规则</span>
          </div>
        </div>
        <button onClick={() => void loadTask()} className="focus-ring inline-flex w-fit items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <RefreshCw size={16} />
          刷新
        </button>
        <Link href={`/tasks/${task.id}/precheck`} className="focus-ring inline-flex w-fit items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          排班前检查
        </Link>
        <Link href={`/tasks/${task.id}/preview`} className="focus-ring inline-flex w-fit items-center gap-2 rounded-md bg-hospital-green px-3 py-2 text-sm font-medium text-white hover:bg-teal-800">
          预览与编辑
        </Link>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-hospital-green">{notice}</div> : null}

      {renderWizard()}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-table">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-slate-950">高级设置</h3>
            <p className="mt-1 text-sm text-slate-500">需要细调规则、不可排班、手动调整或导出时再展开。</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdvanced((value) => !value)}
            className="focus-ring inline-flex w-fit items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Settings2 size={16} />
            {showAdvanced ? "收起高级设置" : "展开高级设置"}
          </button>
        </div>
      </div>

      {showAdvanced ? (
        <>
          <nav className="flex gap-2 overflow-x-auto border-b border-slate-200">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={
                  activeTab === id
                    ? "inline-flex shrink-0 items-center gap-2 border-b-2 border-hospital-green px-3 py-3 text-sm font-medium text-hospital-green"
                    : "inline-flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-3 text-sm font-medium text-slate-600 hover:text-slate-900"
                }
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
            <Link
              href={`/tasks/${task.id}/preview`}
              className="inline-flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-3 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              预览与编辑
            </Link>
          </nav>

          {ruleMonthOptions.length > 2 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-table">
              <span className="text-sm font-medium text-slate-700">按月查看规则/不可排</span>
              <select
                value={activeRulesMonth}
                onChange={(event) => setActiveRulesMonth(event.target.value)}
                className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {ruleMonthOptions.map((month) => <option key={month} value={month}>{month}</option>)}
              </select>
              <span className="text-xs text-slate-500">批量填充仍作用于整个排班周期。</span>
            </div>
          ) : null}

          {activeTab === "requirements" ? renderRequirementControls() : null}

      {activeTab === "unavailable" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">不可排班设置</h3>
              <p className="text-sm text-slate-600">全天选中时，上午和下午均视为不可排。</p>
            </div>
            <button
              onClick={() => void saveUnavailable()}
              disabled={busy === "save-unavailable"}
              className="focus-ring inline-flex w-fit items-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:bg-slate-300"
            >
              <Save size={16} />
              {busy === "save-unavailable" ? "正在保存..." : "保存不可排班"}
            </button>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
            <div className="table-scroll">
              <table className="min-w-[1120px] w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-3 font-medium">人员</th>
                    {visibleWeekDays.map((day) => (
                      <th key={day.dateKey} className="border-b border-slate-200 px-3 py-3 font-medium">
                        <div>{day.label}</div>
                        <div className="text-xs font-normal text-slate-400">{day.dateKey}</div>
                      </th>
                    ))}
                    <th className="border-b border-slate-200 px-3 py-3 font-medium">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {task.doctors.map((doctor) => (
                    <tr key={doctor.id} className="align-top">
                      <td className="border-b border-slate-100 px-3 py-3">
                        <div className="font-medium text-slate-900">{doctor.name}</div>
                        <span className={`mt-1 inline-flex rounded border px-1.5 py-0.5 text-xs ${doctorTypeBadge(doctor.doctorType)}`}>{DOCTOR_TYPE_LABEL[doctor.doctorType]}</span>
                      </td>
                      {visibleWeekDays.map((day) => {
                        const value = unavailableDraft[doctor.id]?.[day.dateKey] ?? { morning: false, afternoon: false };
                        return (
                          <td key={day.dateKey} className="border-b border-slate-100 px-3 py-3">
                            <div className="grid grid-cols-3 gap-1">
                              {[
                                { slot: TIME_SLOT.MORNING as TimeSlot, label: "上", active: value.morning },
                                { slot: TIME_SLOT.AFTERNOON as TimeSlot, label: "下", active: value.afternoon },
                                { slot: TIME_SLOT.FULL_DAY as TimeSlot, label: "全", active: value.morning && value.afternoon }
                              ].map((item) => (
                                <button
                                  key={item.slot}
                                  type="button"
                                  onClick={() => toggleUnavailable(doctor.id, day.dateKey, item.slot)}
                                  className={
                                    item.active
                                      ? "focus-ring rounded-md border border-hospital-red bg-red-50 px-2 py-1 text-xs font-medium text-hospital-red"
                                      : "focus-ring rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                                  }
                                >
                                  {item.label}
                                </button>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                      <td className="border-b border-slate-100 px-3 py-3">
                        <input
                          value={noteDraft[doctor.id] ?? ""}
                          onChange={(event) => setNoteDraft((previous) => ({ ...previous, [doctor.id]: event.target.value }))}
                          placeholder="选填"
                          className="focus-ring w-36 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "generate" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">自动排班</h3>
              <p className="text-sm text-slate-600">生成时会覆盖未锁定排班；清空排班结果会清空锁定信息。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {hasScheduleResult ? (
                <button
                  onClick={() => void clearScheduleResult()}
                  disabled={busy === "delete-result"}
                  className="focus-ring inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  {busy === "delete-result" ? <Loader2 size={16} className="animate-spin" /> : null}
                  {busy === "delete-result" ? "清空中" : "清空排班结果"}
                </button>
              ) : null}
              <button
                onClick={() => void generateSchedule()}
                disabled={busy === "generate" || requirementCells.length === 0}
                className="focus-ring inline-flex w-fit items-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:bg-slate-300"
              >
                {busy === "generate" ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                {busy === "generate" ? "正在生成..." : task.assignments.length ? "重新生成" : "生成排班"}
              </button>
            </div>
          </div>
          {renderStatsOverview()}
          {renderWarnings()}
          {renderIdentityGroupStats()}
          {renderConflictReport()}
        </div>
      ) : null}

      {activeTab === "schedule" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-slate-950">排班表</h3>
            <div className="flex flex-wrap gap-2">
              {hasScheduleResult ? (
                <button
                  onClick={() => void clearScheduleResult()}
                  disabled={busy === "delete-result"}
                  className="focus-ring inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  {busy === "delete-result" ? <Loader2 size={16} className="animate-spin" /> : null}
                  {busy === "delete-result" ? "清空中" : "清空排班结果"}
                </button>
              ) : null}
              <div className="inline-flex rounded-md border border-slate-300 bg-white p-1">
                <button onClick={() => setScheduleView("room")} className={scheduleView === "room" ? "rounded px-3 py-1.5 text-sm font-medium text-hospital-green" : "rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"}>
                  {taskScheduleMode === TASK_SCHEDULE_MODE.MEDTECH_ROOM ? "单元视图" : "班次视图"}
                </button>
                <button onClick={() => setScheduleView("doctor")} className={scheduleView === "doctor" ? "rounded px-3 py-1.5 text-sm font-medium text-hospital-green" : "rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"}>
                  人员视图
                </button>
              </div>
            </div>
          </div>
          {renderStatsOverview()}
          {renderIdentityGroupStats()}
          {scheduleView === "room" ? renderScheduleGrid(false) : renderDoctorView()}
          {renderConflictReport()}
        </div>
      ) : null}

      {activeTab === "adjust" ? (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">手动调整</h3>
            <p className="text-sm text-slate-600">下拉框只列出该时间段可用且未重复占用的人员。</p>
          </div>
          {renderScheduleGrid(true)}
          {renderConflictReport()}
        </div>
      ) : null}

          {activeTab === "export" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-table">
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-teal-50 p-3 text-hospital-green">
                  <Download size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">导出 Excel</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    文件包含{taskScheduleMode === TASK_SCHEDULE_MODE.MEDTECH_ROOM ? "动态单元排班表" : "班次矩阵排班表"}、人员个人统计和冲突报告。
                  </p>
                  <button
                    type="button"
                    onClick={() => void exportExcel()}
                    disabled={busy === "export"}
                    className="focus-ring mt-4 inline-flex items-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {busy === "export" ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                    {busy === "export" ? "导出中" : "导出 Excel"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-table">
            <h4 className="font-semibold text-slate-900">导出概览</h4>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">人员人数</dt>
                <dd className="font-medium">{stats.overall.doctorCount}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">实际已排</dt>
                <dd className="font-medium">{stats.overall.actualAssignments}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">冲突数量</dt>
                <dd className="font-medium">{stats.overall.conflictCount}</dd>
              </div>
            </dl>
          </div>
        </div>
          ) : null}
        </>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-table">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <UsersRound size={16} />
            工作量范围
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-950">
            {stats.overall.minAssignments} 至 {stats.overall.maxAssignments} 次
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-table">
          <div className="text-sm text-slate-500">当前规则需求</div>
          <div className="mt-2 text-lg font-semibold text-slate-950">{stats.overall.expectedAssignments} 个人员班次</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-table">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <AlertTriangle size={16} />
            未排满
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-950">{stats.overall.unfilledAssignments} 个班次</div>
        </div>
      </div>
    </section>
  );
}
