"use client";

import { Save, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

type Tag = { id: string; name: string; category: string; color: string | null };
type Staff = {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  active: boolean;
  tags: Array<{ staffTag: Tag }>;
  tagSnapshot: Tag[];
  eligibilitySummary: string;
};

function emptyForm() {
  return { id: "", displayName: "", phone: "", email: "", note: "", active: true, namesText: "", tagIds: [] as string[] };
}

export function StaffClient() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const editing = Boolean(form.id);

  async function load() {
    const [staffResponse, tagResponse] = await Promise.all([
      fetch("/api/staff", { cache: "no-store" }),
      fetch("/api/staff-tags", { cache: "no-store" })
    ]);
    const staffData = await staffResponse.json();
    const tagData = await tagResponse.json();
    setStaff(staffData.staff ?? []);
    setTags((tagData.tags ?? []).filter((tag: any) => tag.active));
  }

  useEffect(() => {
    void load();
  }, []);

  function toggleTag(tagId: string) {
    setForm((previous) => ({
      ...previous,
      tagIds: previous.tagIds.includes(tagId) ? previous.tagIds.filter((id) => id !== tagId) : [...previous.tagIds, tagId]
    }));
  }

  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const payload = editing
        ? {
            displayName: form.displayName,
            phone: form.phone,
            email: form.email,
            note: form.note,
            active: form.active,
            tagIds: form.tagIds
          }
        : {
            displayName: form.displayName,
            namesText: form.namesText,
            phone: form.phone,
            email: form.email,
            note: form.note,
            active: form.active,
            tagIds: form.tagIds
          };
      const response = await fetch(editing ? `/api/staff/${form.id}` : "/api/staff", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "保存失败");
      setForm(emptyForm());
      await load();
      setMessage("已保存人员");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  function editStaff(item: Staff) {
    setForm({
      id: item.id,
      displayName: item.displayName,
      phone: item.phone ?? "",
      email: item.email ?? "",
      note: item.note ?? "",
      active: item.active,
      namesText: "",
      tagIds: item.tags.map((tag) => tag.staffTag.id)
    });
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">人员管理</h2>
        <p className="mt-1 text-sm text-slate-600">维护本病区人员库，并给人员绑定多个身份/资格。创建排班任务时可从人员库选择参与人员。</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-table">
          <h3 className="flex items-center gap-2 font-semibold text-slate-950">
            <UserPlus size={18} />
            {editing ? "编辑人员" : "新增/批量导入"}
          </h3>
          <div className="mt-4 space-y-3">
            <input className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="姓名" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
            {!editing ? (
              <textarea className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={5} placeholder="批量导入：一行一个姓名，也支持逗号、顿号、空格分隔" value={form.namesText} onChange={(event) => setForm({ ...form, namesText: event.target.value })} />
            ) : null}
            <input className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="手机（可选）" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            <input className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="邮箱（可选）" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            <textarea className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={3} placeholder="备注" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
              启用
            </label>
          </div>

          <div className="mt-5">
            <h4 className="text-sm font-semibold text-slate-800">默认/绑定身份</h4>
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)} className={form.tagIds.includes(tag.id) ? "rounded-full bg-hospital-green px-3 py-1 text-xs text-white" : "rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"}>
                  {tag.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button type="button" onClick={() => setForm(emptyForm())} className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm">清空</button>
            <button disabled={busy || (!form.displayName.trim() && !form.namesText.trim())} onClick={() => void submit()} className="focus-ring inline-flex items-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300">
              <Save size={16} />
              {busy ? "保存中..." : "保存人员"}
            </button>
          </div>
          {message ? <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</div> : null}
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-table">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-3 font-medium">姓名</th>
                <th className="px-3 py-3 font-medium">身份/资格</th>
                <th className="px-3 py-3 font-medium">最终资格摘要</th>
                <th className="px-3 py-3 font-medium">状态</th>
                <th className="px-3 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="border-t border-slate-100 px-3 py-3">
                    <div className="font-medium text-slate-950">{item.displayName}</div>
                    <div className="mt-1 text-xs text-slate-500">{[item.phone, item.email].filter(Boolean).join(" / ")}</div>
                  </td>
                  <td className="border-t border-slate-100 px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {item.tagSnapshot.map((tag) => (
                        <span key={tag.id} className="rounded-full px-2 py-0.5 text-xs text-white" style={{ backgroundColor: tag.color ?? "#64748b" }}>{tag.name}</span>
                      ))}
                    </div>
                  </td>
                  <td className="border-t border-slate-100 px-3 py-3 text-slate-600">{item.eligibilitySummary}</td>
                  <td className="border-t border-slate-100 px-3 py-3">{item.active ? "启用" : "停用"}</td>
                  <td className="border-t border-slate-100 px-3 py-3">
                    <button onClick={() => editStaff(item)} className="focus-ring rounded-md border border-slate-300 px-3 py-1.5 text-xs">编辑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
