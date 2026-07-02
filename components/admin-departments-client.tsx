"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

type HospitalOption = { id: string; name: string; isActive: boolean };

type DepartmentItem = {
  id: string;
  hospitalId: string | null;
  hospital: HospitalOption | null;
  name: string;
  isActive: boolean;
  createdAt: Date | string;
  _count: { users: number; units: number; scheduleTasks: number };
};

export function AdminDepartmentsClient({ departments, hospitals }: { departments: DepartmentItem[]; hospitals: HospitalOption[] }) {
  const [items, setItems] = useState(departments);
  const [name, setName] = useState("");
  const [hospitalId, setHospitalId] = useState(hospitals[0]?.id ?? "");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState("");

  async function createDepartment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCreating(true);
    try {
      const response = await fetch("/api/admin/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, hospitalId })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "创建科室失败");
      }
      setItems((previous) => [...previous, { ...data.department, _count: { users: 0, units: 0, scheduleTasks: 0 } }]);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建科室失败");
    } finally {
      setCreating(false);
    }
  }

  async function toggleDepartment(department: DepartmentItem) {
    setError("");
    setUpdatingId(department.id);
    try {
      const response = await fetch(`/api/admin/departments/${department.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !department.isActive })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "更新科室失败");
      }
      setItems((previous) => previous.map((item) => (item.id === department.id ? { ...item, ...data.department } : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新科室失败");
    } finally {
      setUpdatingId("");
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">科室管理</h2>
        <p className="mt-1 text-sm text-slate-600">科室归属于医院，注册用户只能选择已启用科室。</p>
      </div>
      <form onSubmit={createDepartment} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-table sm:grid-cols-[220px_1fr_auto]">
        <select value={hospitalId} onChange={(event) => setHospitalId(event.target.value)} className="focus-ring rounded-md border border-slate-300 px-3 py-2">
          {hospitals.map((hospital) => (
            <option key={hospital.id} value={hospital.id}>
              {hospital.name}
            </option>
          ))}
        </select>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="科室名称" className="focus-ring rounded-md border border-slate-300 px-3 py-2" />
        <button type="submit" disabled={creating || !name.trim() || !hospitalId} className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300">
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {creating ? "创建中" : "创建科室"}
        </button>
      </form>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
        <div className="table-scroll">
          <table className="min-w-[820px] w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">医院</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">科室</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">状态</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">病区</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">用户</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">排班</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((department) => (
                <tr key={department.id} className="hover:bg-slate-50">
                  <td className="border-b border-slate-100 px-4 py-3">{department.hospital?.name ?? "-"}</td>
                  <td className="border-b border-slate-100 px-4 py-3 font-medium text-slate-900">{department.name}</td>
                  <td className="border-b border-slate-100 px-4 py-3">{department.isActive ? "启用" : "停用"}</td>
                  <td className="border-b border-slate-100 px-4 py-3">{department._count.units}</td>
                  <td className="border-b border-slate-100 px-4 py-3">{department._count.users}</td>
                  <td className="border-b border-slate-100 px-4 py-3">{department._count.scheduleTasks}</td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <button
                      onClick={() => void toggleDepartment(department)}
                      disabled={Boolean(updatingId)}
                      className="focus-ring inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {updatingId === department.id ? <Loader2 size={14} className="animate-spin" /> : null}
                      {updatingId === department.id ? "处理中" : department.isActive ? "停用" : "启用"}
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
