import type { Metadata } from "next";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { getCurrentGuest, getCurrentUser, roleLabel, USER_ROLE } from "@/lib/auth";
import { PRODUCT_AUTHOR, PRODUCT_NAME, PRODUCT_TAGLINE, PRODUCT_VERSION_LABEL } from "@/lib/product";
import "./globals.css";

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: "面向医院科室、病区和小组的公平随机排班工具"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, guest] = await Promise.all([getCurrentUser(), getCurrentGuest()]);
  const homePath = user?.role === USER_ROLE.SUPER_ADMIN ? "/admin" : user?.role === USER_ROLE.MEMBER ? "/member/feedback" : "/dashboard";
  const orgLabel = user?.unit?.name || user?.department?.name || user?.hospital?.name || "";

  return (
    <html lang="zh-CN">
      <body>
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
              <Link href={user ? homePath : "/login"} className="min-w-0">
                <p className="text-sm text-slate-500">{PRODUCT_VERSION_LABEL}</p>
                <h1 className="truncate text-xl font-semibold tracking-normal text-slate-900">{PRODUCT_NAME}</h1>
                <p className="mt-0.5 hidden text-xs text-slate-500 sm:block">{PRODUCT_TAGLINE}</p>
              </Link>
              <div className="flex items-center gap-3 text-sm">
                {user ? (
                  <>
                    <div className="text-right">
                      <div className="font-medium text-slate-900">{user.displayName || user.username}</div>
                      <div className="text-xs text-slate-500">
                        {roleLabel(user.role)}
                        {orgLabel ? ` · ${orgLabel}` : ""}
                      </div>
                    </div>
                    <nav className="hidden items-center gap-3 sm:flex">
                      {user.role === USER_ROLE.MEMBER ? (
                        <>
                          <Link href="/member/feedback" className="text-slate-600 hover:text-slate-950">
                            我的反馈
                          </Link>
                          <Link href="/member/my-schedule" className="text-slate-600 hover:text-slate-950">
                            我的排班
                          </Link>
                        </>
                      ) : (
                        <>
                          <Link href={homePath} className="text-slate-600 hover:text-slate-950">
                            工作台
                          </Link>
                          <Link href="/feedback" className="text-slate-600 hover:text-slate-950">
                            反馈
                          </Link>
                        </>
                      )}
                    </nav>
                    <LogoutButton />
                  </>
                ) : guest ? (
                  <>
                    <div className="text-right">
                      <div className="font-medium text-slate-900">只读查看</div>
                      <div className="text-xs text-slate-500">{guest.department.name}</div>
                    </div>
                    <LogoutButton guest />
                  </>
                ) : (
                  <div className="flex items-center gap-3">
                    <Link href="/register" className="text-slate-600 hover:text-slate-950">
                      注册
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
              {PRODUCT_VERSION_LABEL} · {PRODUCT_AUTHOR}
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
