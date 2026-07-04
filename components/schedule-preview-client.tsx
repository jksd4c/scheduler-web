"use client";

import { AlertTriangle, CheckCircle2, Download, Loader2, Lock, Save, Unlock, UsersRound, Wand2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TASK_SCHEDULE_MODE_LABELS } from "@/lib/schedule-rules";

type Candidate = { doctorId: string; name: string; compliant: boolean; reasons: string[] };
type Cell = {
  key: string;
  dateKey: string;
  weekday: number;
  timeSlot: string;
  timeSlotLabel: string;
  roomNumber: number;
  label: string;
  requiredDoctors: number;
  locked: boolean;
  manualOverride: boolean;
  assignments: Array<{ id: string; doctorId: string; locked: boolean; manualOverride?: boolean; overrideReason?: string | null; doctor: { name: string } }>;
  conflicts: Array<{ id: string; severity: string; conflictType: string; description: string }>;
  candidates: Candidate[];
};
type CalendarDay = {
  dateKey: string;
  weekdayLabel: string;
  dateType: string;
  dateTypeLabel: string;
  cells: Cell[];
  conflicts: Array<{ id: string; severity: string; description: string }>;
};
type PreviewData = {
  task: {
    id: string;
    startDate: string;
    endDate: string;
    periodType: "DAYS_7" | "DAYS_30" | "CALENDAR_MONTH" | "QUARTER" | "HALF_YEAR" | "YEAR" | "CUSTOM";
    weekStartDate: string;
    weekEndDate: string;
    scheduleMode: "WARD_SHIFT" | "MEDTECH_ROOM" | "CUSTOM";
    status: string;
    assignments: unknown[];
    stats: {
      perDoctor: Array<{
        doctorId: string;
        name: string;
        totalAssignments: number;
        dayShiftAssignments?: number;
        nightShiftAssignments?: number;
        postNightAssignments?: number;
        weekendAssignments: number;
        weekendDayAssignments?: number;
        weekendNightAssignments?: number;
        holidayDayAssignments?: number;
        holidayNightAssignments?: number;
        saturdayNightAssignments?: number;
        sundayNightAssignments?: number;
        goldenNightAssignments?: number;
        highBurdenNightAssignments?: number;
        firstLineAssignments?: number;
        secondLineAssignments?: number;
        onCallAssignments?: number;
        emergencyAssignments?: number;
        workloadTotal?: number;
        manualOverrideAssignments?: number;
        preferenceLabel?: string;
        preferenceSatisfaction?: string;
      }>;
      fairnessGroups?: {
        comparable: {
          memberCount: number;
          explanation: string;
          members: Array<{ doctorId: string; name: string; totalAssignments: number; workloadTotal: number; nightShiftAssignments: number; secondLineAssignments: number; reason: string }>;
        };
        excluded: Array<{ doctorId: string; name: string; totalAssignments: number; workloadTotal: number; nightShiftAssignments: number; secondLineAssignments: number; reason: string }>;
        limited: Array<{ doctorId: string; name: string; totalAssignments: number; workloadTotal: number; nightShiftAssignments: number; secondLineAssignments: number; reason: string }>;
        scarce: Array<{ doctorId: string; name: string; totalAssignments: number; workloadTotal: number; nightShiftAssignments: number; secondLineAssignments: number; reason: string }>;
        explanations: string[];
      };
    };
  };
  calendarDays: CalendarDay[];
  summary: {
    expectedAssignments: number;
    actualAssignments: number;
    unfilledAssignments: number;
    conflictCount: number;
    manualOverrideCount: number;
  };
};

type CalendarSlot = {
  key: string;
  dateKey: string;
  dayNumber: number;
  day?: CalendarDay;
  inMonth: boolean;
  isToday: boolean;
};

const WEEK_HEADERS = ["日", "一", "二", "三", "四", "五", "六"];

const dateTypeClass: Record<string, string> = {
  WORKDAY: "bg-white",
  WEEKEND: "bg-slate-50",
  HOLIDAY: "bg-red-50",
  PUBLIC_HOLIDAY: "bg-red-50",
  MAKEUP_WORKDAY: "bg-orange-50",
  CUSTOM_REST: "bg-purple-50",
  CUSTOM_REST_DAY: "bg-purple-50",
  CUSTOM_SPECIAL_DAY: "bg-yellow-50",
  CUSTOM_SPECIAL: "bg-yellow-50"
};

export function SchedulePreviewClient({ taskId }: { taskId: string }) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingCell, setEditingCell] = useState<Cell | null>(null);
  const [selectedDoctorIds, setSelectedDoctorIds] = useState<string[]>([]);
  const [showNonCompliant, setShowNonCompliant] = useState(false);
  const [forceOverride, setForceOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [activeMonth, setActiveMonth] = useState("");

  async function load() {
    setBusy("load");
    setError("");
    try {
      const data = await fetchJson(`/api/tasks/${taskId}/preview`);
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载预览失败");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    void load();
  }, [taskId]);

  const monthGroups = useMemo(() => {
    const groups = new Map<string, CalendarDay[]>();
    for (const day of preview?.calendarDays ?? []) {
      const key = day.dateKey.slice(0, 7);
      groups.set(key, [...(groups.get(key) ?? []), day]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [preview]);

  const useMonthOverview = useMemo(
    () => ["QUARTER", "HALF_YEAR", "YEAR"].includes(preview?.task.periodType ?? ""),
    [preview?.task.periodType]
  );
  const monthSummaries = useMemo(() => monthGroups.map(([month, days]) => buildMonthSummary(month, days)), [monthGroups]);

  useEffect(() => {
    if (!monthGroups.length) return;
    if (useMonthOverview) {
      if (activeMonth && !monthGroups.some(([month]) => month === activeMonth)) setActiveMonth("");
      return;
    }
    if (!activeMonth || !monthGroups.some(([month]) => month === activeMonth)) {
      setActiveMonth(monthGroups[0][0]);
    }
  }, [activeMonth, monthGroups, useMonthOverview]);

  const visibleMonthGroups = useMonthOverview
    ? activeMonth
      ? monthGroups.filter(([month]) => month === activeMonth)
      : []
    : activeMonth
      ? monthGroups.filter(([month]) => month === activeMonth)
      : monthGroups.slice(0, 1);

  function openEdit(cell: Cell) {
    setEditingCell(cell);
    setSelectedDoctorIds(cell.assignments.map((assignment) => assignment.doctorId));
    setShowNonCompliant(false);
    setForceOverride(false);
    setOverrideReason("");
    setError("");
  }

  async function generatePreview() {
    if (preview?.task.assignments.length) {
      const ok = window.confirm("重新生成预览会覆盖当前预览结果，已锁定的单元格将保留。是否继续？");
      if (!ok) return;
    }
    setBusy("generate");
    setError("");
    try {
      const data = await fetchJson(`/api/tasks/${taskId}/preview/generate`, { method: "POST" });
      setPreview(data);
      setNotice("预览已生成，可以直接在日历中检查和修改。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成预览失败");
    } finally {
      setBusy("");
    }
  }

  async function saveEdit() {
    if (!editingCell) return;
    const selectedNonCompliant = editingCell.candidates.filter((candidate) => selectedDoctorIds.includes(candidate.doctorId) && !candidate.compliant);
    if (selectedNonCompliant.length && (!forceOverride || !overrideReason.trim())) {
      setError("选择不合规人员时必须启用强制覆盖并填写原因。");
      return;
    }
    setBusy("edit");
    setError("");
    try {
      const data = await fetchJson(`/api/tasks/${taskId}/preview/assignment`, {
        method: "PATCH",
        body: {
          date: editingCell.dateKey,
          timeSlot: editingCell.timeSlot,
          roomNumber: editingCell.roomNumber,
          doctorIds: selectedDoctorIds,
          forceOverride,
          overrideReason
        }
      });
      setPreview(data);
      setEditingCell(null);
      setNotice("预览排班已更新，冲突和统计已刷新。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存修改失败");
    } finally {
      setBusy("");
    }
  }

  async function toggleLock(cell: Cell) {
    setBusy(`lock:${cell.key}`);
    setError("");
    try {
      const data = await fetchJson(`/api/tasks/${taskId}/preview/lock`, {
        method: "POST",
        body: { date: cell.dateKey, timeSlot: cell.timeSlot, roomNumber: cell.roomNumber, locked: !cell.locked }
      });
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "锁定状态更新失败");
    } finally {
      setBusy("");
    }
  }

  async function finalizePreview() {
    if (!preview) return;
    if (preview.summary.unfilledAssignments || preview.summary.manualOverrideCount || preview.summary.conflictCount) {
      const ok = window.confirm("当前排班存在未排满班次、冲突或强制覆盖，是否仍保存为正式排班？");
      if (!ok) return;
    }
    setBusy("finalize");
    setError("");
    try {
      const data = await fetchJson(`/api/tasks/${taskId}/preview/finalize`, { method: "POST" });
      setPreview(data);
      setNotice("已保存为正式排班，Excel 导出和成员查看将使用该结果。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存正式排班失败");
    } finally {
      setBusy("");
    }
  }

  const allConflicts = preview?.calendarDays.flatMap((day) => day.conflicts.map((conflict) => ({ ...conflict, dateKey: day.dateKey }))) ?? [];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/tasks/${taskId}`} className="text-sm text-slate-600 hover:text-slate-950">返回任务详情</Link>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">预览与编辑</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            预览以真实日历展示。点击某天的班次短条即可修改人员，确认后再保存为正式排班或导出。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void generatePreview()} disabled={Boolean(busy)} className="focus-ring inline-flex items-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300">
            {busy === "generate" ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
            {preview?.task.assignments.length ? "重新生成预览" : "生成预览"}
          </button>
          <button onClick={() => void finalizePreview()} disabled={Boolean(busy) || !preview?.task.assignments.length} className="focus-ring inline-flex items-center gap-2 rounded-md border border-teal-200 bg-white px-4 py-2 text-sm font-medium text-hospital-green disabled:opacity-40">
            {busy === "finalize" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            保存为正式排班
          </button>
          <Link href={`/api/tasks/${taskId}/export`} className="focus-ring inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">
            <Download size={16} />
            导出 Excel
          </Link>
        </div>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-hospital-green">{notice}</div> : null}
      {busy === "load" ? <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">正在加载预览...</div> : null}

      {preview ? (
        <>
          <div className="grid gap-3 md:grid-cols-5">
            <SummaryCard label="总需求" value={preview.summary.expectedAssignments} />
            <SummaryCard label="已排班" value={preview.summary.actualAssignments} />
            <SummaryCard label="未排满" value={preview.summary.unfilledAssignments} tone={preview.summary.unfilledAssignments ? "red" : "normal"} />
            <SummaryCard label="冲突数" value={preview.summary.conflictCount} tone={preview.summary.conflictCount ? "amber" : "normal"} />
            <SummaryCard label="强制覆盖" value={preview.summary.manualOverrideCount} tone={preview.summary.manualOverrideCount ? "red" : "normal"} />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <Legend className="bg-white" label="普通工作日" />
            <Legend className="bg-slate-50" label="周末" />
            <Legend className="bg-red-50" label="法定节假日" />
            <Legend className="bg-orange-50" label="调休上班日" />
            <Legend className="bg-purple-50" label="自定义休息日" />
            <Legend className="bg-yellow-50" label="自定义特殊日" />
          </div>

          <div className="space-y-8">
            {useMonthOverview && !activeMonth ? (
              <MonthOverview summaries={monthSummaries} onOpen={setActiveMonth} />
            ) : null}

            {!useMonthOverview && monthGroups.length > 1 ? (
              <MonthSwitcher months={monthGroups.map(([month]) => month)} activeMonth={activeMonth} onChange={setActiveMonth} />
            ) : null}

            {visibleMonthGroups.map(([month, days]) => (
              <CalendarMonth
                key={month}
                month={month}
                days={days}
                busy={busy}
                taskModeLabel={TASK_SCHEDULE_MODE_LABELS[preview.task.scheduleMode]}
                showBackToOverview={useMonthOverview}
                onBackToOverview={() => setActiveMonth("")}
                onEdit={openEdit}
                onToggleLock={toggleLock}
              />
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <StatsPanel preview={preview} />
            <ConflictPanel conflicts={allConflicts} />
          </div>
        </>
      ) : null}

      {editingCell ? (
        <EditModal
          cell={editingCell}
          busy={busy}
          selectedDoctorIds={selectedDoctorIds}
          setSelectedDoctorIds={setSelectedDoctorIds}
          showNonCompliant={showNonCompliant}
          setShowNonCompliant={setShowNonCompliant}
          forceOverride={forceOverride}
          setForceOverride={setForceOverride}
          overrideReason={overrideReason}
          setOverrideReason={setOverrideReason}
          onClose={() => setEditingCell(null)}
          onSave={() => void saveEdit()}
        />
      ) : null}
    </section>
  );
}

function MonthOverview({ summaries, onOpen }: { summaries: ReturnType<typeof buildMonthSummary>[]; onOpen: (month: string) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-slate-950">月份总览</h3>
        <p className="mt-1 text-sm text-slate-500">长期周期先按月份查看概览，点击月份后进入该月日历明细。</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {summaries.map((summary) => (
          <button
            type="button"
            key={summary.month}
            onClick={() => onOpen(summary.month)}
            className="focus-ring rounded-lg border border-slate-200 bg-white p-4 text-left shadow-table hover:border-hospital-green"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-lg font-semibold text-slate-950">{formatMonthTitle(summary.month)}</div>
              {summary.conflictCount || summary.unfilledAssignments ? (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">需处理</span>
              ) : (
                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs text-hospital-green">正常</span>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <SummaryMini label="总班次数" value={summary.totalAssignments} />
              <SummaryMini label="夜班数" value={summary.nightAssignments} />
              <SummaryMini label="周末班" value={summary.weekendAssignments} />
              <SummaryMini label="节假日班" value={summary.holidayAssignments} />
              <SummaryMini label="冲突数" value={summary.conflictCount} alert={summary.conflictCount > 0} />
              <SummaryMini label="未排满" value={summary.unfilledAssignments} alert={summary.unfilledAssignments > 0} />
            </dl>
          </button>
        ))}
      </div>
    </div>
  );
}

function MonthSwitcher({ months, activeMonth, onChange }: { months: string[]; activeMonth: string; onChange: (month: string) => void }) {
  const currentIndex = Math.max(0, months.indexOf(activeMonth));
  const previous = months[currentIndex - 1];
  const next = months[currentIndex + 1];
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <button type="button" disabled={!previous} onClick={() => previous && onChange(previous)} className="focus-ring rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-30">
        上个月
      </button>
      <select value={activeMonth} onChange={(event) => onChange(event.target.value)} className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900">
        {months.map((month) => <option key={month} value={month}>{formatMonthTitle(month)}</option>)}
      </select>
      <button type="button" disabled={!next} onClick={() => next && onChange(next)} className="focus-ring rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-30">
        下个月
      </button>
    </div>
  );
}

function CalendarMonth({
  month,
  days,
  busy,
  taskModeLabel,
  showBackToOverview,
  onBackToOverview,
  onEdit,
  onToggleLock
}: {
  month: string;
  days: CalendarDay[];
  busy: string;
  taskModeLabel: string;
  showBackToOverview: boolean;
  onBackToOverview: () => void;
  onEdit: (cell: Cell) => void;
  onToggleLock: (cell: Cell) => void;
}) {
  const slots = useMemo(() => buildCalendarSlots(month, days), [month, days]);
  return (
    <section className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-table">
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <div className="w-20">
          {showBackToOverview ? (
            <button type="button" onClick={onBackToOverview} className="text-sm font-medium text-slate-600 hover:text-slate-950">总览</button>
          ) : null}
        </div>
        <div className="text-center">
          <h3 className="text-2xl font-semibold tracking-normal text-slate-950">{formatMonthTitle(month)}</h3>
          <div className="mt-1 text-xs text-slate-500">{taskModeLabel}</div>
        </div>
        <div className="w-20 text-right text-xs text-slate-400">日历预览</div>
      </div>

      <div className="grid grid-cols-7 border-y border-slate-100 bg-white text-center text-xs font-medium text-slate-500">
        {WEEK_HEADERS.map((header, index) => (
          <div key={header} className={`py-2 ${index === 0 ? "text-red-500" : index === 6 ? "text-slate-400" : ""}`}>{header}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 bg-slate-100">
        {slots.map((slot) => (
          <CalendarDayCell key={slot.key} slot={slot} busy={busy} onEdit={onEdit} onToggleLock={onToggleLock} />
        ))}
      </div>
    </section>
  );
}

function CalendarDayCell({ slot, busy, onEdit, onToggleLock }: { slot: CalendarSlot; busy: string; onEdit: (cell: Cell) => void; onToggleLock: (cell: Cell) => void }) {
  const day = slot.day;
  const jsDay = new Date(`${slot.dateKey}T00:00:00.000Z`).getUTCDay();
  const isSunday = jsDay === 0;
  const dayClass = day ? dateTypeClass[day.dateType] ?? "bg-white" : "bg-slate-50/70";
  return (
    <div className={`min-h-[112px] border-b border-r border-slate-100 p-1.5 sm:min-h-[148px] sm:p-2 ${dayClass} ${slot.inMonth ? "" : "text-slate-300"}`}>
      <div className="flex items-start justify-between gap-1">
        <div>
          <div className={`text-sm font-semibold ${slot.isToday ? "inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-950 px-1 text-white" : isSunday ? "text-red-500" : slot.inMonth ? "text-slate-950" : "text-slate-300"}`}>
            {slot.dayNumber}
          </div>
          {day ? <div className="mt-0.5 text-[10px] text-slate-400">{day.weekdayLabel}</div> : null}
        </div>
        {day?.conflicts.length ? (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">
            <AlertTriangle size={10} />{day.conflicts.length}
          </span>
        ) : null}
      </div>

      {day && day.dateType !== "WORKDAY" && day.dateType !== "WEEKEND" ? (
        <div className="mt-1 truncate rounded-full bg-white/75 px-1.5 py-0.5 text-[10px] text-slate-600">{day.dateTypeLabel}</div>
      ) : null}

      <div className="mt-2 space-y-1">
        {day?.cells.length ? (
          <>
            {day.cells.slice(0, 5).map((cell) => (
              <CalendarShiftPill key={cell.key} cell={cell} busy={busy} onEdit={onEdit} onToggleLock={onToggleLock} />
            ))}
            {day.cells.length > 5 ? <div className="text-[10px] text-slate-400">还有 {day.cells.length - 5} 个班次</div> : null}
          </>
        ) : day ? (
          <div className="pt-3 text-center text-[10px] text-slate-300">未开放</div>
        ) : null}
      </div>
    </div>
  );
}

function CalendarShiftPill({ cell, busy, onEdit, onToggleLock }: { cell: Cell; busy: string; onEdit: (cell: Cell) => void; onToggleLock: (cell: Cell) => void }) {
  const missing = Math.max(0, cell.requiredDoctors - cell.assignments.length);
  const names = cell.assignments.map((assignment) => assignment.doctor.name).join("、");
  const tone = cell.conflicts.length || missing > 0
    ? "border-red-200 bg-red-50 text-red-800"
    : cell.manualOverride
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-sky-200 bg-sky-100 text-sky-900";
  return (
    <div className={`group flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] leading-tight sm:text-xs ${tone}`}>
      <button type="button" onClick={() => onEdit(cell)} className="min-w-0 flex-1 text-left">
        <div className="truncate font-medium">{cell.label}</div>
        <div className="truncate opacity-80">{names || `缺 ${missing} 人`}</div>
      </button>
      <button
        type="button"
        disabled={busy === `lock:${cell.key}` || !cell.assignments.length}
        onClick={() => void onToggleLock(cell)}
        className="shrink-0 rounded p-0.5 opacity-70 hover:bg-white/60 disabled:opacity-25"
        title={cell.locked ? "解锁" : "锁定"}
      >
        {cell.locked ? <Lock size={11} /> : <Unlock size={11} />}
      </button>
    </div>
  );
}

function EditModal({
  cell,
  busy,
  selectedDoctorIds,
  setSelectedDoctorIds,
  showNonCompliant,
  setShowNonCompliant,
  forceOverride,
  setForceOverride,
  overrideReason,
  setOverrideReason,
  onClose,
  onSave
}: {
  cell: Cell;
  busy: string;
  selectedDoctorIds: string[];
  setSelectedDoctorIds: (value: string[]) => void;
  showNonCompliant: boolean;
  setShowNonCompliant: (value: boolean | ((previous: boolean) => boolean)) => void;
  forceOverride: boolean;
  setForceOverride: (value: boolean) => void;
  overrideReason: string;
  setOverrideReason: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">修改人员</h3>
            <p className="text-sm text-slate-600">{cell.dateKey} {cell.timeSlotLabel} {cell.label}，需要 {cell.requiredDoctors} 人</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="space-y-5 px-5 py-4">
          {cell.locked ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">该单元已锁定，请先解锁后再修改。</div> : null}
          <CandidateGroup
            title="合规候选人"
            candidates={cell.candidates.filter((candidate) => candidate.compliant)}
            selectedDoctorIds={selectedDoctorIds}
            setSelectedDoctorIds={setSelectedDoctorIds}
            disabled={cell.locked}
          />
          <div>
            <button onClick={() => setShowNonCompliant((value) => !value)} className="text-sm font-medium text-slate-700 hover:text-slate-950">
              {showNonCompliant ? "收起不合规候选人" : "展开不合规候选人"}
            </button>
            {showNonCompliant ? (
              <CandidateGroup
                title="不合规候选人"
                candidates={cell.candidates.filter((candidate) => !candidate.compliant)}
                selectedDoctorIds={selectedDoctorIds}
                setSelectedDoctorIds={setSelectedDoctorIds}
                disabled={cell.locked || !forceOverride}
                showReasons
              />
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={forceOverride} onChange={(event) => setForceOverride(event.target.checked)} />
            强制覆盖规则
          </label>
          {forceOverride ? (
            <textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} rows={3} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="必须填写强制覆盖原因" />
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button onClick={onClose} className="focus-ring rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700">取消</button>
          <button onClick={onSave} disabled={Boolean(busy) || cell.locked} className="focus-ring inline-flex items-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300">
            {busy === "edit" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            保存修改
          </button>
        </div>
      </div>
    </div>
  );
}

function CandidateGroup({ title, candidates, selectedDoctorIds, setSelectedDoctorIds, disabled, showReasons = false }: {
  title: string;
  candidates: Candidate[];
  selectedDoctorIds: string[];
  setSelectedDoctorIds: (value: string[]) => void;
  disabled?: boolean;
  showReasons?: boolean;
}) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-slate-950">{title}</h4>
      <div className="grid gap-2 sm:grid-cols-2">
        {candidates.length ? candidates.map((candidate) => {
          const checked = selectedDoctorIds.includes(candidate.doctorId);
          return (
            <label key={candidate.doctorId} className={`rounded-md border px-3 py-2 text-sm ${candidate.compliant ? "border-teal-100 bg-teal-50/60" : "border-red-100 bg-red-50/60"} ${disabled ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => {
                    setSelectedDoctorIds(event.target.checked ? [...selectedDoctorIds, candidate.doctorId] : selectedDoctorIds.filter((id) => id !== candidate.doctorId));
                  }}
                />
                <span className="font-medium text-slate-900">{candidate.name}</span>
                {candidate.compliant ? <CheckCircle2 size={14} className="text-hospital-green" /> : <AlertTriangle size={14} className="text-red-600" />}
              </div>
              {showReasons && candidate.reasons.length ? <div className="mt-1 pl-6 text-xs text-red-700">{candidate.reasons.join("；")}</div> : null}
            </label>
          );
        }) : <div className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-400">暂无候选人</div>}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone = "normal" }: { label: string; value: number; tone?: "normal" | "red" | "amber" }) {
  const toneClass = tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : "text-slate-950";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function SummaryMini({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="rounded-md bg-slate-50 p-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={alert ? "font-semibold text-red-700" : "font-semibold text-slate-950"}>{value}</dd>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return <span className="inline-flex items-center gap-1"><span className={`h-3 w-3 rounded border border-slate-200 ${className}`} />{label}</span>;
}

function StatsPanel({ preview }: { preview: PreviewData }) {
  const groups = preview.task.stats.fairnessGroups;
  return (
    <div className="space-y-4">
      {groups ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-table">
          <div className="flex items-center gap-2 font-semibold text-slate-950"><UsersRound size={16} />公平报告解释</div>
          <p className="mt-1 text-xs text-slate-500">{groups.comparable.explanation}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <FairnessMini title="公平参与人员" count={groups.comparable.memberCount} />
            <FairnessMini title="不参与排班人员" count={groups.excluded.length} />
            <FairnessMini title="身份优待人员" count={groups.limited.length} />
            <FairnessMini title="资格稀缺人员" count={groups.scarce.length} />
          </div>
          {groups.explanations.length ? (
            <div className="mt-3 space-y-1">
              {groups.explanations.map((item) => <div key={item} className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">{item}</div>)}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 font-semibold text-slate-950"><UsersRound size={16} />人员统计</div>
        <div className="table-scroll">
          <table className="min-w-[1320px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>{["人员", "总班", "总工作量", "白班", "夜班", "下夜班", "周末白班", "周末夜班", "节假日白班", "节假日夜班", "周六夜班", "周日夜班", "黄金夜班", "高负担夜班", "一线班", "二线班", "留班", "急诊班", "强制覆盖", "偏好", "偏好满足情况"].map((header) => <th key={header} className="border-b border-slate-200 px-3 py-3 font-medium">{header}</th>)}</tr>
            </thead>
            <tbody>{preview.task.stats.perDoctor.map((doctor) => (
              <tr key={doctor.doctorId}>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.name}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.totalAssignments}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.workloadTotal ?? 0}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.dayShiftAssignments ?? 0}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.nightShiftAssignments ?? 0}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.postNightAssignments ?? 0}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.weekendDayAssignments ?? 0}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.weekendNightAssignments ?? 0}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.holidayDayAssignments ?? 0}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.holidayNightAssignments ?? 0}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.saturdayNightAssignments ?? 0}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.sundayNightAssignments ?? 0}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.goldenNightAssignments ?? 0}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.highBurdenNightAssignments ?? 0}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.firstLineAssignments ?? 0}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.secondLineAssignments ?? 0}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.onCallAssignments ?? 0}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.emergencyAssignments ?? 0}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.manualOverrideAssignments ?? 0}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.preferenceLabel ?? "无偏好"}</td>
                <td className="border-b border-slate-100 px-3 py-3">{doctor.preferenceSatisfaction ?? "无偏好"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FairnessMini({ title, count }: { title: string; count: number }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-1 text-lg font-semibold text-slate-950">{count}</div>
    </div>
  );
}

function ConflictPanel({ conflicts }: { conflicts: Array<{ id: string; dateKey: string; severity: string; description: string }> }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 font-semibold text-slate-950"><AlertTriangle size={16} />冲突报告</div>
      <div className="max-h-[420px] overflow-auto">
        {conflicts.length ? conflicts.map((conflict) => (
          <div key={conflict.id} className="border-b border-slate-100 px-4 py-3 text-sm">
            <div className="font-medium text-slate-900">{conflict.dateKey} · {conflict.severity}</div>
            <div className="mt-1 text-slate-600">{conflict.description}</div>
          </div>
        )) : <div className="px-4 py-10 text-center text-sm text-slate-500">暂无冲突</div>}
      </div>
    </div>
  );
}

function buildMonthSummary(month: string, days: CalendarDay[]) {
  let totalAssignments = 0;
  let nightAssignments = 0;
  let weekendAssignments = 0;
  let holidayAssignments = 0;
  let conflictCount = 0;
  let unfilledAssignments = 0;
  for (const day of days) {
    const isWeekend = day.dateType === "WEEKEND" || isWeekendDate(day.dateKey);
    const isHoliday = ["HOLIDAY", "PUBLIC_HOLIDAY", "CUSTOM_REST_DAY", "CUSTOM_REST"].includes(day.dateType);
    conflictCount += day.conflicts.length;
    for (const cell of day.cells) {
      const assigned = cell.assignments.length;
      totalAssignments += assigned;
      unfilledAssignments += Math.max(0, cell.requiredDoctors - assigned);
      if (cell.label.includes("夜") || cell.timeSlotLabel.includes("夜")) nightAssignments += assigned;
      if (isWeekend) weekendAssignments += assigned;
      if (isHoliday) holidayAssignments += assigned;
    }
  }
  return { month, totalAssignments, nightAssignments, weekendAssignments, holidayAssignments, conflictCount, unfilledAssignments };
}

function buildCalendarSlots(month: string, days: CalendarDay[]): CalendarSlot[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const dayByKey = new Map(days.map((day) => [day.dateKey, day]));
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const leading = first.getUTCDay();
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const slotCount = Math.max(35, Math.ceil((leading + lastDay) / 7) * 7);
  const today = utcDateKey(new Date());
  return Array.from({ length: slotCount }).map((_, index) => {
    const dayNumber = index - leading + 1;
    const date = new Date(Date.UTC(year, monthNumber - 1, dayNumber));
    const dateKey = utcDateKey(date);
    return {
      key: `${month}:${index}`,
      dateKey,
      dayNumber: date.getUTCDate(),
      day: dayByKey.get(dateKey),
      inMonth: date.getUTCMonth() === monthNumber - 1,
      isToday: dateKey === today
    };
  });
}

function utcDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatMonthTitle(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const currentYear = new Date().getFullYear();
  return year === currentYear ? `${monthNumber}月` : `${year}年${monthNumber}月`;
}

function isWeekendDate(dateKey: string) {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

async function fetchJson(url: string, options: { method?: string; body?: unknown } = {}) {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store"
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "请求失败");
  return data;
}
