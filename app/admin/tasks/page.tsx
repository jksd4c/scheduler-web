import Link from "next/link";
import { TaskList } from "@/components/task-list";
import { requirePageSuperAdmin } from "@/lib/auth";

export default async function AdminTasksPage() {
  const user = await requirePageSuperAdmin();
  if (!user) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">无权限访问</div>;
  }

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm font-medium text-slate-600 hover:text-slate-950">
        返回最高管理员后台
      </Link>
      <TaskList />
    </div>
  );
}
