"use client";

import { KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

type AccessCodeItem = {
  id: string;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
};

export function AccessCodeManager() {
  const [codes, setCodes] = useState<AccessCodeItem[]>([]);
  const [plainCode, setPlainCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState("");

  async function loadCodes() {
    setLoading(true);
    const response = await fetch("/api/access-codes", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) {
      setCodes(data.codes);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadCodes();
  }, []);

  async function createCode() {
    setError("");
    setPlainCode("");
    setCreating(true);
    try {
      const response = await fetch("/api/access-codes", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "生成查看密码失败");
      }
      setPlainCode(data.plainCode);
      await loadCodes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成查看密码失败");
    } finally {
      setCreating(false);
    }
  }

  async function revokeCode(id: string) {
    if (revokingId || !window.confirm("确认作废这个排班查看密码吗？")) return;
    setError("");
    setRevokingId(id);
    try {
      const response = await fetch(`/api/access-codes/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message ?? "作废失败");
      }
      await loadCodes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "作废失败");
    } finally {
      setRevokingId("");
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-table">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">排班查看密码</h3>
          <p className="mt-1 text-sm text-slate-600">密码默认有效 30 天，明文只在生成后显示一次。</p>
        </div>
        <button type="button" onClick={() => void createCode()} disabled={creating} className="focus-ring inline-flex items-center gap-2 rounded-md bg-hospital-green px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300">
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {creating ? "生成中" : "生成查看密码"}
        </button>
      </div>
      {plainCode ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          本次查看密码：<span className="font-mono text-base font-semibold">{plainCode}</span>
        </div>
      ) : null}
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <div className="table-scroll">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2 font-medium">创建时间</th>
              <th className="border-b border-slate-200 px-3 py-2 font-medium">有效期至</th>
              <th className="border-b border-slate-200 px-3 py-2 font-medium">状态</th>
              <th className="border-b border-slate-200 px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  正在加载查看密码...
                </td>
              </tr>
            ) : codes.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  暂无查看密码
                </td>
              </tr>
            ) : (
              codes.map((code) => (
                <tr key={code.id} className="hover:bg-slate-50">
                  <td className="border-b border-slate-100 px-3 py-2">{new Date(code.createdAt).toLocaleString("zh-CN")}</td>
                  <td className="border-b border-slate-100 px-3 py-2">{new Date(code.expiresAt).toLocaleString("zh-CN")}</td>
                  <td className="border-b border-slate-100 px-3 py-2">
                    <span className="inline-flex items-center gap-1">
                      <KeyRound size={14} />
                      {code.isActive && new Date(code.expiresAt) > new Date() ? "有效" : "已失效"}
                    </span>
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2">
                    <button type="button" onClick={() => void revokeCode(code.id)} disabled={!code.isActive || Boolean(revokingId)} className="focus-ring inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">
                      {revokingId === code.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      {revokingId === code.id ? "作废中" : "作废"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
