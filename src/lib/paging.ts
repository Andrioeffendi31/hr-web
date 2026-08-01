/** URL-driven paging & sorting. Pure — no DB, no React — so hr.check.ts can
 *  assert it, including the hostile inputs a query string can carry. */

export const PER_PAGE = 20;
/** page size for the infinite-scroll feeds */
export const FEED_PAGE = 15;

export type Search = Record<string, string | undefined>;
export type Dir = "asc" | "desc";

export function parsePaging(sp: Search, perPageDefault = PER_PAGE) {
  const rawPage = Math.floor(Number(sp.page));
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawPerPage = Math.floor(Number(sp.perPage));
  const perPage = Number.isFinite(rawPerPage)
    ? Math.min(100, Math.max(5, rawPerPage || perPageDefault))
    : perPageDefault;

  return { page, perPage, offset: (page - 1) * perPage };
}

/**
 * Resolve `?sort=&dir=` against a whitelist. The caller maps public names to
 * Drizzle columns, so an unknown or crafted value can never reach SQL — it
 * simply falls back to the default ordering.
 */
export function parseSort<T>(
  sp: Search,
  allowed: Record<string, T>,
  fallbackKey?: string,
): { key: string | undefined; dir: Dir; column: T | undefined } {
  const key =
    sp.sort && Object.prototype.hasOwnProperty.call(allowed, sp.sort)
      ? sp.sort
      : fallbackKey;
  const dir: Dir = sp.dir === "desc" ? "desc" : "asc";
  return { key, dir, column: key ? allowed[key] : undefined };
}

/**
 * Build a link that keeps the current filters. Any patch that is not itself a
 * page change resets to page 1 — filtering from page 5 would otherwise land on
 * an empty screen.
 */
export function pageHref(path: string, sp: Search, patch: Search = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) {
    if (v !== undefined && v !== "") p.set(k, v);
  }
  if (!("page" in patch)) p.delete("page");
  if (p.get("page") === "1") p.delete("page");
  return p.size ? `${path}?${p}` : path;
}

export const totalPages = (total: number, perPage: number) =>
  Math.max(1, Math.ceil(total / perPage));

/** "21–40 dari 137". A page past the end has nothing on it, so say so rather
 *  than printing a backwards range like "21–16". */
export function rangeLabel(page: number, perPage: number, total: number) {
  const from = (page - 1) * perPage + 1;
  if (total === 0 || from > total) return `0 dari ${total}`;
  return `${from}–${Math.min(total, page * perPage)} dari ${total}`;
}
