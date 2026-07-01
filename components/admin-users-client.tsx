"use client";

import { KeyRound, Plus, Power, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type DepartmentOption = { id: string; name: string; isActive: boolean };
type UserItem = {
  id: string;
  username: string;
  role: string;
  departmentId: string | null;
  department: DepartmentOption | null;
  isActive: boolean;
  mustChangePassword: boolean;
};

export function AdminUsersClient({ users, departments }: { users: UserItem[]; departments: DepartmentOption[] }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [error, setError] = useState("");

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        role: "DEPARTMENT_ADMIN",
        departmentId,
        mustChangePassword: true
      })
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.message ?? "创建用户失败");
      return;
    }
    setUsername("");
    setPassword("");
    router.refresh();
  }

  async function patchUser(userId: string, body: Record<string, unknown>) {
    setError("");
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.message ?? "更新用户失败");
    }
    router.refresh();
  }

  async function resetPassword(user: UserItem) {
    const password = window.prompt(`请输入 ${user.username} 的新密码，至少 8 位`);
    if (!password) return;
    if (password.length < 8) {
      window.alert("新密码至少 8 位");
      return;
    }
    await patchUser(user.id, { password, mustChangePassword: true });
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">用户管理</h2>
        <p className="mt-1 text-sm text-slate-600">创建科室管理员，重置密码，调整账号状态和所属科室。</p>
      </div>
      <form onSubmit={createUser} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-table lg:grid-cols-[1fr_1fr_1fr_auto]">
        <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="用户名" className="focus-ring rounded-md border border-slate-300 px-3 py-2" />
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="初始密码" className="focus-ring rounded-md border border-slate-300 px-3 py-2" />
        <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} className="focus-ring rounded-md border border-slate-300 px-3 py-2">
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
        <button disabled={!username.trim() || password.length < 8 || !departmentId} className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:bg-slate-300">
          <Plus size={16} />
          创建管理员
        </button>
      </form>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <div className="table-scroll overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="border-b border-slate-200 px-4 py-3 font-medium">用户名</th>
              <th className="border-b border-slate-200 px-4 py-3 font-medium">角色</th>
              <th className="border-b border-slate-200 px-4 py-3 font-medium">科室</th>
              <th className="border-b border-slate-200 px-4 py-3 font-medium">状态</th>
              <th className="border-b border-slate-200 px-4 py-3 font-medium">首次改密</th>
              <th className="border-b border-slate-200 px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50">
                <td className="border-b border-slate-100 px-4 py-3 font-medium text-slate-900">{user.username}</td>
                <td className="border-b border-slate-100 px-4 py-3">{user.role === "SUPER_ADMIN" ? "最高管理员" : "科室管理员"}</td>
                <td className="border-b border-slate-100 px-4 py-3">
                  {user.role === "SUPER_ADMIN" ? (
                    "全部科室"
                  ) : (
                    <select
                      value={user.departmentId ?? ""}
                      onChange={(event) => void patchUser(user.id, { departmentId: event.target.value })}
                      className="focus-ring rounded-md border border-slate-300 px-2 py-1"
                    >
                      {departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="border-b border-slate-100 px-4 py-3">{user.isActive ? "启用" : "停用"}</td>
                <td className="border-b border-slate-100 px-4 py-3">{user.mustChangePassword ? "是" : "否"}</td>
                <td className="border-b border-slate-100 px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void patchUser(user.id, { isActive: !user.isActive })} className="focus-ring inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-white">
                      <Power size={14} />
                      {user.isActive ? "停用" : "启用"}
                    </button>
                    <button type="button" onClick={() => void resetPassword(user)} className="focus-ring inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-white">
                      <KeyRound size={14} />
                      重置密码
                    </button>
                    <button type="button" onClick={() => void patchUser(user.id, { mustChangePassword: !user.mustChangePassword })} className="focus-ring inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-white">
                      <Save size={14} />
                      {user.mustChangePassword ? "取消改密" : "要求改密"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
