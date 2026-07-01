"use client";

import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function GuestLoginForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/guest/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "访问密码无效");
      return;
    }
    router.push("/guest/schedule");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-table">
      <div>
        <h2 className="text-xl font-semibold text-slate-950">访客查看排班</h2>
        <p className="mt-1 text-sm text-slate-600">请输入科室管理员提供的访问密码。</p>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">访问密码</span>
        <input value={code} onChange={(event) => setCode(event.target.value)} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono" />
      </label>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <button disabled={loading || !code.trim()} className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:bg-slate-300">
        <LogIn size={16} />
        {loading ? "进入中" : "进入访客模式"}
      </button>
    </form>
  );
}
