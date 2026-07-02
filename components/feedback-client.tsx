"use client";

import { Loader2, MessageSquarePlus } from "lucide-react";
import { useState } from "react";

type FeedbackItem = {
  id: string;
  type: string;
  title: string;
  content: string;
  pageUrl: string | null;
  contact: string | null;
  status: string;
  createdAt: Date | string;
  user?: { username: string; displayName: string | null };
  hospital?: { name: string } | null;
  department?: { name: string } | null;
  unit?: { name: string } | null;
};

const TYPE_LABELS: Record<string, string> = {
  BUG: "问题反馈",
  FEATURE: "功能建议",
  SCHEDULING_RULE: "排班规则",
  FAIRNESS_REPORT: "公平报告",
  EXPORT: "导出",
  LOGIN: "登录",
  OTHER: "其他"
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "新反馈",
  REVIEWING: "处理中",
  RESOLVED: "已解决",
  REJECTED: "已关闭"
};

export function FeedbackClient({ initialFeedback, admin = false }: { initialFeedback: FeedbackItem[]; admin?: boolean }) {
  const [feedback, setFeedback] = useState(initialFeedback);
  const [type, setType] = useState("BUG");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, title, content, pageUrl, contact })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "提交失败");
      }
      setFeedback((previous) => [data.feedback, ...previous]);
      setTitle("");
      setContent("");
      setPageUrl("");
      setContact("");
      setMessage("反馈已提交。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    setError("");
    setUpdatingStatusId(id);
    try {
      const response = await fetch(`/api/admin/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "更新失败");
      }
      setFeedback((previous) => previous.map((item) => (item.id === id ? data.feedback : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败");
    } finally {
      setUpdatingStatusId("");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {!admin ? (
        <form onSubmit={submit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-table">
          <div>
            <div className="flex items-center gap-2">
              <MessageSquarePlus size={18} className="text-hospital-green" />
              <h2 className="text-lg font-semibold text-slate-950">提交反馈</h2>
            </div>
            <p className="mt-1 text-sm text-slate-600">问题、建议、排班规则和公平报告疑问都可以写在这里。</p>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">类型</span>
            <select value={type} onChange={(event) => setType(event.target.value)} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">标题</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">内容</span>
            <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={6} className="focus-ring mt-1 w-full resize-y rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">页面地址，可选</span>
            <input value={pageUrl} onChange={(event) => setPageUrl(event.target.value)} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">联系方式，可选</span>
            <input value={contact} onChange={(event) => setContact(event.target.value)} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
          {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <button type="submit" disabled={loading || !title.trim() || !content.trim()} className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300">
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {loading ? "提交中" : "提交反馈"}
          </button>
        </form>
      ) : null}

      <section className={admin ? "lg:col-span-2" : ""}>
        {admin && error ? <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-950">{admin ? "全部反馈" : "我的反馈"}</h2>
          </div>
          <div className="table-scroll">
            <table className="min-w-[860px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {admin ? <th className="border-b border-slate-200 px-4 py-3 font-medium">用户</th> : null}
                  <th className="border-b border-slate-200 px-4 py-3 font-medium">类型</th>
                  <th className="border-b border-slate-200 px-4 py-3 font-medium">标题</th>
                  <th className="border-b border-slate-200 px-4 py-3 font-medium">组织</th>
                  <th className="border-b border-slate-200 px-4 py-3 font-medium">状态</th>
                  <th className="border-b border-slate-200 px-4 py-3 font-medium">提交时间</th>
                </tr>
              </thead>
              <tbody>
                {feedback.length === 0 ? (
                  <tr>
                    <td colSpan={admin ? 6 : 5} className="px-4 py-8 text-center text-slate-500">
                      暂无反馈
                    </td>
                  </tr>
                ) : (
                  feedback.map((item) => (
                    <tr key={item.id} className="align-top hover:bg-slate-50">
                      {admin ? <td className="border-b border-slate-100 px-4 py-3">{item.user?.displayName || item.user?.username || "-"}</td> : null}
                      <td className="border-b border-slate-100 px-4 py-3">{TYPE_LABELS[item.type] ?? item.type}</td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <div className="font-medium text-slate-900">{item.title}</div>
                        <div className="mt-1 max-w-xl whitespace-pre-wrap text-xs text-slate-500">{item.content}</div>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-600">
                        {[item.hospital?.name, item.department?.name, item.unit?.name].filter(Boolean).join(" / ") || "-"}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        {admin ? (
                          <select
                            value={item.status}
                            disabled={updatingStatusId === item.id}
                            onChange={(event) => void updateStatus(item.id, event.target.value)}
                            className="focus-ring rounded-md border border-slate-300 px-2 py-1 text-xs disabled:bg-slate-100"
                          >
                            {Object.entries(STATUS_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {updatingStatusId === item.id && value === item.status ? "更新中..." : label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{STATUS_LABELS[item.status] ?? item.status}</span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-600">{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
