"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Send, UserPlus } from "lucide-react";
import { PRODUCT_TAGLINE, PRODUCT_VERSION_LABEL } from "@/lib/product";

type DepartmentOption = {
  id: string;
  name: string;
  hospitalId: string | null;
};

type HospitalOption = {
  id: string;
  name: string;
  departments: DepartmentOption[];
};

export function RegisterForm({ hospitals }: { hospitals: HospitalOption[] }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [hospitalId, setHospitalId] = useState(hospitals[0]?.id ?? "");
  const selectedHospital = useMemo(() => hospitals.find((item) => item.id === hospitalId), [hospitalId, hospitals]);
  const [departmentId, setDepartmentId] = useState(selectedHospital?.departments[0]?.id ?? "");
  const [unitName, setUnitName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [requestForm, setRequestForm] = useState({
    hospitalName: "",
    departmentName: "",
    applicantName: "",
    contact: "",
    note: ""
  });
  const [requestMessage, setRequestMessage] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);

  const departments = selectedHospital?.departments ?? [];

  function changeHospital(nextHospitalId: string) {
    const nextHospital = hospitals.find((item) => item.id === nextHospitalId);
    setHospitalId(nextHospitalId);
    setDepartmentId(nextHospital?.departments[0]?.id ?? "");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, displayName, phone, email, hospitalId, departmentId, unitName })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "注册失败");
      }
      router.push(data.redirectTo ?? "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setLoading(false);
    }
  }

  async function submitOrganizationRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestLoading(true);
    setRequestError("");
    setRequestMessage("");
    try {
      const response = await fetch("/api/organization-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestForm)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "提交失败");
      }
      setRequestMessage("申请已提交，最高管理员审核后会维护医院和科室。");
      setRequestForm({ hospitalName: "", departmentName: "", applicantName: "", contact: "", note: "" });
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setRequestLoading(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_360px]">
      <form onSubmit={submit} className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-table">
        <div>
          <p className="text-sm font-medium text-hospital-green">{PRODUCT_VERSION_LABEL}</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">注册排班管理员</h2>
          <p className="mt-1 text-sm text-slate-600">{PRODUCT_TAGLINE}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">用户名</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">显示姓名</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">至少 8 位，系统只保存哈希。</span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">手机号，可选</span>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-medium text-slate-700">邮箱，可选</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">医院</span>
            <select value={hospitalId} onChange={(event) => changeHospital(event.target.value)} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
              {hospitals.map((hospital) => (
                <option key={hospital.id} value={hospital.id}>
                  {hospital.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">科室</span>
            <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">病区/小组</span>
            <input value={unitName} onChange={(event) => setUnitName(event.target.value)} placeholder="例如：一病区、门诊组" className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
        </div>

        {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        <button
          type="submit"
          disabled={loading || !username.trim() || !password || !displayName.trim() || !hospitalId || !departmentId || !unitName.trim()}
          className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-md bg-hospital-green px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <UserPlus size={16} />
          {loading ? "注册中" : "注册并进入工作台"}
        </button>

        <p className="text-center text-sm text-slate-500">
          已有账号？
          <Link href="/login" className="font-medium text-hospital-green hover:text-teal-800">
            去登录
          </Link>
        </p>
      </form>

      <form onSubmit={submitOrganizationRequest} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-table">
        <div>
          <div className="flex items-center gap-2 text-slate-950">
            <Building2 size={18} className="text-hospital-green" />
            <h3 className="font-semibold">申请新增医院/科室</h3>
          </div>
          <p className="mt-1 text-sm text-slate-600">医院和科室由最高管理员维护。找不到时，先提交申请。</p>
        </div>
        {[
          ["hospitalName", "医院名称"],
          ["departmentName", "科室名称"],
          ["applicantName", "申请人"],
          ["contact", "联系方式"]
        ].map(([key, label]) => (
          <label key={key} className="block">
            <span className="text-sm font-medium text-slate-700">{label}</span>
            <input
              value={requestForm[key as keyof typeof requestForm]}
              onChange={(event) => setRequestForm((previous) => ({ ...previous, [key]: event.target.value }))}
              className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
        ))}
        <label className="block">
          <span className="text-sm font-medium text-slate-700">说明，可选</span>
          <textarea
            value={requestForm.note}
            onChange={(event) => setRequestForm((previous) => ({ ...previous, note: event.target.value }))}
            rows={4}
            className="focus-ring mt-1 w-full resize-y rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        {requestMessage ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{requestMessage}</div> : null}
        {requestError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{requestError}</div> : null}
        <button type="submit" disabled={requestLoading} className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Send size={16} />
          {requestLoading ? "提交中" : "提交申请"}
        </button>
      </form>
    </div>
  );
}
