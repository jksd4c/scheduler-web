"use client";

import { Save, Timer } from "lucide-react";
import { useEffect, useState } from "react";

type Tag = { id: string; name: string; color: string | null };
type ShiftType = {
  id: string;
  name: string;
  category: string;
  isNight: boolean;
  workloadWeight: number;
  startTime: string | null;
  endTime: string | null;
  color: string | null;
  active: boolean;
  requiredTags: Array<{ staffTagId: string; requirementType: string; staffTag: Tag }>;
  _count?: { requirements: number };
};

const categories = [
  ["DAY", "白班"],
  ["NIGHT", "夜班"],
  ["FIRST_LINE", "一线班"],
  ["SECOND_LINE", "二线班"],
  ["EMERGENCY", "急诊班"],
  ["ON_CALL", "留班"],
  ["BACKUP", "备班"],
  ["CUSTOM", "自定义"]
];

const requirementTypes = [
  ["REQUIRED", "必须具备"],
  ["FORBIDDEN", "禁止具备"],
  ["ALLOWED", "允许范围"]
];

function emptyForm() {
  return {
    id: "",
    name: "",
    category: "DAY",
    isNight: false,
    workloadWeight: 1,
    startTime: "",
    endTime: "",
    color: "#2563eb",
    active: true,
    requiredTags: [] as Array<{ staffTagId: string; requirementType: string }>
  };
}

export function ShiftTypesClient() {
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const editing = Boolean(form.id);

  async function load() {
    setLoading(true);
    try {
      const [shiftResponse, tagResponse] = await Promise.all([
        fetch("/api/shift-types", { cache: "no-store" }),
        fetch("/api/staff-tags", { cache: "no-store" })
      ]);
      const shiftData = await shiftResponse.json();
      const tagData = await tagResponse.json();
      setShiftTypes(shiftData.shiftTypes ?? []);
      setTags((tagData.tags ?? []).filter((tag: any) => tag.active));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function toggleRule(staffTagId: string, requirementType: string) {
    setForm((previous) => {
      const exists = previous.requiredTags.some((rule) => rule.staffTagId === staffTagId && rule.requirementType === requirementType);
      return {
        ...previous,
        requiredTags: exists
          ? previous.requiredTags.filter((rule) => !(rule.staffTagId === staffTagId && rule.requirementType === requirementType))
          : [...previous.requiredTags, { staffTagId, requirementType }]
      };
    });
  }

  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(editing ? `/api/shift-types/${form.id}` : "/api/shift-types", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "保存失败");
      setForm(emptyForm());
      await load();
      setMessage("已保存班次类型");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  function editShift(item: ShiftType) {
    setForm({
      id: item.id,
      name: item.name,
      category: item.category,
      isNight: item.isNight,
      workloadWeight: item.workloadWeight,
      startTime: item.startTime ?? "",
      endTime: item.endTime ?? "",
      color: item.color ?? "#2563eb",
      active: item.active,
      requiredTags: item.requiredTags.map((rule) => ({ staffTagId: rule.staffTagId, requirementType: rule.requirementType }))
    });
  }

  return (
    <section className="space-y-5">
      {loading ? <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">正在加载班次类型...</div> : null}
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">班次身份要求</h2>
        <p className="mt-1 text-sm text-slate-600">配置班次类型，并指定 REQUIRED / FORBIDDEN / ALLOWED 身份规则。排班需求绑定班次后会自动应用这些限制。</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-table">
          <h3 className="flex items-center gap-2 font-semibold text-slate-950">
            <Timer size={18} />
            {editing ? "编辑班次类型" : "新增班次类型"}
          </h3>
          <div className="mt-4 grid gap-3">
            <input className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="班次名称，如 夜班 / 二线班" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <select className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value, isNight: event.target.value === "NIGHT" ? true : form.isNight })}>
              {categories.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="time" className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} />
              <input type="time" className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} className="h-10 rounded-md border border-slate-300" />
              <input type="number" min={0.1} step={0.1} value={form.workloadWeight} onChange={(event) => setForm({ ...form, workloadWeight: Number(event.target.value) })} className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <label className="flex items-center justify-center gap-2 rounded-md border border-slate-300 text-sm">
                <input type="checkbox" checked={form.isNight} onChange={(event) => setForm({ ...form, isNight: event.target.checked })} />
                夜班
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
              启用
            </label>
          </div>

          <div className="mt-5">
            <h4 className="text-sm font-semibold text-slate-800">身份要求</h4>
            <div className="mt-2 space-y-2">
              {tags.map((tag) => (
                <div key={tag.id} className="rounded-md border border-slate-200 p-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color ?? "#64748b" }} />
                    {tag.name}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {requirementTypes.map(([value, label]) => (
                      <label key={value} className="flex items-center gap-1 text-xs text-slate-600">
                        <input type="checkbox" checked={form.requiredTags.some((rule) => rule.staffTagId === tag.id && rule.requirementType === value)} onChange={() => toggleRule(tag.id, value)} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button type="button" onClick={() => setForm(emptyForm())} className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm">清空</button>
            <button disabled={busy || !form.name.trim()} onClick={() => void submit()} className="focus-ring inline-flex items-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300">
              <Save size={16} />
              {busy ? "保存中..." : "保存班次"}
            </button>
          </div>
          {message ? <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</div> : null}
        </div>

        <div className="space-y-3">
          {shiftTypes.map((item) => (
            <button key={item.id} type="button" onClick={() => editShift(item)} className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-table hover:border-hospital-green">
              <div className="flex flex-wrap items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color ?? "#64748b" }} />
                <span className="font-semibold text-slate-950">{item.name}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{categories.find(([value]) => value === item.category)?.[1] ?? item.category}</span>
                {item.isNight ? <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">夜班</span> : null}
                {!item.active ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">停用</span> : null}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">已用于 {item._count?.requirements ?? 0} 条规则</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {item.requiredTags.map((rule) => (
                  <span key={`${rule.staffTagId}:${rule.requirementType}`} className="rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                    {rule.requirementType}: {rule.staffTag.name}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
