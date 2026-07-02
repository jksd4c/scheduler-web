import { redirect } from "next/navigation";
import Link from "next/link";
import { AccessCodeManager } from "@/components/access-code-manager";
import { TaskList } from "@/components/task-list";
import { isSchedulerAdminRole, requirePageUser, USER_ROLE } from "@/lib/auth";
import { PRODUCT_VERSION_LABEL } from "@/lib/product";
import { Tags, Timer, UsersRound } from "lucide-react";

export default async function DashboardPage() {
  const user = await requirePageUser();
  if (user.role === USER_ROLE.SUPER_ADMIN) {
    redirect("/admin");
  }
  if (!isSchedulerAdminRole(user.role) || !user.departmentId) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">无权限访问</div>;
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-medium text-hospital-green">{PRODUCT_VERSION_LABEL}</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">{user.unit?.name ?? user.department?.name ?? "病区"}工作台</h2>
        <p className="mt-1 text-sm text-slate-600">管理本病区/小组的人员排班任务和查看入口。</p>
      </section>
      <section className="grid gap-3 md:grid-cols-3">
        <Link href="/dashboard/staff-tags" className="focus-ring rounded-lg border border-slate-200 bg-white p-4 shadow-table hover:border-hospital-green">
          <div className="flex items-center gap-3">
            <Tags className="text-hospital-green" size={22} />
            <div>
              <div className="font-semibold text-slate-950">人员身份设置</div>
              <div className="mt-1 text-xs text-slate-500">身份标签、资格和排班策略</div>
            </div>
          </div>
        </Link>
        <Link href="/dashboard/staff" className="focus-ring rounded-lg border border-slate-200 bg-white p-4 shadow-table hover:border-hospital-green">
          <div className="flex items-center gap-3">
            <UsersRound className="text-hospital-green" size={22} />
            <div>
              <div className="font-semibold text-slate-950">人员管理</div>
              <div className="mt-1 text-xs text-slate-500">人员库和身份绑定</div>
            </div>
          </div>
        </Link>
        <Link href="/dashboard/shift-types" className="focus-ring rounded-lg border border-slate-200 bg-white p-4 shadow-table hover:border-hospital-green">
          <div className="flex items-center gap-3">
            <Timer className="text-hospital-green" size={22} />
            <div>
              <div className="font-semibold text-slate-950">班次身份要求</div>
              <div className="mt-1 text-xs text-slate-500">REQUIRED / FORBIDDEN / ALLOWED</div>
            </div>
          </div>
        </Link>
      </section>
      <AccessCodeManager />
      <TaskList />
    </div>
  );
}
