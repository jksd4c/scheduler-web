"use client";

import { Loader2, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function JoinForm() {
  const router = useRouter();
  const [form, setForm] = useState({ code: "", name: "", phone: "", username: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "加入失败");
      router.push(data.redirectTo ?? "/member/feedback");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "加入失败");
    } finally {
      setBusy(false);
    }
  }

  function update(field: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-table">
      <div>
        <h2 className="text-xl font-semibold text-slate-950">通过访问码加入</h2>
        <p className="mt-1 text-sm text-slate-600">手机号必填。加入申请提交后，需要排班管理员确认身份，反馈才会生效。</p>
      </div>
      <input className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" placeholder="访问码" value={form.code} onChange={(event) => update("code", event.target.value)} />
      <input className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" placeholder="真实姓名" value={form.name} onChange={(event) => update("name", event.target.value)} />
      <input className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" placeholder="手机号" value={form.phone} onChange={(event) => update("phone", event.target.value)} />
      <input className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" placeholder="用户名" value={form.username} onChange={(event) => update("username", event.target.value)} />
      <input type="password" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" placeholder="密码，至少 8 位" value={form.password} onChange={(event) => update("password", event.target.value)} />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <button disabled={busy || !form.code || !form.name || !form.phone || !form.username || form.password.length < 8} className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
        {busy ? "提交中" : "提交加入申请"}
      </button>
    </form>
  );
}
