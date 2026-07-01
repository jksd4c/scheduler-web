import Link from "next/link";
import { Building2, CalendarDays, UsersRound } from "lucide-react";
import { requirePageSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminPage() {
  const user = await requirePageSuperAdmin();
  if (!user) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">无权限访问</div>;
  }

  const [departmentCount, userCount, taskCount] = await Promise.all([
    prisma.department.count(),
    prisma.user.count(),
    prisma.scheduleTask.count()
  ]);

  const cards = [
    { href: "/admin/departments", label: "科室管理", value: departmentCount, icon: Building2 },
    { href: "/admin/users", label: "用户管理", value: userCount, icon: UsersRound },
    { href: "/admin/tasks", label: "全部排班", value: taskCount, icon: CalendarDays }
  ];

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">最高管理员后台</h2>
        <p className="mt-1 text-sm text-slate-600">管理科室、用户和所有排班任务。</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href} className="focus-ring rounded-lg border border-slate-200 bg-white p-5 shadow-table hover:border-hospital-green">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{card.label}</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-950">{card.value}</p>
                </div>
                <Icon className="text-hospital-green" size={28} />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
