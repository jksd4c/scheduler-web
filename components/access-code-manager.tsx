"use client";

import { KeyRound, Plus, Trash2 } from "lucide-react";
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

  async function loadCodes() {
    const response = await fetch("/api/access-codes", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) {
      setCodes(data.codes);
    }
  }

  useEffect(() => {
    void loadCodes();
  }, []);

  async function createCode() {
    setError("");
    setPlainCode("");
    const response = await fetch("/api/access-codes", { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.message ?? "生成访问密码失败");
      return;
    }
    setPlainCode(data.plainCode);
    await loadCodes();
  }

  async function revokeCode(id: string) {
    if (!window.confirm("确认作废这个访客访问密码吗？")) return;
    const response = await fetch(`/api/access-codes/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.message ?? "作废失败");
      return;
    }
    await loadCodes();
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-table">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">访客访问密码</h3>
          <p className="mt-1 text-sm text-slate-600">密码默认有效 30 天，明文只在生成后显示一次。</p>
        </div>
        <button type="button" onClick={() => void createCode()} className="focus-ring inline-flex items-center gap-2 rounded-md bg-hospital-green px-3 py-2 text-sm font-medium text-white hover:bg-teal-800">
          <Plus size={16} />
          生成访问密码
        </button>
      </div>
      {plainCode ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          本次访问密码：<span className="font-mono text-base font-semibold">{plainCode}</span>
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
            {codes.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  暂无访问密码
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
                    <button type="button" onClick={() => void revokeCode(code.id)} disabled={!code.isActive} className="focus-ring inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                      <Trash2 size={14} />
                      作废
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
