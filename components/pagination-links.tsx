import Link from "next/link";

type PaginationLinksProps = {
  basePath: string;
  page: number;
  pageSize: number;
  total: number;
  label?: string;
};

function pageHref(basePath: string, page: number) {
  return `${basePath}?page=${page}`;
}

export function PaginationLinks({ basePath, page, pageSize, total, label = "记录" }: PaginationLinksProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) {
    return (
      <div className="text-sm text-slate-500">
        共 {total} 条{label}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-table sm:flex-row sm:items-center sm:justify-between">
      <div className="text-slate-600">
        共 {total} 条{label}，第 {page} / {totalPages} 页
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={pageHref(basePath, Math.max(1, page - 1))}
          aria-disabled={page <= 1}
          className={
            page <= 1
              ? "pointer-events-none rounded-md border border-slate-200 px-3 py-1.5 text-slate-300"
              : "focus-ring rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
          }
        >
          上一页
        </Link>
        <Link
          href={pageHref(basePath, Math.min(totalPages, page + 1))}
          aria-disabled={page >= totalPages}
          className={
            page >= totalPages
              ? "pointer-events-none rounded-md border border-slate-200 px-3 py-1.5 text-slate-300"
              : "focus-ring rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
          }
        >
          下一页
        </Link>
      </div>
    </div>
  );
}
