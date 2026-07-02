"use client";

import { Save, Tags } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type StaffTag = {
  id: string;
  name: string;
  category: string;
  color: string | null;
  active: boolean;
  sortOrder: number;
  policy: Record<string, any> | null;
  effectiveSummary?: string;
  _count?: { staffProfileTags: number };
};

const categories = [
  ["TITLE", "职称"],
  ["TRAINING", "培训身份"],
  ["DUTY_QUALIFICATION", "值班资格"],
  ["SKILL", "技能"],
  ["CUSTOM", "自定义"]
];

const booleanFields = [
  ["participatesInScheduling", "参与自动排班"],
  ["canWorkDayShift", "可白班"],
  ["canWorkNightShift", "可夜班"],
  ["canWorkWeekend", "可周末"],
  ["canWorkHoliday", "可节假日"],
  ["canWorkFirstLine", "可一线"],
  ["canWorkSecondLine", "可二线"],
  ["canWorkEmergency", "可急诊"],
  ["canWorkOnCall", "可留班"],
  ["canWorkBackup", "可备班"],
  ["canWorkIndependently", "可独立值班"],
  ["allowConsecutiveNightShifts", "允许连续夜班"],
  ["allowDayAndNightSameDay", "允许同日白班+夜班"],
  ["allowDayAfterNightShift", "允许夜班后白班"]
];

const numberFields = [
  ["maxShiftsPerWeek", "每周最多班次"],
  ["maxWorkDaysPerWeek", "每周最多工作日"],
  ["maxShiftsPerMonth", "每月最多班次"],
  ["maxNightShiftsPerMonth", "每月最多夜班"],
  ["maxWeekendShiftsPerMonth", "每月最多周末班"],
  ["maxHolidayShiftsPerMonth", "每月最多节假日班"],
  ["maxConsecutiveWorkDays", "最大连续工作日"],
  ["minRestHoursAfterNightShift", "夜班后最小休息小时"]
];

function emptyForm() {
  return {
    id: "",
    name: "",
    category: "CUSTOM",
    color: "#0f766e",
    active: true,
    sortOrder: 0,
    policy: {
      participatesInScheduling: true,
      workloadFactor: 1
    } as Record<string, any>
  };
}

export function StaffTagsClient() {
  const [tags, setTags] = useState<StaffTag[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const editing = Boolean(form.id);

  async function load() {
    const response = await fetch("/api/staff-tags", { cache: "no-store" });
    const data = await response.json();
    setTags(data.tags ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, StaffTag[]>();
    for (const tag of tags) {
      if (!map.has(tag.category)) map.set(tag.category, []);
      map.get(tag.category)?.push(tag);
    }
    return Array.from(map.entries());
  }, [tags]);

  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(editing ? `/api/staff-tags/${form.id}` : "/api/staff-tags", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "保存失败");
      setForm(emptyForm());
      await load();
      setMessage("已保存身份和策略");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  function setPolicy(field: string, value: any) {
    setForm((previous) => ({ ...previous, policy: { ...previous.policy, [field]: value } }));
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">人员身份与策略</h2>
        <p className="mt-1 text-sm text-slate-600">身份由本病区自定义，可作为显示标签，也可影响自动排班候选池。</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-table">
          <h3 className="flex items-center gap-2 font-semibold text-slate-950">
            <Tags size={18} />
            {editing ? "编辑身份策略" : "新增身份"}
          </h3>
          <div className="mt-4 grid gap-3">
            <input className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="身份名称，如 二线资格" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <select className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
              {categories.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} className="h-10 rounded-md border border-slate-300" />
              <input type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="排序" />
              <label className="flex items-center justify-center gap-2 rounded-md border border-slate-300 text-sm">
                <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
                启用
              </label>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-800">可排班次</h4>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {booleanFields.map(([field, label]) => (
                  <label key={field} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.policy[field] === true}
                      onChange={(event) => setPolicy(field, event.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-800">数量上限</h4>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {numberFields.map(([field, label]) => (
                  <input key={field} type="number" min={0} className="focus-ring rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder={label} value={form.policy[field] ?? ""} onChange={(event) => setPolicy(field, event.target.value === "" ? null : Number(event.target.value))} />
                ))}
              </div>
            </div>
            <label className="block text-sm">
              <span className="font-semibold text-slate-800">工作量系数</span>
              <input type="number" min={0.1} step={0.1} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.policy.workloadFactor ?? 1} onChange={(event) => setPolicy("workloadFactor", Number(event.target.value))} />
            </label>
            <textarea className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={3} placeholder="备注" value={form.policy.note ?? ""} onChange={(event) => setPolicy("note", event.target.value)} />
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button type="button" onClick={() => setForm(emptyForm())} className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm">清空</button>
            <button disabled={busy || !form.name.trim()} onClick={() => void submit()} className="focus-ring inline-flex items-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300">
              <Save size={16} />
              {busy ? "保存中..." : "保存身份"}
            </button>
          </div>
          {message ? <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</div> : null}
        </div>

        <div className="space-y-4">
          {grouped.map(([category, items]) => (
            <div key={category} className="rounded-lg border border-slate-200 bg-white shadow-table">
              <div className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-900">{categories.find(([value]) => value === category)?.[1] ?? category}</div>
              <div className="divide-y divide-slate-100">
                {items.map((tag) => (
                  <button key={tag.id} type="button" onClick={() => setForm({ id: tag.id, name: tag.name, category: tag.category, color: tag.color ?? "#0f766e", active: tag.active, sortOrder: tag.sortOrder, policy: { participatesInScheduling: true, workloadFactor: 1, ...(tag.policy ?? {}) } })} className="w-full px-4 py-3 text-left hover:bg-slate-50">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color ?? "#94a3b8" }} />
                      <span className="font-medium text-slate-950">{tag.name}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{tag._count?.staffProfileTags ?? 0} 人</span>
                      {!tag.active ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">停用</span> : null}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{tag.effectiveSummary}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
