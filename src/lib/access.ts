/**
 * The one place that answers "may this role open this URL?".
 *
 * Imported by the Edge proxy, so it must stay dependency-free — no drizzle, no
 * node builtins, no `@/db`. Keep it that way.
 *
 * The policy is a **prefix, not a list**. A list has to be edited every time a
 * page is added, and it defaults to whatever the author remembered; a prefix
 * defaults to *deny* and never needs editing. It also mirrors the directory
 * split — admin pages live under `app/(app)/(admin)/`, employee pages under
 * `app/(app)/saya/` — so the file tree and the policy cannot drift apart.
 *
 * `manager` is deliberately identical to `employee`. Approvals happen in the
 * admin console and no code has ever checked for that role (PRD §4 keeps it
 * schema-ready but unbuilt), so there is nothing extra to grant yet.
 */
export type Role = "hr_admin" | "manager" | "employee";

/**
 * `/profil` and `/ganti-sandi` are the pages both sides share: each only ever
 * reads or writes the session's own employee row, so neither needs a role. The
 * second one has to be reachable by everybody in particular — it is where an
 * account carrying the shared import password is sent, and denying it to any role
 * would strand exactly the people who cannot use the rest of the app yet.
 *
 * The `/saya` check is segment-exact on purpose — `startsWith("/saya")` alone
 * would also match `/sayanganku`, handing an employee any future route whose
 * name merely begins with those four letters.
 */
export function canAccess(pathname: string, role: Role): boolean {
  if (role === "hr_admin") return true;
  return (
    pathname === "/saya" ||
    pathname.startsWith("/saya/") ||
    pathname === "/profil" ||
    pathname === "/ganti-sandi"
  );
}

/**
 * Where a role lands when nothing more specific was asked for: after login, from
 * `/`, and after a denied URL.
 *
 * Whatever this returns must itself satisfy `canAccess` for that role, or the
 * proxy redirects to a page it will deny and the browser loops. access.check.ts
 * asserts exactly that.
 */
export function homeFor(role: Role): string {
  return role === "hr_admin" ? "/kehadiran" : "/saya";
}
