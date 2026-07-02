import { redirect } from "next/navigation";
import { AccessCodeManager } from "@/components/access-code-manager";
import { TaskList } from "@/components/task-list";
import { isSchedulerAdminRole, requirePageUser, USER_ROLE } from "@/lib/auth";
import { PRODUCT_VERSION_LABEL } from "@/lib/product";

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
      <AccessCodeManager />
      <TaskList />
    </div>
  );
}
