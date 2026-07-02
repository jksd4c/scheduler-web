"use client";

import { Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";

type Feedback = {
  id: string;
  title: string | null;
  message: string | null;
  status: string;
  effective: boolean;
  anomalyStatus: string | null;
  createdAt: string;
  unavailableTimes: Array<{ id: string; date: string; timeSlot: string; reason: string | null }>;
};

const statusLabels: Record<string, string> = {
  WAITING_IDENTITY_CONFIRMATION: "身份未确认，暂不生效",
  ACTIVE: "已生效",
  NEEDS_REVIEW: "异常待审核",
  APPROVED: "管理员已通过",
  REJECTED: "已驳回"
};

export function MemberFeedbackClient() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [date, setDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("FULL_DAY");
  const [reason, setReason] = useState("");
  const [unavailableTimes, setUnavailableTimes] = useState<Array<{ date: string; timeSlot: string; reason: string }>>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    const response = await fetch("/api/member-feedback", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setItems(data.feedback ?? []);
  }
  useEffect(() => { void load(); }, []);

  function addUnavailable() {
    if (!date) return;
    setUnavailableTimes((previous) => [...previous, { date, timeSlot, reason }]);
    setDate("");
    setReason("");
  }

  async function submit() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/member-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "成员排班反馈", message, unavailableTimes })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "提交失败");
      setUnavailableTimes([]);
      setMessage("");
      setNotice("反馈已提交。身份确认或管理员审核通过后才会进入排班。");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-table">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">我的排班反馈</h2>
          <p className="mt-1 text-sm text-slate-600">只能填写硬性不可排、可承担班次和留言。不提供“想少排”等结构化选项。</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <select value={timeSlot} onChange={(event) => setTimeSlot(event.target.value)} className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="FULL_DAY">全天</option>
            <option value="MORNING">上午</option>
            <option value="AFTERNOON">下午</option>
          </select>
        </div>
        <input value={reason} onChange={(event) => setReason(event.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="原因，可选" />
        <button type="button" onClick={addUnavailable} disabled={!date} className="focus-ring rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40">添加不可排</button>
        <div className="space-y-1 text-sm text-slate-600">
          {unavailableTimes.map((item, index) => <div key={`${item.date}:${item.timeSlot}:${index}`} className="rounded-md bg-slate-50 px-3 py-2">{item.date} {item.timeSlot} {item.reason}</div>)}
        </div>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="留言说明；如果不可排较多，必须说明原因" />
        <button onClick={() => void submit()} disabled={busy || (!unavailableTimes.length && !message.trim())} className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {busy ? "提交中" : "提交反馈"}
        </button>
        {notice ? <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{notice}</div> : null}
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-950">反馈状态</div>
        <div className="table-scroll">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600"><tr>{["提交时间", "不可排", "状态", "是否生效", "异常"].map((h) => <th key={h} className="border-b border-slate-200 px-3 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>{items.length ? items.map((item) => <tr key={item.id} className="align-top">
              <td className="border-b border-slate-100 px-3 py-3">{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
              <td className="border-b border-slate-100 px-3 py-3">{item.unavailableTimes.map((u) => `${new Date(u.date).toISOString().slice(0, 10)} ${u.timeSlot}`).join("；") || "-"}</td>
              <td className="border-b border-slate-100 px-3 py-3">{statusLabels[item.status] ?? item.status}</td>
              <td className="border-b border-slate-100 px-3 py-3">{item.effective ? "是" : "否"}</td>
              <td className="border-b border-slate-100 px-3 py-3">{item.anomalyStatus || "无"}</td>
            </tr>) : <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">暂无反馈</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
