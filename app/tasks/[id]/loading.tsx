export default function TaskDetailLoading() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-table">
        正在加载排班任务详情...
      </div>
      <div className="h-12 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
      <div className="h-96 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
    </div>
  );
}
