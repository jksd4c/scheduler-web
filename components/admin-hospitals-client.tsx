"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

type HospitalItem = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date | string;
  _count: { departments: number; units: number; users: number; scheduleTasks: number };
};

export function AdminHospitalsClient({ hospitals }: { hospitals: HospitalItem[] }) {
  const [items, setItems] = useState(hospitals);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function createHospital(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/admin/hospitals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.message ?? "创建医院失败");
      return;
    }
    setItems((previous) => [...previous, { ...data.hospital, _count: { departments: 0, units: 0, users: 0, scheduleTasks: 0 } }]);
    setName("");
  }

  async function toggleHospital(hospital: HospitalItem) {
    setError("");
    const response = await fetch(`/api/admin/hospitals/${hospital.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !hospital.isActive })
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.message ?? "更新医院失败");
      return;
    }
    setItems((previous) => previous.map((item) => (item.id === hospital.id ? { ...item, ...data.hospital } : item)));
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">医院管理</h2>
        <p className="mt-1 text-sm text-slate-600">医院由最高管理员维护，注册用户只能选择已有医院。</p>
      </div>
      <form onSubmit={createHospital} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-table sm:flex-row">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="医院名称" className="focus-ring flex-1 rounded-md border border-slate-300 px-3 py-2" />
        <button type="submit" disabled={!name.trim()} className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300">
          <Plus size={16} />
          创建医院
        </button>
      </form>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
        <div className="table-scroll">
          <table className="min-w-[760px] w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">医院</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">状态</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">科室</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">病区</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">用户</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">排班</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((hospital) => (
                <tr key={hospital.id} className="hover:bg-slate-50">
                  <td className="border-b border-slate-100 px-4 py-3 font-medium text-slate-900">{hospital.name}</td>
                  <td className="border-b border-slate-100 px-4 py-3">{hospital.isActive ? "启用" : "停用"}</td>
                  <td className="border-b border-slate-100 px-4 py-3">{hospital._count.departments}</td>
                  <td className="border-b border-slate-100 px-4 py-3">{hospital._count.units}</td>
                  <td className="border-b border-slate-100 px-4 py-3">{hospital._count.users}</td>
                  <td className="border-b border-slate-100 px-4 py-3">{hospital._count.scheduleTasks}</td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <button onClick={() => void toggleHospital(hospital)} className="focus-ring rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white">
                      {hospital.isActive ? "停用" : "启用"}
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
