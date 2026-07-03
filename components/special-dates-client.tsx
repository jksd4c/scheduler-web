"use client";

import { CalendarDays, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { addDays, getTodayDateKey, toDateKey } from "@/lib/date-utils";

type SpecialDateType = "PUBLIC_HOLIDAY" | "MAKEUP_WORKDAY" | "CUSTOM_REST_DAY" | "CUSTOM_SPECIAL_DAY";

type SpecialDateItem = {
  id: string;
  date: string;
  dateType: SpecialDateType;
  name: string | null;
  note: string | null;
};

const dateTypeLabels: Record<SpecialDateType, string> = {
  PUBLIC_HOLIDAY: "法定节假日",
  MAKEUP_WORKDAY: "调休上班日",
  CUSTOM_REST_DAY: "自定义休息日",
  CUSTOM_SPECIAL_DAY: "自定义特殊日"
};

const dateTypeBadges: Record<SpecialDateType, string> = {
  PUBLIC_HOLIDAY: "bg-red-50 text-red-700 ring-red-200",
  MAKEUP_WORKDAY: "bg-orange-50 text-orange-700 ring-orange-200",
  CUSTOM_REST_DAY: "bg-purple-50 text-purple-700 ring-purple-200",
  CUSTOM_SPECIAL_DAY: "bg-yellow-50 text-yellow-700 ring-yellow-200"
};

export function SpecialDatesClient() {
  const todayKey = useMemo(() => getTodayDateKey(), []);
  const [startDate, setStartDate] = useState(todayKey);
  const [endDate, setEndDate] = useState(toDateKey(addDays(todayKey, 365)));
  const [items, setItems] = useState<SpecialDateItem[]>([]);
  const [date, setDate] = useState(todayKey);
  const [dateType, setDateType] = useState<SpecialDateType>("PUBLIC_HOLIDAY");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setBusy("load");
    setError("");
    try {
      const response = await fetch(`/api/special-dates?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`, {
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "加载特殊日期失败");
      }
      setItems(data.specialDates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载特殊日期失败");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    void load();
  }, [startDate, endDate]);

  async function save() {
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/special-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, dateType, name, note })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "保存特殊日期失败");
      }
      setName("");
      setNote("");
      setNotice("特殊日期已保存，预览日历会按该类型标记。");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存特殊日期失败");
    } finally {
      setBusy("");
    }
  }

  async function remove(item: SpecialDateItem) {
    const ok = window.confirm(`确认删除 ${item.date} 的${dateTypeLabels[item.dateType]}标记吗？`);
    if (!ok) return;
    setBusy(`delete:${item.id}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/special-dates/${item.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "删除特殊日期失败");
      }
      setNotice("特殊日期已删除。");
      setItems((current) => current.filter((entry) => entry.id !== item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除特殊日期失败");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-table">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-hospital-green">真实日历</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">特殊日期设置</h2>
            <p className="mt-1 text-sm text-slate-600">
              法定节假日和自定义休息日会按休息日统计；调休上班日会按工作日处理。
            </p>
          </div>
          {busy === "load" ? <Loader2 className="animate-spin text-slate-400" size={20} /> : null}
        </div>
      </section>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-table">
        <div className="grid gap-3 md:grid-cols-5">
          <label className="text-sm font-medium text-slate-700">
            日期
            <input type="date" className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            类型
            <select className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={dateType} onChange={(event) => setDateType(event.target.value as SpecialDateType)}>
              {(Object.keys(dateTypeLabels) as SpecialDateType[]).map((type) => (
                <option key={type} value={type}>{dateTypeLabels[type]}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            名称
            <input className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={name} onChange={(event) => setName(event.target.value)} placeholder="如：国庆节" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            备注
            <input className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={note} onChange={(event) => setNote(event.target.value)} placeholder="可选" />
          </label>
          <button type="button" onClick={save} disabled={busy === "save" || !date} className="focus-ring mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">
            {busy === "save" ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {busy === "save" ? "保存中..." : "保存特殊日期"}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-table">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-950"><CalendarDays size={18} /> 已配置日期</h3>
            <p className="mt-1 text-xs text-slate-500">列表按当前查询范围显示。</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-slate-600">
              开始
              <input type="date" className="focus-ring mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label className="text-xs font-medium text-slate-600">
              结束
              <input type="date" className="focus-ring mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">日期</th>
                <th className="px-3 py-2 font-medium">类型</th>
                <th className="px-3 py-2 font-medium">名称</th>
                <th className="px-3 py-2 font-medium">备注</th>
                <th className="px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{item.date}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-1 text-xs ring-1 ${dateTypeBadges[item.dateType]}`}>
                      {dateTypeLabels[item.dateType]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{item.name || "-"}</td>
                  <td className="px-3 py-2 text-slate-500">{item.note || "-"}</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => remove(item)} disabled={busy === `delete:${item.id}`} className="focus-ring inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-60">
                      {busy === `delete:${item.id}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {!items.length ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">当前范围暂无特殊日期。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
