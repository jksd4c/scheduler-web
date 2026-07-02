"use client";

import { useState } from "react";

type OrganizationRequestItem = {
  id: string;
  hospitalName: string;
  departmentName: string;
  applicantName: string;
  contact: string;
  note: string | null;
  status: string;
  createdAt: Date | string;
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "新申请",
  REVIEWING: "审核中",
  APPROVED: "已通过",
  REJECTED: "已驳回"
};

export function AdminOrganizationRequestsClient({ requests }: { requests: OrganizationRequestItem[] }) {
  const [items, setItems] = useState(requests);
  const [error, setError] = useState("");

  async function review(item: OrganizationRequestItem, action: "APPROVE" | "REJECT" | "REVIEWING") {
    setError("");
    const response = await fetch(`/api/admin/organization-requests/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.message ?? "处理失败");
      return;
    }
    setItems((previous) => previous.map((request) => (request.id === item.id ? data.organizationRequest : request)));
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">组织申请</h2>
        <p className="mt-1 text-sm text-slate-600">用户找不到医院或科室时提交申请，最高管理员审核后维护组织结构。</p>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-table">
        <div className="table-scroll">
          <table className="min-w-[960px] w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">医院</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">科室</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">申请人</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">联系方式</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">说明</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">状态</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    暂无组织申请
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="border-b border-slate-100 px-4 py-3">{item.hospitalName}</td>
                    <td className="border-b border-slate-100 px-4 py-3">{item.departmentName}</td>
                    <td className="border-b border-slate-100 px-4 py-3">{item.applicantName}</td>
                    <td className="border-b border-slate-100 px-4 py-3">{item.contact}</td>
                    <td className="border-b border-slate-100 px-4 py-3">{item.note || "-"}</td>
                    <td className="border-b border-slate-100 px-4 py-3">{STATUS_LABELS[item.status] ?? item.status}</td>
                    <td className="border-b border-slate-100 px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => void review(item, "REVIEWING")} className="focus-ring rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-700 hover:bg-white">
                          审核中
                        </button>
                        <button onClick={() => void review(item, "APPROVE")} className="focus-ring rounded-md border border-emerald-200 px-2 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                          通过
                        </button>
                        <button onClick={() => void review(item, "REJECT")} className="focus-ring rounded-md border border-red-200 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
                          驳回
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
