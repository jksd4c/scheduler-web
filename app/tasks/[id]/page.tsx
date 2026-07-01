import { TaskDetailClient } from "@/components/task-detail-client";
import { AuthError, requireScheduleTaskAccess } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  try {
    await requireScheduleTaskAccess(params.id);
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) {
      redirect("/login");
    }
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
        无权限访问该排班任务。
      </div>
    );
  }

  return <TaskDetailClient taskId={params.id} />;
}
