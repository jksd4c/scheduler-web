"use client";

import { ArrowLeft, Building2, CalendarPlus, CheckCircle2, Columns3, Moon, Search, SlidersHorizontal, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getDateRangeDayCount, getPeriodRange, getTodayDateKey } from "@/lib/date-utils";
import { MODE_LABELS, PERIOD_TYPE_LABELS, TASK_SCHEDULE_MODE_LABELS } from "@/lib/schedule-rules";
import type { PeriodType } from "@/lib/date-utils";
import type { ScheduleMode, TaskScheduleMode } from "@/components/schedule-types";

type StaffOption = {
  id: string;
  displayName: string;
  phone?: string | null;
  poolType?: string | null;
  active: boolean;
  tagSnapshot?: Array<{ id: string; name: string; color?: string | null }>;
  eligibilitySummary?: string;
};

type RosterEntry = {
  id: string;
  staffProfileId?: string | null;
  expectedName: string;
  expectedPhone?: string | null;
  staffType?: string | null;
  poolType: string;
  status: string;
  includeInScheduling: boolean;
};

const periodTypes: PeriodType[] = ["DAYS_7", "DAYS_30", "CALENDAR_MONTH", "QUARTER", "HALF_YEAR", "YEAR", "CUSTOM"];

export function NewTaskForm() {
  const router = useRouter();
  const todayKey = getTodayDateKey();
  const [step, setStep] = useState<"choose" | "form">("choose");
  const [scheduleMode, setScheduleMode] = useState<TaskScheduleMode>("WARD_SHIFT");
  const [name, setName] = useState("排班任务");
  const [periodType, setPeriodType] = useState<PeriodType>("DAYS_30");
  const [startDate, setStartDate] = useState(todayKey);
  const [endDate, setEndDate] = useState(getPeriodRange("DAYS_30", todayKey).endDate);
  const [periodYear, setPeriodYear] = useState(Number(todayKey.slice(0, 4)));
  const [periodMonth, setPeriodMonth] = useState(Number(todayKey.slice(5, 7)));
  const [periodQuarter, setPeriodQuarter] = useState(Math.floor((Number(todayKey.slice(5, 7)) - 1) / 3) + 1);
  const [periodHalf, setPeriodHalf] = useState(Number(todayKey.slice(5, 7)) <= 6 ? 1 : 2);
  const [mode, setMode] = useState<ScheduleMode>("FULL_DAY");
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>([]);
  const [selectedFixedIds, setSelectedFixedIds] = useState<string[]>([]);
  const [selectedRotationIds, setSelectedRotationIds] = useState<string[]>([]);
  const [selectionInitialized, setSelectionInitialized] = useState(false);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "CORE" | "ROTATION">("ALL");
  const [submitting, setSubmitting] = useState(false);
  const [loadingPools, setLoadingPools] = useState(true);
  const [error, setError] = useState("");

  const periodDays = getDateRangeDayCount(startDate, endDate);
  const taskMode = scheduleMode === "MEDTECH_ROOM" ? mode : "FULL_DAY";
  const staffById = useMemo(() => new Map(staffOptions.map((item) => [item.id, item])), [staffOptions]);
  const confirmedRotationEntries = useMemo(
    () => rosterEntries.filter((entry) => entry.poolType === "ROTATION" && entry.status === "CONFIRMED" && entry.includeInScheduling && entry.staffProfileId),
    [rosterEntries]
  );
  const confirmedRotationProfileIds = useMemo(() => new Set(confirmedRotationEntries.map((entry) => entry.staffProfileId!)), [confirmedRotationEntries]);
  const fixedStaff = useMemo(
    () => staffOptions.filter((item) => item.active && item.poolType !== "ROTATION" && !confirmedRotationProfileIds.has(item.id)),
    [confirmedRotationProfileIds, staffOptions]
  );
  const rotationStaff = useMemo(
    () =>
      confirmedRotationEntries
        .map((entry) => {
          const staff = staffById.get(entry.staffProfileId!);
          return staff ? { ...staff, rosterEntry: entry } : null;
        })
        .filter(Boolean) as Array<StaffOption & { rosterEntry: RosterEntry }>,
    [confirmedRotationEntries, staffById]
  );
  const pendingRotationEntries = useMemo(
    () => rosterEntries.filter((entry) => entry.poolType === "ROTATION" && entry.status !== "CONFIRMED"),
    [rosterEntries]
  );
  const workPool = useMemo(() => {
    const ids = Array.from(new Set([...selectedFixedIds, ...selectedRotationIds]));
    return ids.map((id) => staffById.get(id)).filter(Boolean) as StaffOption[];
  }, [selectedFixedIds, selectedRotationIds, staffById]);
  const filteredWorkPool = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return workPool.filter((item) => {
      const isRotation = confirmedRotationProfileIds.has(item.id) || item.poolType === "ROTATION";
      if (sourceFilter === "CORE" && isRotation) return false;
      if (sourceFilter === "ROTATION" && !isRotation) return false;
      if (!keyword) return true;
      return `${item.displayName} ${item.phone ?? ""} ${(item.tagSnapshot ?? []).map((tag) => tag.name).join(" ")}`.toLowerCase().includes(keyword);
    });
  }, [confirmedRotationProfileIds, search, sourceFilter, workPool]);

  useEffect(() => {
    let cancelled = false;
    setLoadingPools(true);
    Promise.all([
      fetch("/api/staff").then((response) => (response.ok ? response.json() : { staff: [] })),
      fetch("/api/roster").then((response) => (response.ok ? response.json() : { entries: [] }))
    ])
      .then(([staffData, rosterData]) => {
        if (cancelled) return;
        setStaffOptions((staffData.staff ?? []).filter((item: StaffOption) => item.active));
        setRosterEntries(rosterData.entries ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setStaffOptions([]);
          setRosterEntries([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPools(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectionInitialized || loadingPools) return;
    setSelectedFixedIds(fixedStaff.map((item) => item.id));
    setSelectedRotationIds(rotationStaff.map((item) => item.id));
    setSelectionInitialized(true);
  }, [fixedStaff, loadingPools, rotationStaff, selectionInitialized]);

  useEffect(() => {
    if (periodType === "CUSTOM") {
      if (endDate < startDate) setEndDate(startDate);
      return;
    }
    const range = getPeriodRange(periodType, startDate, { year: periodYear, month: periodMonth, quarter: periodQuarter, half: periodHalf });
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodType, periodYear, periodMonth, periodQuarter, periodHalf]);

  function updateStartDate(value: string) {
    setStartDate(value);
    if (periodType === "DAYS_7" || periodType === "DAYS_30") {
      setEndDate(getPeriodRange(periodType, value).endDate);
    } else if (periodType === "CUSTOM" && endDate < value) {
      setEndDate(value);
    }
  }

  function toggle(id: string, group: "CORE" | "ROTATION") {
    const setter = group === "CORE" ? setSelectedFixedIds : setSelectedRotationIds;
    setter((previous) => (previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]));
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          periodType,
          startDate,
          endDate,
          year: periodYear,
          month: periodMonth,
          quarter: periodQuarter,
          half: periodHalf,
          mode: taskMode,
          scheduleMode,
          staffProfileIds: workPool.map((item) => item.id)
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "创建失败");
      router.push(`/tasks/${data.task.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "choose") {
    const cards: Array<{ id: TaskScheduleMode; title: string; fit: string; detail: string; recommended?: boolean; Icon: typeof Moon }> = [
      {
        id: "WARD_SHIFT",
        title: "病房白班/夜班",
        fit: "临床病区、住院部、ICU、急诊病区、一线/二线、住院总。",
        detail: "默认主流程：先设置一周白班/夜班模板，再用特殊日期日历覆盖个别日期。",
        recommended: true,
        Icon: Moon
      },
      {
        id: "MEDTECH_ROOM",
        title: "医技科室按房间",
        fit: "超声科、内镜中心、放射科、检验窗口、门诊检查室等。",
        detail: "按房间、检查室、窗口或单元数量排班，每个单元设置需要人数。",
        Icon: Columns3
      },
      {
        id: "CUSTOM",
        title: "高级自定义",
        fit: "特殊规则、临时任务、混合班次、节假日专项。",
        detail: "保留完整班次矩阵和身份资格规则，适合复杂场景。",
        Icon: SlidersHorizontal
      }
    ];

    return (
      <section className="space-y-6">
        <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft size={16} />
          返回任务列表
        </Link>
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">选择排班模式</h2>
          <p className="mt-1 text-sm text-slate-600">默认推荐病房白班/夜班；医技科室按房间和高级自定义保留为可选模式。</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {cards.map(({ id, title, fit, detail, recommended, Icon }) => {
            const selected = scheduleMode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setScheduleMode(id)}
                className={selected ? "focus-ring rounded-lg border-2 border-hospital-green bg-teal-50 p-5 text-left shadow-table" : "focus-ring rounded-lg border border-slate-200 bg-white p-5 text-left shadow-table hover:border-hospital-green"}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-lg bg-white p-2 text-hospital-green ring-1 ring-slate-200"><Icon size={22} /></div>
                  {recommended ? <span className="rounded-full bg-hospital-green px-2 py-1 text-xs font-medium text-white">推荐默认</span> : null}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm text-slate-600">{fit}</p>
                <p className="mt-2 text-sm text-slate-500">{detail}</p>
              </button>
            );
          })}
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={() => setStep("form")} className="focus-ring inline-flex items-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">
            <CalendarPlus size={16} />
            使用{TASK_SCHEDULE_MODE_LABELS[scheduleMode]}创建任务
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowLeft size={16} />
            返回任务列表
          </Link>
          <h2 className="mt-3 text-2xl font-semibold text-slate-950">新建排班任务</h2>
          <p className="mt-1 text-sm text-slate-600">
            当前模式：{TASK_SCHEDULE_MODE_LABELS[scheduleMode]}。默认 30 天周期，候选人来自本次排班工作池。
          </p>
        </div>
        <button type="button" onClick={() => setStep("choose")} className="focus-ring inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Building2 size={16} />
          重选模式
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-table">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">任务名称</span>
                <input value={name} onChange={(event) => setName(event.target.value)} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2" placeholder="例如 8 月病区排班" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">排班周期</span>
                <select value={periodType} onChange={(event) => setPeriodType(event.target.value as PeriodType)} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
                  {periodTypes.map((item) => <option key={item} value={item}>{PERIOD_TYPE_LABELS[item]}{item === "DAYS_30" ? "（默认）" : ""}</option>)}
                </select>
              </label>
              {["CALENDAR_MONTH", "QUARTER", "HALF_YEAR", "YEAR"].includes(periodType) ? (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">年份</span>
                  <input type="number" value={periodYear} onChange={(event) => setPeriodYear(Number(event.target.value))} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
                </label>
              ) : null}
              {periodType === "CALENDAR_MONTH" ? (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">月份</span>
                  <select value={periodMonth} onChange={(event) => setPeriodMonth(Number(event.target.value))} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
                    {Array.from({ length: 12 }).map((_, index) => <option key={index + 1} value={index + 1}>{index + 1} 月</option>)}
                  </select>
                </label>
              ) : null}
              {periodType === "QUARTER" ? (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">季度</span>
                  <select value={periodQuarter} onChange={(event) => setPeriodQuarter(Number(event.target.value))} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
                    {[1, 2, 3, 4].map((quarter) => <option key={quarter} value={quarter}>Q{quarter}</option>)}
                  </select>
                </label>
              ) : null}
              {periodType === "HALF_YEAR" ? (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">半年</span>
                  <select value={periodHalf} onChange={(event) => setPeriodHalf(Number(event.target.value))} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
                    <option value={1}>上半年</option>
                    <option value={2}>下半年</option>
                  </select>
                </label>
              ) : null}
              <label className="block">
                <span className="text-sm font-medium text-slate-700">开始日期</span>
                <input type="date" value={startDate} disabled={["CALENDAR_MONTH", "QUARTER", "HALF_YEAR", "YEAR"].includes(periodType)} onChange={(event) => updateStartDate(event.target.value)} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">结束日期</span>
                <input type="date" value={endDate} disabled={periodType !== "CUSTOM"} onChange={(event) => setEndDate(event.target.value)} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100" />
                <span className={periodDays > 366 || endDate < startDate ? "mt-1 block text-xs text-red-600" : "mt-1 block text-xs text-slate-500"}>
                  日期范围：{startDate} 至 {endDate}，共 {periodDays} 天
                </span>
              </label>
              {scheduleMode === "MEDTECH_ROOM" ? (
                <div>
                  <span className="text-sm font-medium text-slate-700">医技排班粒度</span>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {(["FULL_DAY", "HALF_DAY"] as ScheduleMode[]).map((item) => (
                      <button type="button" key={item} onClick={() => setMode(item)} className={item === mode ? "focus-ring rounded-md border border-hospital-green bg-teal-50 px-3 py-2 text-sm font-medium text-hospital-green" : "focus-ring rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"}>
                        {MODE_LABELS[item]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-table">
            <h3 className="flex items-center gap-2 font-semibold text-slate-950"><UsersRound size={18} />人员工作池</h3>
            <p className="mt-1 text-sm text-slate-600">
              固定人员来自本科室/病区长期人员。轮转人员为本周期新加入的规培、实习、进修或轮转人员。默认所有固定人员和已确认轮转人员都会加入本次排班，可在下方手动筛选。
            </p>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <PoolPanel
                title="固定人员池"
                desc="默认全部勾选进入本次排班，可单独取消。"
                items={fixedStaff}
                selectedIds={selectedFixedIds}
                setSelectedIds={setSelectedFixedIds}
                onToggle={(id) => toggle(id, "CORE")}
              />
              <PoolPanel
                title="轮转人员池"
                desc="只显示已确认且允许参与排班的轮转人员。"
                items={rotationStaff}
                selectedIds={selectedRotationIds}
                setSelectedIds={setSelectedRotationIds}
                onToggle={(id) => toggle(id, "ROTATION")}
                emptyText={pendingRotationEntries.length ? `有 ${pendingRotationEntries.length} 名轮转人员尚未确认，暂不进入算法。` : "暂无已确认轮转人员。"}
              />
            </div>
          </section>

          {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

          <div className="flex justify-end">
            <button onClick={() => void submit()} disabled={submitting || workPool.length === 0 || endDate < startDate || periodDays > 366 || !name.trim()} className="focus-ring inline-flex items-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300">
              <CalendarPlus size={16} />
              {submitting ? "正在创建..." : "创建任务"}
            </button>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-table">
            <h3 className="font-semibold text-slate-900">本次排班工作池</h3>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-slate-50 p-3"><dt className="text-xs text-slate-500">固定</dt><dd className="mt-1 text-xl font-semibold text-slate-950">{selectedFixedIds.length}</dd></div>
              <div className="rounded-md bg-slate-50 p-3"><dt className="text-xs text-slate-500">轮转</dt><dd className="mt-1 text-xl font-semibold text-slate-950">{selectedRotationIds.length}</dd></div>
              <div className="rounded-md bg-slate-50 p-3"><dt className="text-xs text-slate-500">合计</dt><dd className="mt-1 text-xl font-semibold text-slate-950">{workPool.length}</dd></div>
            </dl>
            <div className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2 top-2.5 text-slate-400" size={15} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索人员/手机号/身份" className="focus-ring w-full rounded-md border border-slate-300 py-2 pl-8 pr-3 text-sm" />
              </div>
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as "ALL" | "CORE" | "ROTATION")} className="focus-ring rounded-md border border-slate-300 px-2 py-2 text-sm">
                <option value="ALL">全部</option>
                <option value="CORE">固定</option>
                <option value="ROTATION">轮转</option>
              </select>
            </div>
            <div className="mt-3 max-h-[420px] space-y-2 overflow-auto">
              {loadingPools ? <div className="rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-500">正在加载人员池...</div> : null}
              {!loadingPools && filteredWorkPool.map((item) => {
                const isRotation = confirmedRotationProfileIds.has(item.id) || item.poolType === "ROTATION";
                return <StaffCard key={item.id} item={item} badge={isRotation ? "轮转" : "固定"} />;
              })}
              {!loadingPools && !filteredWorkPool.length ? <div className="rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-500">当前筛选下暂无人员。</div> : null}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-table">
            <h3 className="font-semibold text-slate-900">工作池规则</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 text-hospital-green" />自动排班只使用本次工作池人员。</li>
              <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 text-hospital-green" />未确认轮转人员不会进入算法。</li>
              <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 text-hospital-green" />成员反馈需身份确认后才生效。</li>
            </ul>
          </section>
        </aside>
      </div>
    </section>
  );
}

function PoolPanel({
  title,
  desc,
  items,
  selectedIds,
  setSelectedIds,
  onToggle,
  emptyText = "暂无人员。"
}: {
  title: string;
  desc: string;
  items: StaffOption[];
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  onToggle: (id: string) => void;
  emptyText?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-slate-950">{title}</h4>
          <p className="mt-1 text-xs text-slate-500">{desc}</p>
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => setSelectedIds(items.map((item) => item.id))} className="focus-ring rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">全选</button>
          <button type="button" onClick={() => setSelectedIds([])} className="focus-ring rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">清空</button>
        </div>
      </div>
      <div className="mt-3 max-h-80 space-y-2 overflow-auto">
        {items.map((item) => (
          <label key={item.id} className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm">
            <input type="checkbox" className="mt-1" checked={selectedIds.includes(item.id)} onChange={() => onToggle(item.id)} />
            <StaffCard item={item} />
          </label>
        ))}
        {!items.length ? <div className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">{emptyText}</div> : null}
      </div>
    </div>
  );
}

function StaffCard({ item, badge }: { item: StaffOption; badge?: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <span className="truncate font-medium text-slate-900">{item.displayName}</span>
        {badge ? <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{badge}</span> : null}
      </div>
      <div className="mt-1 text-xs text-slate-500">{item.phone || "未填写手机号"}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {(item.tagSnapshot ?? []).length ? (item.tagSnapshot ?? []).map((tag) => (
          <span key={tag.id} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-600">{tag.name}</span>
        )) : <span className="text-[11px] text-slate-400">未设置身份/资格</span>}
      </div>
      {item.eligibilitySummary ? <div className="mt-1 text-[11px] text-slate-500">{item.eligibilitySummary}</div> : null}
    </div>
  );
}
