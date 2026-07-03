"use client";

import { ArrowLeft, Building2, CalendarPlus, CheckCircle2, Columns3, Moon, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getDateRangeDayCount, getPeriodRange, getTodayDateKey } from "@/lib/date-utils";
import { MODE_LABELS, PERIOD_TYPE_LABELS, TASK_SCHEDULE_MODE_LABELS } from "@/lib/schedule-rules";
import { mergeDoctorNameLists } from "@/lib/name-parser";
import type { ScheduleMode, TaskScheduleMode } from "@/components/schedule-types";
import type { PeriodType } from "@/lib/date-utils";

type StaffOption = {
  id: string;
  displayName: string;
  active: boolean;
  tagSnapshot?: Array<{ id: string; name: string; color?: string | null }>;
  eligibilitySummary?: string;
};

export function NewTaskForm() {
  const router = useRouter();
  const [step, setStep] = useState<"choose" | "form">("choose");
  const todayKey = getTodayDateKey();
  const [scheduleMode, setScheduleMode] = useState<TaskScheduleMode>("WARD_SHIFT");
  const [name, setName] = useState("排班任务");
  const [periodType, setPeriodType] = useState<PeriodType>("DAYS_30");
  const [startDate, setStartDate] = useState(todayKey);
  const [endDate, setEndDate] = useState(getPeriodRange("DAYS_30", todayKey).endDate);
  const [periodYear, setPeriodYear] = useState(Number(todayKey.slice(0, 4)));
  const [periodMonth, setPeriodMonth] = useState(Number(todayKey.slice(5, 7)));
  const [periodQuarter, setPeriodQuarter] = useState(Math.floor((Number(todayKey.slice(5, 7)) - 1) / 3) + 1);
  const [mode, setMode] = useState<ScheduleMode>("FULL_DAY");
  const [residentNames, setResidentNames] = useState("");
  const [internNames, setInternNames] = useState("");
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const parsed = useMemo(() => mergeDoctorNameLists(residentNames, internNames), [residentNames, internNames]);
  const totalDoctors = parsed.residents.length + parsed.interns.length + selectedStaffIds.length;
  const taskMode = scheduleMode === "MEDTECH_ROOM" ? mode : "FULL_DAY";
  const periodDays = getDateRangeDayCount(startDate, endDate);

  useEffect(() => {
    fetch("/api/staff")
      .then((response) => (response.ok ? response.json() : { staff: [] }))
      .then((data) => setStaffOptions((data.staff ?? []).filter((item: StaffOption) => item.active)))
      .catch(() => setStaffOptions([]));
  }, []);

  useEffect(() => {
    if (periodType === "CUSTOM") {
      if (endDate < startDate) setEndDate(startDate);
      return;
    }
    const range = getPeriodRange(periodType, startDate, { year: periodYear, month: periodMonth, quarter: periodQuarter });
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodType, periodYear, periodMonth, periodQuarter]);

  function updateStartDate(value: string) {
    setStartDate(value);
    if (periodType === "DAYS_7" || periodType === "DAYS_30") {
      const range = getPeriodRange(periodType, value);
      setEndDate(range.endDate);
    } else if (periodType === "CUSTOM" && endDate < value) {
      setEndDate(value);
    }
  }

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, periodType, startDate, endDate, mode: taskMode, scheduleMode, residentNames, internNames, staffProfileIds: selectedStaffIds })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "创建失败");
      }
      router.push(`/tasks/${data.task.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "choose") {
    const cards: Array<{
      id: TaskScheduleMode;
      title: string;
      fit: string;
      detail: string;
      recommended?: boolean;
      Icon: typeof Moon;
    }> = [
      {
        id: "WARD_SHIFT",
        title: "病房白班/夜班排班",
        fit: "适用于：临床病区、住院部、ICU、急诊病区、一线/二线、住院总等。",
        detail: "按白班、夜班、一线、二线、留班等班次设置每天需求人数。",
        recommended: true,
        Icon: Moon
      },
      {
        id: "MEDTECH_ROOM",
        title: "医技科室按房间排班",
        fit: "适用于：超声科、内镜中心、放射科、检验窗口、门诊检查室等。",
        detail: "按房间、检查室、窗口或单元数量排班，每个单元设置需要人数。",
        Icon: Columns3
      },
      {
        id: "CUSTOM",
        title: "高级自定义模式",
        fit: "适用于：特殊规则、临时任务、节假日专项、混合班次。",
        detail: "先使用班次矩阵创建需求，后续可在班次类型中继续扩展资格要求。",
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
          <p className="mt-1 text-sm text-slate-600">不同科室的排班逻辑不同，请先选择最接近实际场景的排班模式。后续仍可在规则页面中继续调整。</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {cards.map(({ id, title, fit, detail, recommended, Icon }) => {
            const selected = scheduleMode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setScheduleMode(id)}
                className={
                  selected
                    ? "focus-ring rounded-lg border-2 border-hospital-green bg-teal-50 p-5 text-left shadow-table"
                    : "focus-ring rounded-lg border border-slate-200 bg-white p-5 text-left shadow-table hover:border-hospital-green"
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-lg bg-white p-2 text-hospital-green ring-1 ring-slate-200">
                    <Icon size={22} />
                  </div>
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
          <button
            type="button"
            onClick={() => setStep("form")}
            className="focus-ring inline-flex items-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
          >
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
          <p className="mt-1 text-sm text-slate-600">当前模式：{TASK_SCHEDULE_MODE_LABELS[scheduleMode]}。默认 30 天周期，可切换 7 天、自然月、季度、年度或自定义日期范围。</p>
        </div>
        <button type="button" onClick={() => setStep("choose")} className="focus-ring inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Building2 size={16} />
          重选模式
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-table">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">任务名称</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="例如 8月病区排班"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">排班周期</span>
              <select
                value={periodType}
                onChange={(event) => setPeriodType(event.target.value as PeriodType)}
                className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              >
                {(["DAYS_7", "DAYS_30", "CALENDAR_MONTH", "QUARTER", "YEAR", "CUSTOM"] as PeriodType[]).map((item) => (
                  <option key={item} value={item}>{PERIOD_TYPE_LABELS[item]}{item === "DAYS_30" ? "（默认）" : ""}</option>
                ))}
              </select>
            </label>

            {periodType === "CALENDAR_MONTH" || periodType === "QUARTER" || periodType === "YEAR" ? (
              <label className="block">
                <span className="text-sm font-medium text-slate-700">年份</span>
                <input
                  type="number"
                  value={periodYear}
                  onChange={(event) => setPeriodYear(Number(event.target.value))}
                  className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
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

            <label className="block">
              <span className="text-sm font-medium text-slate-700">开始日期</span>
              <input
                type="date"
                value={startDate}
                disabled={periodType === "CALENDAR_MONTH" || periodType === "QUARTER" || periodType === "YEAR"}
                onChange={(event) => updateStartDate(event.target.value)}
                className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">结束日期</span>
              <input
                type="date"
                value={endDate}
                disabled={periodType !== "CUSTOM"}
                onChange={(event) => setEndDate(event.target.value)}
                className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100"
              />
              <span className={periodDays > 366 || endDate < startDate ? "mt-1 block text-xs text-red-600" : "mt-1 block text-xs text-slate-500"}>
                日期范围：{startDate} 至 {endDate}，共 {periodDays} 天
              </span>
            </label>

            {scheduleMode === "MEDTECH_ROOM" ? (
            <div>
              <span className="text-sm font-medium text-slate-700">排班模式</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(["FULL_DAY", "HALF_DAY"] as ScheduleMode[]).map((item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => setMode(item)}
                    className={
                      item === mode
                        ? "focus-ring rounded-md border border-hospital-green bg-teal-50 px-3 py-2 text-sm font-medium text-hospital-green"
                        : "focus-ring rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    }
                  >
                    {MODE_LABELS[item]}
                  </button>
                ))}
              </div>
            </div>
            ) : (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <div className="font-medium text-slate-800">规则类型</div>
                <div className="mt-1">{scheduleMode === "CUSTOM" ? "自定义班次矩阵" : "病房白班/夜班班次矩阵"}</div>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">人员 A 组名单</span>
              <textarea
                value={residentNames}
                onChange={(event) => setResidentNames(event.target.value)}
                rows={12}
                placeholder="一行一个姓名，也支持逗号、顿号、空格分隔"
                className="focus-ring mt-1 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">人员 B 组名单</span>
              <textarea
                value={internNames}
                onChange={(event) => setInternNames(event.target.value)}
                rows={12}
                placeholder="可填写轮转、临时加入或另一分组人员"
                className="focus-ring mt-1 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">从人员库选择</h3>
                <p className="mt-1 text-xs text-slate-500">所选人员会保存本次身份/策略快照；也可以继续在上方临时输入人员。</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setSelectedStaffIds(staffOptions.map((item) => item.id))} className="focus-ring rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs">
                  选择全部启用人员
                </button>
                <button type="button" onClick={() => setSelectedStaffIds([])} className="focus-ring rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs">
                  清空选择
                </button>
              </div>
            </div>
            <div className="mt-3 grid max-h-72 gap-2 overflow-auto md:grid-cols-2">
              {staffOptions.map((item) => (
                <label key={item.id} className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedStaffIds.includes(item.id)}
                    onChange={(event) =>
                      setSelectedStaffIds((previous) =>
                        event.target.checked ? [...previous, item.id] : previous.filter((id) => id !== item.id)
                      )
                    }
                  />
                  <span>
                    <span className="font-medium text-slate-900">{item.displayName}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {(item.tagSnapshot ?? []).map((tag) => (
                        <span key={tag.id} className="rounded-full px-1.5 py-0.5 text-[11px] text-white" style={{ backgroundColor: tag.color ?? "#64748b" }}>
                          {tag.name}
                        </span>
                      ))}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">{item.eligibilitySummary}</span>
                  </span>
                </label>
              ))}
              {!staffOptions.length ? <div className="text-sm text-slate-500">暂无人员库记录，可先到“人员管理”维护。</div> : null}
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="flex justify-end">
            <button
              onClick={() => void submit()}
              disabled={submitting || totalDoctors === 0 || endDate < startDate || periodDays > 366 || !name.trim()}
              className="focus-ring inline-flex items-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <CalendarPlus size={16} />
              {submitting ? "正在创建..." : "创建任务"}
            </button>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-table">
            <h3 className="font-semibold text-slate-900">名单预览</h3>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">A组</dt>
                <dd className="mt-1 text-xl font-semibold text-slate-950">{parsed.residents.length}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">B组</dt>
                <dd className="mt-1 text-xl font-semibold text-slate-950">{parsed.interns.length}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">合计</dt>
                <dd className="mt-1 text-xl font-semibold text-slate-950">{totalDoctors}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-table">
            <h3 className="font-semibold text-slate-900">解析规则</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li className="flex gap-2">
                <CheckCircle2 size={16} className="mt-0.5 text-hospital-green" />
                支持换行、逗号、顿号、空格分隔。
              </li>
              <li className="flex gap-2">
                <CheckCircle2 size={16} className="mt-0.5 text-hospital-green" />
                自动去除空白并去重。
              </li>
              <li className="flex gap-2">
                <CheckCircle2 size={16} className="mt-0.5 text-hospital-green" />
                同名同时出现在两个名单时，按 A 组处理。
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
