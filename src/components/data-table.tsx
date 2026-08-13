import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Empty, Panel } from "@/components/bits";
import { TableTools } from "@/components/table-tools";
import {
  type Dir,
  type Search,
  pageHref,
  rangeLabel,
  totalPages,
} from "@/lib/paging";
import { cn } from "@/lib/utils";

export type Column<T> = {
  /** also the ?sort= value when sortable */
  key: string;
  header: string;
  sortable?: boolean;
  /** frozen to the right edge, for action columns */
  sticky?: boolean;
  className?: string;
  cell: (row: T) => React.ReactNode;
};

/**
 * Paged, sortable table. Everything is server-rendered and every control is a
 * link, so a page or sort is bookmarkable and opens in a new tab.
 */
export function DataTable<T>({
  rows,
  columns,
  total,
  page,
  perPage,
  path,
  sp,
  sort,
  dir,
  minWidth = 720,
  empty = "Tidak ada data.",
  title,
  action,
  className,
  rowKey,
}: {
  rows: T[];
  columns: Column<T>[];
  total: number;
  page: number;
  perPage: number;
  /** pathname the links point at, e.g. "/karyawan" */
  path: string;
  sp: Search;
  sort?: string;
  dir: Dir;
  minWidth?: number;
  empty?: string;
  title?: string;
  action?: React.ReactNode;
  className?: string;
  rowKey: (row: T, index: number) => string | number;
}) {
  const pages = totalPages(total, perPage);
  // ?page=999 on a 2-page table should not read "Halaman 999 dari 2"
  const shownPage = Math.min(page, pages);

  return (
    <Panel title={title} action={action} className={className}>
      <div className="overflow-x-auto">
        <table className="w-full text-left" style={{ minWidth }}>
          <thead>
            <tr className="bg-surface-2 text-subtle border-b text-[11px] font-semibold tracking-[0.05em] uppercase">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "px-3 py-2.5 font-semibold first:pl-4 last:pr-4",
                    c.sticky &&
                      "bg-surface-2 sticky right-0 border-l text-center",
                  )}
                  aria-sort={
                    sort === c.key
                      ? dir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {c.sortable ? (
                    <Link
                      href={pageHref(path, sp, {
                        sort: c.key,
                        // clicking the active column flips direction
                        dir: sort === c.key && dir === "asc" ? "desc" : "asc",
                      })}
                      className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
                    >
                      {c.header}
                      {sort !== c.key ? (
                        <ChevronsUpDown
                          className="size-3 opacity-40"
                          aria-hidden
                        />
                      ) : dir === "asc" ? (
                        <ChevronUp className="size-3" aria-hidden />
                      ) : (
                        <ChevronDown className="size-3" aria-hidden />
                      )}
                    </Link>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                className="group hover:bg-surface-2 border-b last:border-0"
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 py-2.5 first:pl-4 last:pr-4",
                      c.sticky &&
                        "bg-card group-hover:bg-surface-2 sticky right-0 border-l text-center transition-colors",
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>{empty}</Empty>}
      </div>

      {total > 0 && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-2.5 text-[12px]">
          <span className="tnum">
            Halaman {shownPage} dari {pages}
            <span className="text-subtle ml-2 hidden sm:inline">
              ({rangeLabel(page, perPage, total)})
            </span>
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <TableTools
              path={path}
              sp={sp}
              perPage={perPage}
              pages={pages}
              page={shownPage}
            />

            <nav
              className="flex items-center gap-1"
              aria-label="Navigasi halaman"
            >
              <PageLink
                path={path}
                sp={sp}
                page={page - 1}
                disabled={page <= 1}
                label="Halaman sebelumnya"
              >
                <ChevronLeft className="size-3.5" aria-hidden />
              </PageLink>
              {pageWindow(page, pages).map((n, i) =>
                n === null ? (
                  <span key={`gap-${i}`} className="px-1">
                    …
                  </span>
                ) : (
                  <PageLink
                    key={n}
                    path={path}
                    sp={sp}
                    page={n}
                    current={n === page}
                    label={`Halaman ${n}`}
                  >
                    {n}
                  </PageLink>
                ),
              )}
              <PageLink
                path={path}
                sp={sp}
                page={page + 1}
                disabled={page >= pages}
                label="Halaman berikutnya"
              >
                <ChevronRight className="size-3.5" aria-hidden />
              </PageLink>
            </nav>
          </div>
        </div>
      )}
    </Panel>
  );
}

function PageLink({
  path,
  sp,
  page,
  current,
  disabled,
  label,
  children,
}: {
  path: string;
  sp: Search;
  page: number;
  current?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const cls = cn(
    "tnum flex h-8 min-w-8 items-center justify-center rounded-md border px-1.5 text-[12px] font-medium transition-colors",
    current
      ? "bg-primary text-primary-foreground border-transparent"
      : "bg-card hover:bg-accent",
    disabled && "pointer-events-none opacity-40",
  );

  if (disabled) {
    return (
      <span className={cls} aria-hidden>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={pageHref(path, sp, { page: String(page) })}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className={cls}
    >
      {children}
    </Link>
  );
}

/** 1 … 4 5 6 … 12 — keeps the control narrow however many pages there are. */
function pageWindow(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | null)[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) out.push(null);
  for (let n = from; n <= to; n++) out.push(n);
  if (to < pages - 1) out.push(null);
  out.push(pages);
  return out;
}
