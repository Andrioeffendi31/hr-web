import { NextResponse } from "next/server";
import { auth } from "@/auth";

/** Optimistic route guard only — the real authorization check runs per query
 *  and in requireAdmin() on the server (PRD §7). Next 16 renamed Middleware
 *  to Proxy; the file must be src/proxy.ts. */
export const proxy = auth((req) => {
  const session = req.auth as { user?: { role?: string } } | null;
  const { pathname } = req.nextUrl;

  if (!session?.user) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (session.user.role !== "hr_admin") {
    return NextResponse.redirect(new URL("/login?error=admin_only", req.url));
  }
  return NextResponse.next();
});

export default proxy;

export const config = {
  // `api` is excluded wholesale: every handler already calls requireAdmin() or
  // requireUser(), and the role check above can only express one role — which
  // 307'd the employee-facing endpoints (mobile app, own-file download) to
  // /login. Guarding pages here and authorizing APIs in the handlers is one
  // rule each, instead of an exclusion list that grows per endpoint.
  //
  // `.well-known` must stay public and un-redirected: Apple and Google fetch the
  // association files anonymously and refuse to follow a redirect, so guarding
  // them would silently break passkey enrolment in the mobile app.
  matcher: ["/((?!login|api|\\.well-known|_next/static|_next/image|favicon.ico).*)"],
};
