"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton({ guest = false }: { guest?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await fetch(guest ? "/api/guest/logout" : "/api/auth/logout", { method: "POST" });
    router.push(guest ? "/guest" : "/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={loading}
      className="focus-ring inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
    >
      <LogOut size={14} />
      {loading ? "退出中" : "退出"}
    </button>
  );
}
