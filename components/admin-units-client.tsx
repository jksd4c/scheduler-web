"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

type DepartmentOption = { id: string; name: string; hospital?: { name: string } | null };
type UnitItem = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date | string;
  hospital: { name: string } | null;
  department: { name: string } | null;
  createdByUser: { username: string; displayName: string | null } | null;
  _count: { users: number; scheduleTasks: number };
};

export function AdminUnitsClient({ units, departments }: { units: UnitItem[]; departments: DepartmentOption[] }) {
  const [items, setItems] = useState(units);
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState("");

  async function createUnit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCreating(true);
    try {
      const response = await fetch("/api/admin/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId, name })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "创建病区/小组失败");
      }
      setItems((previous) => [...previous, { ...data.unit, _count: { users: 0, scheduleTasks: 0 } }]);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建病区/小组失败");
    } finally {
      setCreating(false);
    }
  }

  async function toggleUnit(unit: UnitItem) {
    setError("");
    setUpdatingId(unit.id);
    try {
      const response = await fetch(`/api/admin/units/${unit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !unit.isActive })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "更新病区/小组失败");
      }
      setItems((previous) => previous.map((item) => (item.id === unit.id ? { ...item, ...data.unit } : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新病区/小组失败");
    } finally {
      setUpdatingId("");
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">病区/小组管理</h2>
        <p className="mt-1 text-sm text-slate-600">测试服注册用户可在已有医院和科室下创建自己的病区/小组。</p>
      </div>
      <form onSubmit={createUnit} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-table sm:grid-cols-[260px_1fr_auto]">
        <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} className="focus-ring rounded-md border border-slate-300 px-3 py-2">
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {[department.hospital?.name, department.name].filter(Boolean).join(" / ")}
            </option>
          ))}
        </select>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="病区/小组名称" className="focus-ring rounded-md border border-slate-300 px-3 py-2" />
        <button type="submit" disabled={creating || !name.trim() || !departmentId} className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300">
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {creating ? "创建中" : "创建病区"}
        </button>
      </form>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
        <div className="table-scroll">
          <table className="min-w-[900px] w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">医院 / 科室</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">病区/小组</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">创建者</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">用户</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">排班</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">状态</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((unit) => (
                <tr key={unit.id} className="hover:bg-slate-50">
                  <td className="border-b border-slate-100 px-4 py-3">{[unit.hospital?.name, unit.department?.name].filter(Boolean).join(" / ") || "-"}</td>
                  <td className="border-b border-slate-100 px-4 py-3 font-medium text-slate-900">{unit.name}</td>
                  <td className="border-b border-slate-100 px-4 py-3">{unit.createdByUser?.displayName || unit.createdByUser?.username || "-"}</td>
                  <td className="border-b border-slate-100 px-4 py-3">{unit._count.users}</td>
                  <td className="border-b border-slate-100 px-4 py-3">{unit._count.scheduleTasks}</td>
                  <td className="border-b border-slate-100 px-4 py-3">{unit.isActive ? "启用" : "停用"}</td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <button
                      onClick={() => void toggleUnit(unit)}
                      disabled={Boolean(updatingId)}
                      className="focus-ring inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {updatingId === unit.id ? <Loader2 size={14} className="animate-spin" /> : null}
                      {updatingId === unit.id ? "处理中" : unit.isActive ? "停用" : "启用"}
                    </button>
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
