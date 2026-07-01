import type { Metadata } from "next";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { getCurrentGuest, getCurrentUser, USER_ROLE } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "医院心电图室周排班",
  description: "心电图室每周排班生成与查看工具"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, guest] = await Promise.all([getCurrentUser(), getCurrentGuest()]);
  const roleLabel = user?.role === USER_ROLE.SUPER_ADMIN ? "最高管理员" : user?.role === USER_ROLE.DEPARTMENT_ADMIN ? "科室管理员" : "";

  return (
    <html lang="zh-CN">
      <body>
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
              <div>
                <p className="text-sm text-slate-500">医院内部工具</p>
                <h1 className="text-xl font-semibold tracking-normal text-slate-900">心电图室周排班</h1>
              </div>
              <div className="flex items-center gap-3 text-sm">
                {user ? (
                  <>
                    <div className="text-right">
                      <div className="font-medium text-slate-900">{user.username}</div>
                      <div className="text-xs text-slate-500">
                        {roleLabel}
                        {user.department?.name ? ` · ${user.department.name}` : ""}
                      </div>
                    </div>
                    <nav className="hidden items-center gap-3 sm:flex">
                      <Link href={user.role === USER_ROLE.SUPER_ADMIN ? "/admin" : "/dashboard"} className="text-slate-600 hover:text-slate-950">
                        工作台
                      </Link>
                    </nav>
                    <LogoutButton />
                  </>
                ) : guest ? (
                  <>
                    <div className="text-right">
                      <div className="font-medium text-slate-900">访客模式</div>
                      <div className="text-xs text-slate-500">{guest.department.name}</div>
                    </div>
                    <LogoutButton guest />
                  </>
                ) : (
                  <div className="flex items-center gap-3">
                    <Link href="/guest" className="text-slate-600 hover:text-slate-950">
                      访客查看
                    </Link>
                    <Link href="/login" className="focus-ring rounded-md bg-hospital-green px-3 py-2 text-sm font-medium text-white hover:bg-teal-800">
                      登录
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          <footer className="border-t border-slate-200 bg-white/70">
            <div className="mx-auto max-w-7xl px-4 py-3 text-center text-xs text-slate-400 sm:px-6 lg:px-8">
              医院心电图室周排班 · by-jks
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
