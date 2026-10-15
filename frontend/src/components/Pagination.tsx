import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

// Build the numbered buttons, collapsing long ranges with an ellipsis.
function pageWindow(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < totalPages - 1) pages.push("…");
  pages.push(totalPages);
  return pages;
}

export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20],
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const pages = pageWindow(page, totalPages);

  const navBtn =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
      <p className="text-sm text-slate-500">
        Showing <span className="font-semibold text-slate-700">{start}</span> to{" "}
        <span className="font-semibold text-slate-700">{end}</span> of{" "}
        <span className="font-semibold text-slate-700">{total}</span> entries
      </p>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className={navBtn}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {pages.map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-2 text-sm text-slate-400" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
                className={
                  "min-w-9 rounded-lg px-3 py-2 text-sm font-semibold transition " +
                  (p === page
                    ? "bg-brand-600 text-white shadow-sm shadow-brand-600/30"
                    : "text-slate-600 hover:bg-slate-100")
                }
              >
                {p}
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
            className={navBtn}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>

        <label className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hidden sm:inline">Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 transition focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
