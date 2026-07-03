import Link from "next/link";
import { Building2, ClipboardList, FileText, Hospital, Layers3, MessageSquare, ScrollText, UsersRound } from "lucide-react";
import { requirePageSuperAdmin } from "@/lib/auth";
import { PRODUCT_VERSION_LABEL } from "@/lib/product";
import { prisma } from "@/lib/prisma";

export default async function AdminPage() {
  const user = await requirePageSuperAdmin();
  if (!user) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">无权限访问</div>;
  }

  const [hospitalCount, departmentCount, unitCount, userCount, taskCount, feedbackCount, recentUsers, recentUnits, recentTasks] = await Promise.all([
    prisma.hospital.count(),
    prisma.department.count(),
    prisma.unit.count(),
    prisma.user.count(),
    prisma.scheduleTask.count(),
    prisma.feedback.count(),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { hospital: true, department: true, unit: true }
    }),
    prisma.unit.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { hospital: true, department: true, createdByUser: true }
    }),
    prisma.scheduleTask.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { hospital: true, department: true, unit: true }
    })
  ]);

  const cards = [
    { href: "/admin/hospitals", label: "医院", value: hospitalCount, icon: Hospital },
    { href: "/admin/departments", label: "科室", value: departmentCount, icon: Building2 },
    { href: "/admin/units", label: "病区/小组", value: unitCount, icon: Layers3 },
    { href: "/admin/users", label: "用户", value: userCount, icon: UsersRound },
    { href: "/admin/tasks", label: "排班任务", value: taskCount, icon: ClipboardList },
    { href: "/admin/feedback", label: "反馈", value: feedbackCount, icon: MessageSquare },
    { href: "/admin/organization-requests", label: "组织申请", value: "查看", icon: FileText },
    { href: "/admin/audit-logs", label: "审计日志", value: "查看", icon: ScrollText }
  ];

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-hospital-green">{PRODUCT_VERSION_LABEL}</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">最高管理员后台</h2>
        <p className="mt-1 text-sm text-slate-600">查看测试服总览，管理医院、科室、病区、用户、反馈和审计记录。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href} className="focus-ring rounded-lg border border-slate-200 bg-white p-5 shadow-table hover:border-hospital-green">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-500">{card.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{card.value}</p>
                </div>
                <Icon className="shrink-0 text-hospital-green" size={26} />
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <OverviewList
          title="最近注册用户"
          empty="暂无用户"
          items={recentUsers.map((item) => ({
            id: item.id,
            primary: item.displayName || item.username,
            secondary: [item.hospital?.name, item.department?.name, item.unit?.name].filter(Boolean).join(" / ") || item.role
          }))}
        />
        <OverviewList
          title="最近创建病区"
          empty="暂无病区"
          items={recentUnits.map((item) => ({
            id: item.id,
            primary: item.name,
            secondary: [item.hospital?.name, item.department?.name, item.createdByUser?.displayName || item.createdByUser?.username].filter(Boolean).join(" / ")
          }))}
        />
        <OverviewList
          title="最近排班任务"
          empty="暂无任务"
          items={recentTasks.map((item) => ({
            id: item.id,
            primary: `${item.name || "排班任务"}：${(item.startDate ?? item.weekStartDate).toISOString().slice(0, 10)} 至 ${(item.endDate ?? item.weekEndDate).toISOString().slice(0, 10)}`,
            secondary: [item.hospital?.name, item.department?.name, item.unit?.name, item.status].filter(Boolean).join(" / ")
          }))}
        />
      </div>
    </section>
  );
}

function OverviewList({ title, empty, items }: { title: string; empty: string; items: Array<{ id: string; primary: string; secondary: string }> }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-table">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="font-semibold text-slate-950">{title}</h3>
      </div>
      <div className="divide-y divide-slate-100">
        {items.length ? (
          items.map((item) => (
            <div key={item.id} className="px-4 py-3">
              <div className="font-medium text-slate-900">{item.primary}</div>
              <div className="mt-1 text-xs text-slate-500">{item.secondary || "-"}</div>
            </div>
          ))
        ) : (
          <div className="px-4 py-8 text-center text-sm text-slate-500">{empty}</div>
        )}
      </div>
    </div>
  );
}
