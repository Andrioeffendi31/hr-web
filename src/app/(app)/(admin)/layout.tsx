import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canAccess, homeFor, type Role } from "@/lib/access";

/**
 * The real guard for every admin page.
 *
 * It exists as a route-group layout rather than an `await requireAdmin()` at the
 * top of each page because there were twelve pages and **nine of them had no
 * server-side check at all** — they were safe only because the proxy refused
 * every non-admin, and the day the proxy learned about employees, all nine would
 * have opened at once. A per-page call is a rule you have to remember twelve
 * times and then forever; a group layout is one file, and the thirteenth admin
 * page inherits it by virtue of where it sits on disk.
 *
 * `redirect()`, not the `requireAdmin()` that throws: a throw here surfaces as
 * error.tsx with a message production redacts, which is a worse answer than
 * quietly handing somebody the area they *are* allowed into.
 *
 * Known ceiling: a layout does not re-run on client-side navigation within the
 * same subtree. Harmless here — the role is fixed in the JWT for the life of the
 * session, and the proxy re-checks every document request.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const peran = session.user.role as Role;
  if (!canAccess("/kehadiran", peran)) redirect(homeFor(peran));
  return children;
}
