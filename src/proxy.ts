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
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
