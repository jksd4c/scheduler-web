"use client";

import { Building2, Plus, Power } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type DepartmentItem = {
  id: string;
  name: string;
  isActive: boolean;
  _count?: { users: number; scheduleTasks: number };
};

export function AdminDepartmentsClient({ departments }: { departments: DepartmentItem[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loadingId, setLoadingId] = useState("");

  async function createDepartment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/admin/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.message ?? "创建科室失败");
      return;
    }
    setName("");
    router.refresh();
  }

  async function toggleDepartment(department: DepartmentItem) {
    setLoadingId(department.id);
    setError("");
    const response = await fetch(`/api/admin/departments/${department.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !department.isActive })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.message ?? "更新科室失败");
    }
    setLoadingId("");
    router.refresh();
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">科室管理</h2>
        <p className="mt-1 text-sm text-slate-600">创建科室，并控制科室是否可用。</p>
      </div>
      <form onSubmit={createDepartment} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-table sm:flex-row">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="科室名称"
          className="focus-ring flex-1 rounded-md border border-slate-300 px-3 py-2"
        />
        <button
          disabled={!name.trim()}
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:bg-slate-300"
        >
          <Plus size={16} />
          创建科室
        </button>
      </form>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="border-b border-slate-200 px-4 py-3 font-medium">科室</th>
              <th className="border-b border-slate-200 px-4 py-3 font-medium">状态</th>
              <th className="border-b border-slate-200 px-4 py-3 font-medium">用户数</th>
              <th className="border-b border-slate-200 px-4 py-3 font-medium">排班任务</th>
              <th className="border-b border-slate-200 px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((department) => (
              <tr key={department.id} className="hover:bg-slate-50">
                <td className="border-b border-slate-100 px-4 py-3 font-medium text-slate-900">
                  <span className="inline-flex items-center gap-2">
                    <Building2 size={16} className="text-hospital-green" />
                    {department.name}
                  </span>
                </td>
                <td className="border-b border-slate-100 px-4 py-3">{department.isActive ? "启用" : "停用"}</td>
                <td className="border-b border-slate-100 px-4 py-3">{department._count?.users ?? 0}</td>
                <td className="border-b border-slate-100 px-4 py-3">{department._count?.scheduleTasks ?? 0}</td>
                <td className="border-b border-slate-100 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void toggleDepartment(department)}
                    disabled={loadingId === department.id}
                    className="focus-ring inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-60"
                  >
                    <Power size={14} />
                    {department.isActive ? "停用" : "启用"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
