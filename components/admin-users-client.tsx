"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

const USER_ROLE = {
  SUPER_ADMIN: "SUPER_ADMIN",
  SCHEDULER_ADMIN: "SCHEDULER_ADMIN",
  MEMBER: "MEMBER"
} as const;

function roleLabel(role: string) {
  if (role === "SUPER_ADMIN") return "最高管理员";
  if (role === "SCHEDULER_ADMIN" || role === "DEPARTMENT_ADMIN") return "排班管理员";
  if (role === "MEMBER") return "成员";
  return role;
}

type UnitOption = {
  id: string;
  name: string;
  hospital: { name: string } | null;
  department: { name: string } | null;
};

type UserItem = {
  id: string;
  username: string;
  displayName: string | null;
  phone: string | null;
  email: string | null;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date | string;
  lastLoginAt: Date | string | null;
  hospital: { name: string } | null;
  department: { name: string } | null;
  unit: { id: string; name: string } | null;
  _count?: { createdTasks?: number; feedback?: number };
};

export function AdminUsersClient({ users, units }: { users: UserItem[]; units: UnitOption[] }) {
  const [items, setItems] = useState(users);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>(USER_ROLE.SCHEDULER_ADMIN);
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState("");

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCreating(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, displayName, password, role, unitId })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "创建用户失败");
      }
      setItems((previous) => [...previous, data.user]);
      setUsername("");
      setDisplayName("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建用户失败");
    } finally {
      setCreating(false);
    }
  }

  async function updateUser(id: string, payload: Record<string, unknown>) {
    setError("");
    setUpdatingUserId(id);
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "更新用户失败");
      }
      setItems((previous) => previous.map((item) => (item.id === id ? { ...item, ...data.user } : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新用户失败");
    } finally {
      setUpdatingUserId("");
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">用户管理</h2>
        <p className="mt-1 text-sm text-slate-600">查看测试服用户，创建排班管理员或成员账号，调整账号状态。</p>
      </div>

      <form onSubmit={createUser} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-table lg:grid-cols-[1fr_1fr_1fr_180px_260px_auto]">
        <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="用户名" className="focus-ring rounded-md border border-slate-300 px-3 py-2" />
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="显示姓名" className="focus-ring rounded-md border border-slate-300 px-3 py-2" />
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="初始密码" className="focus-ring rounded-md border border-slate-300 px-3 py-2" />
        <select value={role} onChange={(event) => setRole(event.target.value)} className="focus-ring rounded-md border border-slate-300 px-3 py-2">
          <option value={USER_ROLE.SCHEDULER_ADMIN}>排班管理员</option>
          <option value={USER_ROLE.MEMBER}>成员</option>
          <option value={USER_ROLE.SUPER_ADMIN}>最高管理员</option>
        </select>
        <select value={unitId} onChange={(event) => setUnitId(event.target.value)} disabled={role === USER_ROLE.SUPER_ADMIN} className="focus-ring rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100">
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {[unit.hospital?.name, unit.department?.name, unit.name].filter(Boolean).join(" / ")}
            </option>
          ))}
        </select>
        <button type="submit" disabled={creating || !username.trim() || password.length < 8 || (role !== USER_ROLE.SUPER_ADMIN && !unitId)} className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300">
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {creating ? "创建中" : "创建"}
        </button>
      </form>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
        <div className="table-scroll">
          <table className="min-w-[1080px] w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">用户</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">联系方式</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">角色</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">组织</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">状态</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">排班/反馈</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">最近登录</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="border-b border-slate-100 px-4 py-3">
                    <div className="font-medium text-slate-900">{user.displayName || user.username}</div>
                    <div className="text-xs text-slate-500">{user.username}</div>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3 text-xs text-slate-600">
                    <div>{user.phone || "-"}</div>
                    <div>{user.email || "-"}</div>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3">{roleLabel(user.role)}</td>
                  <td className="border-b border-slate-100 px-4 py-3">{[user.hospital?.name, user.department?.name, user.unit?.name].filter(Boolean).join(" / ") || "全部"}</td>
                  <td className="border-b border-slate-100 px-4 py-3">{user.isActive ? "启用" : "停用"}</td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    {(user._count?.createdTasks ?? 0)} / {(user._count?.feedback ?? 0)}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3 text-slate-600">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("zh-CN") : "-"}</td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <button
                      onClick={() => void updateUser(user.id, { isActive: !user.isActive })}
                      disabled={Boolean(updatingUserId)}
                      className="focus-ring inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {updatingUserId === user.id ? <Loader2 size={14} className="animate-spin" /> : null}
                      {updatingUserId === user.id ? "处理中" : user.isActive ? "停用" : "启用"}
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
