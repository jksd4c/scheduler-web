"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CalendarX,
  Download,
  FileSpreadsheet,
  Pencil,
  RefreshCw,
  Save,
  Table2,
  UsersRound,
  Wand2
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getWeekDates, getWeekdayLabel, toDateKey } from "@/lib/date-utils";
import {
  MODE_LABELS,
  SLOT_LABELS,
  STATUS_LABELS,
  TIME_SLOT,
  buildDefaultRequirements,
  clampRequiredDoctors,
  clampRoomCount,
  getTimeSlotsForMode,
  requirementsToCells
} from "@/lib/schedule-rules";
import {
  DOCTOR_TYPE_LABEL,
  type ApiAssignment,
  type ApiDoctor,
  type ApiTaskDetail,
  type TimeSlot
} from "@/components/schedule-types";

type TabId = "requirements" | "unavailable" | "generate" | "schedule" | "adjust" | "export";
type ScheduleView = "room" | "doctor";
type BusyState = "load" | "save-requirements" | "save-unavailable" | "delete-result" | "generate" | "manual" | "";

type UnavailableDraft = Record<string, Record<string, { morning: boolean; afternoon: boolean }>>;
type RequirementSlotDraft = { enabled: boolean; rooms: number; requiredDoctors: number };
type RequirementDayDraft = {
  fullDay: RequirementSlotDraft;
  morning: RequirementSlotDraft;
  afternoon: RequirementSlotDraft;
};
type RequirementDraft = Record<string, RequirementDayDraft>;

const TABS: Array<{ id: TabId; label: string; Icon: LucideIcon }> = [
  { id: "requirements", label: "排班规则", Icon: Table2 },
  { id: "unavailable", label: "不可排班", Icon: CalendarX },
  { id: "generate", label: "自动排班", Icon: Wand2 },
  { id: "schedule", label: "排班表", Icon: Table2 },
  { id: "adjust", label: "手动调整", Icon: Pencil },
  { id: "export", label: "导出", Icon: FileSpreadsheet }
];

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
  return { enabled: false, rooms: 0, requiredDoctors: 1 };
}

function buildUnavailableDraft(task: ApiTaskDetail) {
  const draft: UnavailableDraft = {};
  const notes: Record<string, string> = {};
  for (const doctor of task.doctors) {
    draft[doctor.id] = {};
    for (const day of getWeekDates(task.weekStartDate)) {
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
  for (const day of getWeekDates(task.weekStartDate)) {
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
  }
  return draft;
}

function buildDefaultRequirementDraft(task: ApiTaskDetail): RequirementDraft {
  return buildRequirementDraft({
    ...task,
    requirements: buildDefaultRequirements(task.mode, task.weekStartDate).map((item, index) => ({
      id: `default-${index}`,
      scheduleTaskId: task.id,
      date: item.date.toISOString(),
      weekday: item.weekday,
      timeSlot: item.timeSlot,
      enabled: item.enabled,
      roomNumber: item.roomNumber,
      requiredDoctors: item.requiredDoctors,
      createdAt: "",
      updatedAt: ""
    }))
  });
}

function expandRequirementDraft(task: ApiTaskDetail, draft: RequirementDraft) {
  const records: Array<{
    date: string;
    weekday: number;
    timeSlot: TimeSlot;
    enabled: boolean;
    roomNumber: number;
    requiredDoctors: number;
  }> = [];
  for (const day of getWeekDates(task.weekStartDate)) {
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
          enabled: true,
          roomNumber,
          requiredDoctors
        });
      }
    }
  }
  return records;
}

function doctorLabel(doctor: ApiDoctor) {
  return `${doctor.name}（${DOCTOR_TYPE_LABEL[doctor.doctorType]}）`;
}

export function TaskDetailClient({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<ApiTaskDetail | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("requirements");
  const [scheduleView, setScheduleView] = useState<ScheduleView>("room");
  const [busy, setBusy] = useState<BusyState>("load");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requirementDraft, setRequirementDraft] = useState<RequirementDraft>({});
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
    if (!task) return;
    setRequirementDraft(buildRequirementDraft(task));
    const { draft, notes } = buildUnavailableDraft(task);
    setUnavailableDraft(draft);
    setNoteDraft(notes);
  }, [task]);

  const weekDays = useMemo(() => (task ? getWeekDates(task.weekStartDate) : []), [task]);
  const requirementCells = useMemo(() => (task ? requirementsToCells(task.requirements) : []), [task]);

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
      const response = await fetch(`/api/tasks/${task.id}/requirements`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: expandRequirementDraft(task, requirementDraft) })
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

  async function clearScheduleResult() {
    if (!task) return;
    if (!window.confirm("确认清空当前排班结果吗？医生名单、不可排班时间和排班规则将保留。")) return;
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
              <option value="">{candidates.length ? "补排医生" : "无可用医生"}</option>
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

  function renderRequirementControls() {
    const renderSlotControls = (dateKey: string, slotName: keyof RequirementDayDraft, label?: string) => {
      const value = requirementDraft[dateKey]?.[slotName] ?? createClosedSlot();
      return (
        <div className="grid min-w-48 grid-cols-[auto_1fr_1fr] items-center gap-2">
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
        </div>
      );
    };

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">排班规则设置</h3>
            <p className="text-sm text-slate-600">诊室数量 0-20；每诊室人数 1-5。保存规则会清空旧排班结果。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setRequirementDraft(buildDefaultRequirementDraft(currentTask))} className="focus-ring rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              使用默认心电图室规则
            </button>
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
                      <th className="border-b border-slate-200 px-3 py-3 font-medium">是否开放 / 诊室数 / 每诊室人数</th>
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
                {weekDays.map((day) => (
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
                          诊室{requirement.roomNumber}
                          <span className="ml-1 text-xs font-normal text-slate-400">/{requirement.requiredDoctors}人</span>
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
          <div className="px-4 py-6 text-sm text-slate-600">暂无未排满诊室或不可用冲突。</div>
        ) : (
          <div className="table-scroll">
            <table className="min-w-[860px] w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-3 font-medium">日期</th>
                  <th className="border-b border-slate-200 px-3 py-3 font-medium">星期</th>
                  <th className="border-b border-slate-200 px-3 py-3 font-medium">时段</th>
                  <th className="border-b border-slate-200 px-3 py-3 font-medium">诊室</th>
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
                    <td className="border-b border-slate-100 px-3 py-3">诊室{conflict.roomNumber}</td>
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
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">医生</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">总班次</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">上午</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">下午</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">周末</th>
                <th className="border-b border-slate-200 px-3 py-3 font-medium">高峰</th>
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
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3 font-semibold">{doctor.totalAssignments}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{doctor.morningAssignments}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{doctor.afternoonAssignments}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{doctor.weekendAssignments}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{doctor.peakAssignments}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{doctor.maxConsecutiveDays} 天</td>
                  <td className="border-b border-slate-100 px-3 py-3">
                    {doctor.assignments.length ? (
                      <div className="flex flex-wrap gap-1">
                        {doctor.assignments.map((assignment) => (
                          <span key={assignment.id} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                            {assignment.date}
                            {assignment.weekdayLabel}
                            {assignment.timeSlotLabel} 诊室{assignment.roomNumber}
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
            {toDateKey(task.weekStartDate)} 至 {toDateKey(task.weekEndDate)}
          </h2>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">{MODE_LABELS[task.mode]}</span>
            <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">{STATUS_LABELS[task.status]}</span>
            <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">{task.doctors.length} 名医生</span>
            <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">{task.requirements.length} 条规则</span>
          </div>
        </div>
        <button onClick={() => void loadTask()} className="focus-ring inline-flex w-fit items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <RefreshCw size={16} />
          刷新
        </button>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-hospital-green">{notice}</div> : null}

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
      </nav>

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
                    <th className="border-b border-slate-200 px-3 py-3 font-medium">医生</th>
                    {weekDays.map((day) => (
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
                      {weekDays.map((day) => {
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
                  className="focus-ring rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:bg-slate-100"
                >
                  清空排班结果
                </button>
              ) : null}
              <button
                onClick={() => void generateSchedule()}
                disabled={busy === "generate" || requirementCells.length === 0}
                className="focus-ring inline-flex w-fit items-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:bg-slate-300"
              >
                <Wand2 size={16} />
                {busy === "generate" ? "正在生成..." : task.assignments.length ? "重新生成" : "生成排班"}
              </button>
            </div>
          </div>
          {renderStatsOverview()}
          {renderWarnings()}
          {renderConflictReport()}
        </div>
      ) : null}

      {activeTab === "schedule" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-slate-950">排班表</h3>
            <div className="flex flex-wrap gap-2">
              {hasScheduleResult ? (
                <button onClick={() => void clearScheduleResult()} className="focus-ring rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
                  清空排班结果
                </button>
              ) : null}
              <div className="inline-flex rounded-md border border-slate-300 bg-white p-1">
                <button onClick={() => setScheduleView("room")} className={scheduleView === "room" ? "rounded px-3 py-1.5 text-sm font-medium text-hospital-green" : "rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"}>
                  诊室视图
                </button>
                <button onClick={() => setScheduleView("doctor")} className={scheduleView === "doctor" ? "rounded px-3 py-1.5 text-sm font-medium text-hospital-green" : "rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"}>
                  医生视图
                </button>
              </div>
            </div>
          </div>
          {renderStatsOverview()}
          {scheduleView === "room" ? renderRoomTable(false) : renderDoctorView()}
          {renderConflictReport()}
        </div>
      ) : null}

      {activeTab === "adjust" ? (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">手动调整</h3>
            <p className="text-sm text-slate-600">下拉框只列出该时间段可用且未重复占用的医生。</p>
          </div>
          {renderRoomTable(true)}
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
                  <p className="mt-1 text-sm text-slate-600">文件包含动态诊室排班表、医生个人统计和冲突报告。</p>
                  <a href={`/api/tasks/${task.id}/export`} className="focus-ring mt-4 inline-flex items-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">
                    <FileSpreadsheet size={16} />
                    导出 Excel
                  </a>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-table">
            <h4 className="font-semibold text-slate-900">导出概览</h4>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">医生人数</dt>
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
          <div className="mt-2 text-lg font-semibold text-slate-950">{stats.overall.expectedAssignments} 个医生班次</div>
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
