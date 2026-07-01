import { redirect } from "next/navigation";
import { AccessCodeManager } from "@/components/access-code-manager";
import { TaskList } from "@/components/task-list";
import { requirePageUser, USER_ROLE } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await requirePageUser();
  if (user.role === USER_ROLE.SUPER_ADMIN) {
    redirect("/admin");
  }
  if (user.role !== USER_ROLE.DEPARTMENT_ADMIN || !user.departmentId) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">无权限访问</div>;
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-semibold text-slate-950">{user.department?.name ?? "科室"}工作台</h2>
        <p className="mt-1 text-sm text-slate-600">管理本科室排班任务和访客访问密码。</p>
      </section>
      <AccessCodeManager />
      <TaskList />
    </div>
  );
}
