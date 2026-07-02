"use client";

import { CalendarDays, ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MODE_LABELS, STATUS_LABELS } from "@/lib/schedule-rules";
import { toDateKey } from "@/lib/date-utils";
import type { ApiTaskListItem } from "@/components/schedule-types";

export function TaskList() {
  const [tasks, setTasks] = useState<ApiTaskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingTaskId, setDeletingTaskId] = useState("");

  async function loadTasks() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/tasks", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "获取任务列表失败");
      }
      setTasks(data.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取任务列表失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTasks();
  }, []);

  async function deleteTask(task: ApiTaskListItem) {
    if (
      !window.confirm(
        "确认删除这个排班任务吗？该任务的人员名单、不可排班时间、排班规则、排班结果和冲突记录都会被删除，且无法恢复。"
      )
    ) {
      return;
    }

    setDeletingTaskId(task.id);
    setError("");
    try {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message ?? "删除失败");
      }
      setTasks((previous) => previous.filter((item) => item.id !== task.id));
      await loadTasks();
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除失败";
      setError(message);
      window.alert(message);
    } finally {
      setDeletingTaskId("");
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">排班任务列表</h2>
          <p className="mt-1 text-sm text-slate-600">每个任务都是一次独立的排班快照。</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void loadTasks()}
            className="focus-ring inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            刷新
          </button>
          <Link
            href="/tasks/new"
            className="focus-ring inline-flex items-center gap-2 rounded-md bg-hospital-green px-3 py-2 text-sm font-medium text-white hover:bg-teal-800"
          >
            <Plus size={16} />
            新建排班任务
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
        <div className="table-scroll">
          <table className="min-w-[860px] w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">排班周期</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">病区/小组</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">模式</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">状态</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">人员数</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">已排班</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">冲突</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">创建时间</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={9}>
                    正在加载任务...
                  </td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={9}>
                    暂无排班任务
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <tr key={task.id} className="hover:bg-slate-50">
                    <td className="border-b border-slate-100 px-4 py-3">
                      <div className="flex items-center gap-2 font-medium text-slate-900">
                        <CalendarDays size={16} className="text-hospital-green" />
                        {toDateKey(task.weekStartDate)} 至 {toDateKey(task.weekEndDate)}
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-slate-600">{task.unit?.name ?? task.department?.name ?? "-"}</td>
                    <td className="border-b border-slate-100 px-4 py-3">{MODE_LABELS[task.mode]}</td>
                    <td className="border-b border-slate-100 px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        {STATUS_LABELS[task.status]}
                      </span>
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3">{task._count.doctors}</td>
                    <td className="border-b border-slate-100 px-4 py-3">{task._count.assignments}</td>
                    <td className="border-b border-slate-100 px-4 py-3">
                      <span className={task._count.conflicts ? "font-medium text-hospital-red" : "text-slate-600"}>
                        {task._count.conflicts}
                      </span>
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-slate-600">
                      {new Date(task.createdAt).toLocaleString("zh-CN")}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/tasks/${task.id}`}
                          className="focus-ring inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
                        >
                          <ExternalLink size={14} />
                          进入
                        </Link>
                        <button
                          onClick={() => void deleteTask(task)}
                          disabled={deletingTaskId === task.id}
                          className="focus-ring inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <Trash2 size={14} />
                          {deletingTaskId === task.id ? "删除中" : "删除"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
