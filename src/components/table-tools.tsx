"use client";

import { useRouter } from "next/navigation";
import { SelectField } from "@/components/select-field";
import { pageHref, type Search } from "@/lib/paging";

const ROWS = [10, 20, 50, 100].map((n) => ({
  value: String(n),
  label: String(n),
}));

/** Rows-per-page and jump-to-page. Both rewrite the URL, so the table stays
 *  fully driven by search params — these are just faster ways to get there. */
export function TableTools({
  path,
  sp,
  perPage,
  pages,
  page,
}: {
  path: string;
  sp: Search;
  perPage: number;
  pages: number;
  page: number;
}) {
  const router = useRouter();

  return (
    <>
      <span className="flex items-center gap-1.5">
        Baris
        <SelectField
          name="perPage"
          defaultValue={String(perPage)}
          options={ROWS}
          ariaLabel="Baris per halaman"
          className="data-[size=default]:h-8 rounded-md text-[12px]"
          // a bigger page size can put you past the end, so go back to page 1
          onChange={(v) =>
            router.push(pageHref(path, sp, { perPage: v, page: undefined }))
          }
        />
      </span>

      <label className="flex items-center gap-1.5">
        Ke halaman
        <input
          type="number"
          min={1}
          max={pages}
          defaultValue={page}
          key={page}
          aria-label="Lompat ke halaman"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const n = Math.min(
              pages,
              Math.max(1, Number(e.currentTarget.value) || 1),
            );
            router.push(pageHref(path, sp, { page: String(n) }));
          }}
          className="bg-card border-border-strong tnum h-8 w-14 rounded-md border px-1.5 text-[12px]"
        />
      </label>
    </>
  );
}
