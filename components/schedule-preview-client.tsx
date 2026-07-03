"use client";

import { AlertTriangle, CheckCircle2, Download, Loader2, Lock, RefreshCw, Save, Unlock, UsersRound, Wand2, X } from "lucide-react";
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
        weekendAssignments: number;
        workloadTotal?: number;
        manualOverrideAssignments?: number;
      }>;
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

const dateTypeClass: Record<string, string> = {
  WORKDAY: "bg-white",
  WEEKEND: "bg-sky-50",
  HOLIDAY: "bg-red-50",
  PUBLIC_HOLIDAY: "bg-red-50",
  MAKEUP_WORKDAY: "bg-orange-50",
  CUSTOM_REST: "bg-purple-50",
  CUSTOM_REST_DAY: "bg-purple-50",
  CUSTOM_SPECIAL_DAY: "bg-yellow-50",
  CUSTOM_SPECIAL: "bg-yellow-50"
};

function buildMonthSummary(month: string, days: CalendarDay[]) {
  let totalAssignments = 0;
  let nightAssignments = 0;
  let weekendAssignments = 0;
  let holidayAssignments = 0;
  let conflictCount = 0;
  let unfilledAssignments = 0;
  for (const day of days) {
    const isWeekend = day.dateType === "WEEKEND" || day.weekdayLabel === "周六" || day.weekdayLabel === "周日";
    const isHoliday = day.dateType === "HOLIDAY" || day.dateType === "PUBLIC_HOLIDAY" || day.dateType === "CUSTOM_REST_DAY" || day.dateType === "CUSTOM_REST";
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
    return Array.from(groups.entries());
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
    : monthGroups.length > 2 && activeMonth
      ? monthGroups.filter(([month]) => month === activeMonth)
      : monthGroups;

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
            预览模式用于在网页中直接检查和修改排班结果，确认后再导出或发布，避免反复导入导出。未确认成员的反馈不会进入自动排班。
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
            <Legend className="bg-sky-50" label="普通周末" />
            <Legend className="bg-red-50" label="法定节假日预留" />
            <Legend className="bg-orange-50" label="调休上班预留" />
            <Legend className="bg-purple-50" label="自定义休息预留" />
            <Legend className="bg-yellow-50" label="特殊日期预留" />
          </div>

          <div className="space-y-8">
            {useMonthOverview && !activeMonth ? (
              <div className="space-y-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">月份总览</h3>
                  <p className="mt-1 text-sm text-slate-500">长期周期先按月份查看概览，点击月份后进入该月日历明细。</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {monthSummaries.map((summary) => (
                    <button
                      type="button"
                      key={summary.month}
                      onClick={() => setActiveMonth(summary.month)}
                      className="focus-ring rounded-lg border border-slate-200 bg-white p-4 text-left shadow-table hover:border-hospital-green"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-lg font-semibold text-slate-950">{summary.month}</div>
                        {summary.conflictCount || summary.unfilledAssignments ? (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">需处理</span>
                        ) : (
                          <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs text-hospital-green">正常</span>
                        )}
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-md bg-slate-50 p-2"><dt className="text-xs text-slate-500">总班次数</dt><dd className="font-semibold text-slate-950">{summary.totalAssignments}</dd></div>
                        <div className="rounded-md bg-slate-50 p-2"><dt className="text-xs text-slate-500">夜班数</dt><dd className="font-semibold text-slate-950">{summary.nightAssignments}</dd></div>
                        <div className="rounded-md bg-slate-50 p-2"><dt className="text-xs text-slate-500">周末班</dt><dd className="font-semibold text-slate-950">{summary.weekendAssignments}</dd></div>
                        <div className="rounded-md bg-slate-50 p-2"><dt className="text-xs text-slate-500">节假日班</dt><dd className="font-semibold text-slate-950">{summary.holidayAssignments}</dd></div>
                        <div className="rounded-md bg-slate-50 p-2"><dt className="text-xs text-slate-500">冲突数</dt><dd className={summary.conflictCount ? "font-semibold text-red-700" : "font-semibold text-slate-950"}>{summary.conflictCount}</dd></div>
                        <div className="rounded-md bg-slate-50 p-2"><dt className="text-xs text-slate-500">未排满</dt><dd className={summary.unfilledAssignments ? "font-semibold text-red-700" : "font-semibold text-slate-950"}>{summary.unfilledAssignments}</dd></div>
                      </dl>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {!useMonthOverview && monthGroups.length > 2 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
                <span className="text-sm font-medium text-slate-700">按月查看</span>
                <select value={activeMonth} onChange={(event) => setActiveMonth(event.target.value)} className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm">
                  {monthGroups.map(([month]) => <option key={month} value={month}>{month}</option>)}
                </select>
                <span className="text-xs text-slate-500">长周期默认只渲染一个月，避免页面卡顿。</span>
              </div>
            ) : null}
            {visibleMonthGroups.map(([month, days]) => (
              <div key={month} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-slate-950">{month}</h3>
                    {useMonthOverview ? (
                      <button type="button" onClick={() => setActiveMonth("")} className="text-sm font-medium text-slate-600 hover:text-slate-950">返回月份总览</button>
                    ) : null}
                  </div>
                  <span className="text-sm text-slate-500">{TASK_SCHEDULE_MODE_LABELS[preview.task.scheduleMode]}</span>
                </div>
                <div className="grid gap-3 md:grid-cols-7">
                  {Array.from({ length: Math.max(0, new Date(`${days[0].dateKey}T00:00:00.000Z`).getUTCDay() === 0 ? 6 : new Date(`${days[0].dateKey}T00:00:00.000Z`).getUTCDay() - 1) }).map((_, index) => (
                    <div key={`blank-${index}`} className="hidden md:block" />
                  ))}
                  {days.map((day) => <DayCard key={day.dateKey} day={day} busy={busy} onEdit={openEdit} onToggleLock={toggleLock} />)}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <StatsPanel preview={preview} />
            <ConflictPanel conflicts={allConflicts} />
          </div>
        </>
      ) : null}

      {editingCell ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">修改人员</h3>
                <p className="text-sm text-slate-600">{editingCell.dateKey} {editingCell.timeSlotLabel} {editingCell.label}，需要 {editingCell.requiredDoctors} 人</p>
              </div>
              <button onClick={() => setEditingCell(null)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="space-y-5 px-5 py-4">
              {editingCell.locked ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">该单元已锁定，请先解锁后再修改。</div> : null}
              <CandidateGroup
                title="合规候选人"
                candidates={editingCell.candidates.filter((candidate) => candidate.compliant)}
                selectedDoctorIds={selectedDoctorIds}
                setSelectedDoctorIds={setSelectedDoctorIds}
                disabled={editingCell.locked}
              />
              <div>
                <button onClick={() => setShowNonCompliant((value) => !value)} className="text-sm font-medium text-slate-700 hover:text-slate-950">
                  {showNonCompliant ? "收起不合规候选人" : "展开不合规候选人"}
                </button>
                {showNonCompliant ? (
                  <CandidateGroup
                    title="不合规候选人"
                    candidates={editingCell.candidates.filter((candidate) => !candidate.compliant)}
                    selectedDoctorIds={selectedDoctorIds}
                    setSelectedDoctorIds={setSelectedDoctorIds}
                    disabled={editingCell.locked || !forceOverride}
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
              <button onClick={() => setEditingCell(null)} className="focus-ring rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700">取消</button>
              <button onClick={() => void saveEdit()} disabled={Boolean(busy) || editingCell.locked} className="focus-ring inline-flex items-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300">
                {busy === "edit" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                保存修改
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function DayCard({ day, busy, onEdit, onToggleLock }: { day: CalendarDay; busy: string; onEdit: (cell: Cell) => void; onToggleLock: (cell: Cell) => void }) {
  return (
    <div className={`min-h-[220px] rounded-lg border border-slate-200 p-3 shadow-sm ${dateTypeClass[day.dateType] ?? "bg-white"}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-slate-950">{day.dateKey.slice(5)} {day.weekdayLabel}</div>
          {day.dateType !== "WORKDAY" ? <span className="mt-1 inline-flex rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 text-[11px] text-slate-600">{day.dateTypeLabel}</span> : null}
        </div>
        {day.conflicts.length ? <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700"><AlertTriangle size={12} />{day.conflicts.length}</span> : null}
      </div>
      <div className="space-y-2">
        {day.cells.length ? day.cells.map((cell) => (
          <div key={cell.key} className={`rounded-md border bg-white/85 p-2 ${cell.conflicts.length || cell.manualOverride ? "border-red-200" : "border-slate-200"}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-slate-900">{cell.label}</div>
              <button disabled={busy === `lock:${cell.key}` || !cell.assignments.length} onClick={() => void onToggleLock(cell)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40" title={cell.locked ? "解锁" : "锁定"}>
                {cell.locked ? <Lock size={14} /> : <Unlock size={14} />}
              </button>
            </div>
            <div className="mt-1 text-xs text-slate-500">{cell.timeSlotLabel} · {cell.assignments.length}/{cell.requiredDoctors} 人</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {cell.assignments.length ? cell.assignments.map((assignment) => (
                <span key={assignment.id} className={`rounded-full px-2 py-0.5 text-xs ${assignment.manualOverride ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"}`}>
                  {assignment.doctor.name}{assignment.manualOverride ? " ⚠" : ""}
                </span>
              )) : <span className="text-xs text-slate-400">未排</span>}
            </div>
            {cell.conflicts.length ? <div className="mt-2 text-xs text-red-700">{cell.conflicts[0].description}</div> : null}
            <button onClick={() => onEdit(cell)} className="mt-2 text-xs font-medium text-hospital-green hover:text-teal-800">修改人员</button>
          </div>
        )) : <div className="rounded-md border border-dashed border-slate-200 bg-white/60 px-3 py-8 text-center text-sm text-slate-400">未开放</div>}
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

function Legend({ className, label }: { className: string; label: string }) {
  return <span className="inline-flex items-center gap-1"><span className={`h-3 w-3 rounded border border-slate-200 ${className}`} />{label}</span>;
}

function StatsPanel({ preview }: { preview: PreviewData }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 font-semibold text-slate-950"><UsersRound size={16} />人员统计</div>
      <div className="table-scroll">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600"><tr>{["人员", "总班", "白/日班", "夜班", "周末", "节假日", "下夜班", "强制覆盖", "工作量"].map((header) => <th key={header} className="border-b border-slate-200 px-3 py-3 font-medium">{header}</th>)}</tr></thead>
          <tbody>{preview.task.stats.perDoctor.map((doctor) => (
            <tr key={doctor.doctorId}>
              <td className="border-b border-slate-100 px-3 py-3">{doctor.name}</td>
              <td className="border-b border-slate-100 px-3 py-3">{doctor.totalAssignments}</td>
              <td className="border-b border-slate-100 px-3 py-3">{doctor.dayShiftAssignments ?? 0}</td>
              <td className="border-b border-slate-100 px-3 py-3">{doctor.nightShiftAssignments ?? 0}</td>
              <td className="border-b border-slate-100 px-3 py-3">{doctor.weekendAssignments}</td>
              <td className="border-b border-slate-100 px-3 py-3">0</td>
              <td className="border-b border-slate-100 px-3 py-3">{doctor.nightShiftAssignments ?? 0}</td>
              <td className="border-b border-slate-100 px-3 py-3">{doctor.manualOverrideAssignments ?? 0}</td>
              <td className="border-b border-slate-100 px-3 py-3">{doctor.workloadTotal ?? 0}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
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
