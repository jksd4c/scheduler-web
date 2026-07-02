export default function AdminLoading() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-table">
        正在加载最高管理员后台...
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
