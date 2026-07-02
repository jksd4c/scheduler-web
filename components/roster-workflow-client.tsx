"use client";

import { Ban, Copy, History, Link2, Loader2, Plus, RefreshCw, Save, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { Fragment, useEffect, useState } from "react";

type TaskOption = { id: string; weekStartDate: string; weekEndDate: string; unit?: { name: string } | null };
type Pool = { id: string; name: string; poolType: string; active: boolean; startDate?: string | null; endDate?: string | null };
type RosterEntry = {
  id: string;
  expectedName: string;
  expectedPhone: string | null;
  staffType: string | null;
  poolType: string;
  status: string;
  includeInScheduling: boolean;
  userId?: string | null;
};
type JoinCode = {
  id: string;
  purpose: string;
  hospitalName: string;
  departmentName: string;
  unitName: string;
  scheduleTaskId: string | null;
  scheduleTaskLabel: string | null;
  staffPoolId: string | null;
  staffPoolLabel: string | null;
  codeValue: string | null;
  codeUnavailableReason: string | null;
  expiresAt: string;
  active: boolean;
  useCount: number;
  maxUses: number | null;
  createdByName: string;
  createdAt: string;
  revokedAt: string | null;
  usageRecords: Array<{ id: string; inputName: string; inputPhone: string; matchStatus: string; reviewStatus: string; createdAt: string }>;
};
type Claim = { id: string; rosterEntryId: string | null; userId: string; inputName: string; inputPhone: string; matchStatus: string; reviewStatus: string; createdAt: string; rejectReason: string | null };
type UserSummary = { id: string; username: string; displayName: string | null; phone: string | null };
type RosterSummary = Pick<RosterEntry, "id" | "expectedName" | "expectedPhone" | "staffType" | "poolType" | "status" | "includeInScheduling">;
type MemberFeedback = {
  id: string;
  userId: string;
  rosterEntryId?: string | null;
  title: string | null;
  message: string | null;
  status: string;
  effective: boolean;
  anomalyStatus: string | null;
  createdAt: string;
  unavailableTimes?: Array<{ id: string; date: string; timeSlot: string; reason: string | null }>;
};

const poolLabels: Record<string, string> = { CORE: "固定人员池", ROTATION: "轮转人员池" };
const statusLabels: Record<string, string> = {
  WAITING_JOIN: "待加入",
  CLAIMED: "已申请",
  CONFIRMED: "已确认",
  REJECTED: "已驳回",
  NO_SHOW: "未报到",
  PENDING: "待审核",
  APPROVED: "已通过",
  EXACT: "完全匹配",
  PHONE_MATCH: "手机号匹配",
  NAME_MATCH: "姓名匹配",
  FUZZY: "模糊匹配",
  UNMATCHED: "未匹配",
  WAITING_IDENTITY_CONFIRMATION: "身份未确认",
  ACTIVE: "已生效",
  NEEDS_REVIEW: "待审核",
  REJECTED_FEEDBACK: "已驳回"
};

export function StaffPoolsClient() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [name, setName] = useState("");
  const [poolType, setPoolType] = useState("CORE");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    const data = await fetchJson("/api/staff-pools");
    setPools(data.pools ?? []);
  }
  useEffect(() => { void load(); }, []);
  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const data = await postJson("/api/staff-pools", { name, poolType, startDate, endDate });
      setPools((previous) => [data.pool, ...previous]);
      setName("");
      setMessage("人员池已创建");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5">
      <Header title="人员池" desc="区分本科室固定人员池和本周期轮转人员池，轮转人员可设置起止日期。" />
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-table">
          <h3 className="font-semibold text-slate-950">新建人员池</h3>
          <div className="mt-4 space-y-3">
            <input className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="名称，如 8月轮转规培" value={name} onChange={(event) => setName(event.target.value)} />
            <select className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={poolType} onChange={(event) => setPoolType(event.target.value)}>
              <option value="CORE">固定人员池</option>
              <option value="ROTATION">轮转人员池</option>
            </select>
            <input type="date" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            <input type="date" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            <button onClick={() => void submit()} disabled={busy || !name.trim()} className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {busy ? "创建中" : "创建人员池"}
            </button>
            {message ? <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</div> : null}
          </div>
        </div>
        <SimpleTable headers={["名称", "类型", "起止日期", "状态"]} rows={pools.map((pool) => [pool.name, poolLabels[pool.poolType] ?? pool.poolType, [pool.startDate?.slice(0, 10), pool.endDate?.slice(0, 10)].filter(Boolean).join(" 至 ") || "-", pool.active ? "启用" : "停用"])} />
      </div>
    </section>
  );
}

export function RosterClient() {
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [scheduleTaskId, setScheduleTaskId] = useState("");
  const [staffPoolId, setStaffPoolId] = useState("");
  const [poolType, setPoolType] = useState("ROTATION");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyEntryId, setBusyEntryId] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    const [tasksData, poolsData, rosterData] = await Promise.all([fetchJson("/api/tasks?pageSize=50"), fetchJson("/api/staff-pools"), fetchJson(`/api/roster${scheduleTaskId ? `?scheduleTaskId=${scheduleTaskId}` : ""}`)]);
    setTasks(tasksData.tasks ?? []);
    setPools(poolsData.pools ?? []);
    setEntries(rosterData.entries ?? []);
  }
  useEffect(() => { void load(); }, [scheduleTaskId]);
  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const data = await postJson("/api/roster", { scheduleTaskId, staffPoolId, poolType, text });
      setEntries((previous) => [...previous, ...(data.entries ?? [])]);
      setText("");
      setMessage(`已导入 ${data.entries?.length ?? 0} 人`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }
  async function updateEntry(id: string, body: Record<string, unknown>) {
    setBusyEntryId(id);
    setMessage("");
    try {
      await patchJson(`/api/roster/${id}`, body);
      await load();
      setMessage("预录名单已更新");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新失败");
    } finally {
      setBusyEntryId("");
    }
  }
  return (
    <section className="space-y-5">
      <Header title="预录名单" desc="批量录入固定人员或本月轮转人员。轮转人员加入后仍需管理员确认才会纳入排班。" />
      <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-table">
          <h3 className="font-semibold text-slate-950">批量导入</h3>
          <div className="mt-4 space-y-3">
            <select className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={scheduleTaskId} onChange={(event) => setScheduleTaskId(event.target.value)}>
              <option value="">不绑定任务</option>
              {tasks.map((task) => <option key={task.id} value={task.id}>{new Date(task.weekStartDate).toISOString().slice(0, 10)} 至 {new Date(task.weekEndDate).toISOString().slice(0, 10)}</option>)}
            </select>
            <select className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={staffPoolId} onChange={(event) => setStaffPoolId(event.target.value)}>
              <option value="">不绑定人员池</option>
              {pools.map((pool) => <option key={pool.id} value={pool.id}>{pool.name}（{poolLabels[pool.poolType]}）</option>)}
            </select>
            <select className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={poolType} onChange={(event) => setPoolType(event.target.value)}>
              <option value="CORE">固定人员池</option>
              <option value="ROTATION">轮转人员池</option>
            </select>
            <textarea className="focus-ring h-48 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={"张三 13800000001 规培医生\n李四 13900000002 实习医生"} value={text} onChange={(event) => setText(event.target.value)} />
            <button onClick={() => void submit()} disabled={busy || !text.trim()} className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {busy ? "导入中" : "导入预录名单"}
            </button>
            {message ? <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</div> : null}
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
          <div className="table-scroll">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>{["姓名", "手机号", "人员池", "身份", "状态", "纳入排班", "操作"].map((header) => <th key={header} className="border-b border-slate-200 px-3 py-3 font-medium">{header}</th>)}</tr>
              </thead>
              <tbody>
                {entries.length ? entries.map((entry) => {
                  const canInclude = entry.status === "CONFIRMED";
                  const isBusy = busyEntryId === entry.id;
                  return (
                    <tr key={entry.id}>
                      <td className="border-b border-slate-100 px-3 py-3">{entry.expectedName}</td>
                      <td className="border-b border-slate-100 px-3 py-3">{entry.expectedPhone || "-"}</td>
                      <td className="border-b border-slate-100 px-3 py-3">{poolLabels[entry.poolType] ?? entry.poolType}</td>
                      <td className="border-b border-slate-100 px-3 py-3">{entry.staffType || "-"}</td>
                      <td className="border-b border-slate-100 px-3 py-3">{statusLabels[entry.status] ?? entry.status}</td>
                      <td className="border-b border-slate-100 px-3 py-3">{entry.includeInScheduling ? "是" : "否"}</td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            disabled={isBusy || (!entry.includeInScheduling && !canInclude)}
                            onClick={() => void updateEntry(entry.id, { includeInScheduling: !entry.includeInScheduling })}
                            className="focus-ring rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-700 disabled:opacity-40"
                          >
                            {entry.includeInScheduling ? "移出排班" : "纳入排班"}
                          </button>
                          <button
                            disabled={isBusy || entry.status === "NO_SHOW"}
                            onClick={() => void updateEntry(entry.id, { status: "NO_SHOW" })}
                            className="focus-ring rounded-md border border-amber-200 px-2 py-1.5 text-xs text-amber-700 disabled:opacity-40"
                          >
                            未报到
                          </button>
                          <button
                            disabled={isBusy || entry.status === "REJECTED"}
                            onClick={() => void updateEntry(entry.id, { status: "REJECTED" })}
                            className="focus-ring rounded-md border border-red-200 px-2 py-1.5 text-xs text-red-700 disabled:opacity-40"
                          >
                            驳回
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }) : <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">暂无预录名单</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

export function JoinCodesClient() {
  const [codes, setCodes] = useState<JoinCode[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [plainCode, setPlainCode] = useState("");
  const [scheduleTaskId, setScheduleTaskId] = useState("");
  const [staffPoolId, setStaffPoolId] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyCodeId, setBusyCodeId] = useState("");
  const [expandedCodeId, setExpandedCodeId] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    const [codesData, tasksData, poolsData] = await Promise.all([fetchJson("/api/join-codes"), fetchJson("/api/tasks?pageSize=50"), fetchJson("/api/staff-pools")]);
    setCodes(codesData.codes ?? []);
    setTasks(tasksData.tasks ?? []);
    setPools(poolsData.pools ?? []);
  }
  useEffect(() => { void load(); }, []);
  async function createCode() {
    setBusy(true);
    setPlainCode("");
    setMessage("");
    try {
      const data = await postJson("/api/join-codes", { scheduleTaskId, staffPoolId });
      setPlainCode(data.plainCode);
      await load();
      setMessage("访问码已生成，后续可在列表中再次复制。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成失败");
    } finally {
      setBusy(false);
    }
  }
  async function copyToClipboard(id: string, text: string, action: "COPY_CODE" | "COPY_LINK") {
    setBusyCodeId(id);
    setMessage("");
    try {
      await writeClipboard(text);
      await patchJson(`/api/join-codes/${id}`, { action });
      setMessage(action === "COPY_CODE" ? "访问码已复制" : "加入链接已复制");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "复制失败");
    } finally {
      setBusyCodeId("");
    }
  }
  async function regenerateCode(id: string) {
    if (!window.confirm("确认重新生成这个访问码吗？旧访问码会立即失效，新访问码有效期重新计算 35 天。")) return;
    setBusyCodeId(id);
    setPlainCode("");
    setMessage("");
    try {
      const data = await patchJson(`/api/join-codes/${id}`, { action: "REGENERATE" });
      setPlainCode(data.plainCode ?? "");
      await load();
      setMessage("访问码已重新生成，可在列表中复制新码。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重新生成失败");
    } finally {
      setBusyCodeId("");
    }
  }
  async function revokeCode(id: string) {
    if (!window.confirm("确认作废这个访问码吗？作废后成员不能再用它申请加入。")) return;
    setBusyCodeId(id);
    setMessage("");
    try {
      await deleteJson(`/api/join-codes/${id}`);
      await load();
      setMessage("访问码已作废");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "作废失败");
    } finally {
      setBusyCodeId("");
    }
  }
  return (
    <section className="space-y-5">
      <Header title="访问码管理" desc="访问码用于成员申请加入，默认 35 天有效；新访问码可在后台再次查看和复制。" />
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-table">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <select value={scheduleTaskId} onChange={(event) => setScheduleTaskId(event.target.value)} className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">不绑定任务</option>
            {tasks.map((task) => <option key={task.id} value={task.id}>{new Date(task.weekStartDate).toISOString().slice(0, 10)} 至 {new Date(task.weekEndDate).toISOString().slice(0, 10)}</option>)}
          </select>
          <select value={staffPoolId} onChange={(event) => setStaffPoolId(event.target.value)} className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">不绑定人员池</option>
            {pools.map((pool) => <option key={pool.id} value={pool.id}>{pool.name}</option>)}
          </select>
          <button onClick={() => void createCode()} disabled={busy} className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            生成访问码
          </button>
        </div>
        {plainCode ? <div className="mt-4 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-hospital-green">新访问码：<span className="font-mono text-base font-semibold">{plainCode}</span><span className="ml-2 text-xs text-teal-700">已加密保存，后续仍可在列表复制。</span></div> : null}
        {message ? <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</div> : null}
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
        <div className="table-scroll">
          <table className="min-w-[1320px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>{["用途", "所属医院", "所属科室", "所属病区", "绑定任务", "绑定人员池", "访问码", "有效期", "使用次数", "创建人/时间", "状态", "操作"].map((header) => <th key={header} className="border-b border-slate-200 px-3 py-3 font-medium">{header}</th>)}</tr>
            </thead>
            <tbody>
              {codes.length ? codes.map((code) => {
                const valid = code.active && new Date(code.expiresAt) > new Date();
                const joinLink =
                  code.codeValue && typeof window !== "undefined"
                    ? `${window.location.origin}/join?code=${encodeURIComponent(code.codeValue)}`
                    : "";
                const expanded = expandedCodeId === code.id;
                return (
                  <Fragment key={code.id}>
                    <tr>
                      <td className="border-b border-slate-100 px-3 py-3 font-medium text-slate-900">{code.purpose}</td>
                      <td className="border-b border-slate-100 px-3 py-3">{code.hospitalName}</td>
                      <td className="border-b border-slate-100 px-3 py-3">{code.departmentName}</td>
                      <td className="border-b border-slate-100 px-3 py-3">{code.unitName}</td>
                      <td className="border-b border-slate-100 px-3 py-3">{code.scheduleTaskLabel ?? "-"}</td>
                      <td className="border-b border-slate-100 px-3 py-3">{code.staffPoolLabel ?? "-"}</td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        {code.codeValue ? (
                          <span className="font-mono text-sm font-semibold text-slate-900">{code.codeValue}</span>
                        ) : (
                          <span className="text-xs text-amber-700">{code.codeUnavailableReason}</span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">{new Date(code.expiresAt).toLocaleString("zh-CN")}</td>
                      <td className="border-b border-slate-100 px-3 py-3">{code.useCount}/{code.maxUses ?? "不限"}</td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <div>{code.createdByName}</div>
                        <div className="text-xs text-slate-500">{new Date(code.createdAt).toLocaleString("zh-CN")}</div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <div>{valid ? "有效" : "失效"}</div>
                        {code.revokedAt ? <div className="text-xs text-red-600">作废：{new Date(code.revokedAt).toLocaleString("zh-CN")}</div> : null}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            disabled={!valid || !code.codeValue || busyCodeId === code.id}
                            onClick={() => code.codeValue ? void copyToClipboard(code.id, code.codeValue, "COPY_CODE") : undefined}
                            className="focus-ring inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-700 disabled:opacity-40"
                          >
                            <Copy size={14} />
                            复制码
                          </button>
                          <button
                            disabled={!valid || !code.codeValue || busyCodeId === code.id}
                            onClick={() => joinLink ? void copyToClipboard(code.id, joinLink, "COPY_LINK") : undefined}
                            className="focus-ring inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-700 disabled:opacity-40"
                          >
                            <Link2 size={14} />
                            复制链接
                          </button>
                          <button
                            disabled={busyCodeId === code.id}
                            onClick={() => void regenerateCode(code.id)}
                            className="focus-ring inline-flex items-center gap-1 rounded-md border border-teal-200 px-2 py-1.5 text-xs text-hospital-green disabled:opacity-40"
                          >
                            <RefreshCw size={14} />
                            重新生成
                          </button>
                          <button
                            disabled={!valid || busyCodeId === code.id}
                            onClick={() => void revokeCode(code.id)}
                            className="focus-ring inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1.5 text-xs text-red-700 disabled:opacity-40"
                          >
                            <Ban size={14} />
                            {busyCodeId === code.id ? "处理中" : "作废"}
                          </button>
                          <button
                            onClick={() => setExpandedCodeId(expanded ? "" : code.id)}
                            className="focus-ring inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-700"
                          >
                            <History size={14} />
                            使用记录
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr>
                        <td colSpan={12} className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                          {code.usageRecords.length ? (
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                              {code.usageRecords.map((record) => (
                                <div key={record.id} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                                  <div className="font-medium text-slate-900">{record.inputName} {record.inputPhone ? `(${record.inputPhone})` : ""}</div>
                                  <div className="mt-1">匹配：{statusLabels[record.matchStatus] ?? record.matchStatus}；审核：{statusLabels[record.reviewStatus] ?? record.reviewStatus}</div>
                                  <div className="mt-1 text-slate-500">{new Date(record.createdAt).toLocaleString("zh-CN")}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-slate-500">暂无使用记录</div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              }) : <tr><td colSpan={12} className="px-3 py-8 text-center text-slate-500">暂无访问码</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("浏览器不支持自动复制，请手动选择复制");
}

export function JoinClaimsClient() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [roster, setRoster] = useState<RosterSummary[]>([]);
  const [busyId, setBusyId] = useState("");
  async function load() {
    const data = await fetchJson("/api/join-claims");
    setClaims(data.claims ?? []);
    setUsers(data.users ?? []);
    setRoster(data.roster ?? []);
  }
  useEffect(() => { void load(); }, []);
  async function act(id: string, action: string) {
    setBusyId(id);
    try {
      await patchJson(`/api/join-claims/${id}`, { action });
      await load();
    } finally {
      setBusyId("");
    }
  }
  const usersById = new Map(users.map((user) => [user.id, user]));
  const rosterById = new Map(roster.map((entry) => [entry.id, entry]));
  return (
    <section className="space-y-5">
      <Header title="本期人员确认" desc="只有审核通过的成员反馈才会进入排班冲突处理。" />
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
        <div className="table-scroll">
          <table className="min-w-[960px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600"><tr>{["预录姓名", "预录手机号", "注册姓名", "注册手机号", "人员池", "身份", "匹配状态", "审核状态", "操作"].map((h) => <th key={h} className="border-b border-slate-200 px-3 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>{claims.length ? claims.map((claim) => {
              const user = usersById.get(claim.userId);
              const entry = claim.rosterEntryId ? rosterById.get(claim.rosterEntryId) : null;
              const canApprove = claim.reviewStatus === "PENDING" && Boolean(entry) && claim.matchStatus !== "UNMATCHED";
              return (
                <tr key={claim.id}>
                  <td className="border-b border-slate-100 px-3 py-3">{entry?.expectedName ?? "-"}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{entry?.expectedPhone ?? "-"}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{claim.inputName || user?.displayName || user?.username || "-"}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{claim.inputPhone || user?.phone || "-"}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{entry ? poolLabels[entry.poolType] ?? entry.poolType : "-"}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{entry?.staffType || "-"}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{statusLabels[claim.matchStatus] ?? claim.matchStatus}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{statusLabels[claim.reviewStatus] ?? claim.reviewStatus}</td>
                  <td className="border-b border-slate-100 px-3 py-3">
                    <div className="flex gap-2">
                      <button disabled={busyId === claim.id || !canApprove} onClick={() => void act(claim.id, "APPROVE")} className="focus-ring inline-flex items-center gap-1 rounded-md border border-teal-200 px-2 py-1.5 text-xs text-hospital-green disabled:opacity-40"><UserCheck size={14} />确认</button>
                      <button disabled={busyId === claim.id || claim.reviewStatus !== "PENDING"} onClick={() => void act(claim.id, "REJECT")} className="focus-ring inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1.5 text-xs text-red-700 disabled:opacity-40"><UserX size={14} />驳回</button>
                      <button disabled={busyId === claim.id || claim.reviewStatus !== "PENDING"} onClick={() => void act(claim.id, "NO_SHOW")} className="focus-ring rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-700 disabled:opacity-40">未报到</button>
                    </div>
                  </td>
                </tr>
              );
            }) : <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">暂无加入申请</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function FeedbackReviewClient() {
  const [items, setItems] = useState<MemberFeedback[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [busyId, setBusyId] = useState("");
  async function load() {
    const data = await fetchJson("/api/feedback-review");
    setItems(data.feedback ?? []);
    setUsers(data.users ?? []);
  }
  useEffect(() => { void load(); }, []);
  async function act(id: string, action: string) {
    setBusyId(id);
    try {
      await patchJson(`/api/feedback-review/${id}`, { action });
      await load();
    } finally {
      setBusyId("");
    }
  }
  const usersById = new Map(users.map((user) => [user.id, user]));
  return (
    <section className="space-y-5">
      <Header title="成员反馈审核" desc="身份未确认或异常反馈不会自动进入排班。审核通过后才作为硬约束生效。" />
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
        <div className="table-scroll">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600"><tr>{["成员", "手机号", "不可排", "留言", "状态", "是否生效", "异常", "操作"].map((h) => <th key={h} className="border-b border-slate-200 px-3 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>{items.length ? items.map((item) => {
              const user = usersById.get(item.userId);
              return (
                <tr key={item.id} className="align-top">
                  <td className="border-b border-slate-100 px-3 py-3">{user?.displayName || user?.username || "成员反馈"}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{user?.phone || "-"}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{item.unavailableTimes?.map((u) => `${new Date(u.date).toISOString().slice(0, 10)} ${u.timeSlot}`).join("；") || "-"}</td>
                  <td className="border-b border-slate-100 px-3 py-3 max-w-xs whitespace-pre-wrap">{item.message || "-"}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{statusLabels[item.status] ?? item.status}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{item.effective ? "是" : "否"}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{item.anomalyStatus || "无"}</td>
                  <td className="border-b border-slate-100 px-3 py-3">
                    <div className="flex gap-2">
                      <button disabled={busyId === item.id} onClick={() => void act(item.id, "APPROVE")} className="focus-ring inline-flex items-center gap-1 rounded-md border border-teal-200 px-2 py-1.5 text-xs text-hospital-green disabled:opacity-40"><ShieldCheck size={14} />通过</button>
                      <button disabled={busyId === item.id} onClick={() => void act(item.id, "REJECT")} className="focus-ring rounded-md border border-red-200 px-2 py-1.5 text-xs text-red-700 disabled:opacity-40">驳回</button>
                    </div>
                  </td>
                </tr>
              );
            }) : <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">暂无成员反馈</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Header({ title, desc }: { title: string; desc: string }) {
  return <div><h2 className="text-2xl font-semibold text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-600">{desc}</p></div>;
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
      <div className="table-scroll">
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600"><tr>{headers.map((header) => <th key={header} className="border-b border-slate-200 px-3 py-3 font-medium">{header}</th>)}</tr></thead>
          <tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border-b border-slate-100 px-3 py-3">{cell}</td>)}</tr>) : <tr><td colSpan={headers.length} className="px-3 py-8 text-center text-slate-500">暂无数据</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}

async function fetchJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "请求失败");
  return data;
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "请求失败");
  return data;
}

async function patchJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "请求失败");
  return data;
}

async function deleteJson(url: string) {
  const response = await fetch(url, { method: "DELETE" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "请求失败");
  return data;
}
