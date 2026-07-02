export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-table">
        正在加载工作台...
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
    </div>
  );
}
