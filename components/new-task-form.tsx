"use client";

import { ArrowLeft, CalendarPlus, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getNextMonday, getWeekEndDateKey } from "@/lib/date-utils";
import { MODE_LABELS } from "@/lib/schedule-rules";
import { mergeDoctorNameLists } from "@/lib/name-parser";
import type { ScheduleMode } from "@/components/schedule-types";

export function NewTaskForm() {
  const router = useRouter();
  const [weekStartDate, setWeekStartDate] = useState(getNextMonday());
  const [mode, setMode] = useState<ScheduleMode>("FULL_DAY");
  const [residentNames, setResidentNames] = useState("");
  const [internNames, setInternNames] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const parsed = useMemo(() => mergeDoctorNameLists(residentNames, internNames), [residentNames, internNames]);
  const totalDoctors = parsed.residents.length + parsed.interns.length;

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStartDate, mode, residentNames, internNames })
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

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowLeft size={16} />
            返回任务列表
          </Link>
          <h2 className="mt-3 text-2xl font-semibold text-slate-950">新建排班任务</h2>
          <p className="mt-1 text-sm text-slate-600">输入本次参与排班的人员名单，可按 A/B 分组便于显示和统计。</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-table">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">排班周开始日期</span>
              <input
                type="date"
                value={weekStartDate}
                onChange={(event) => setWeekStartDate(event.target.value)}
                className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
              <span className="mt-1 block text-xs text-slate-500">本周范围：{weekStartDate} 至 {getWeekEndDateKey(weekStartDate)}</span>
            </label>

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

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="flex justify-end">
            <button
              onClick={() => void submit()}
              disabled={submitting || totalDoctors === 0}
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
