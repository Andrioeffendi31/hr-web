import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAccess, homeFor, type Role } from "@/lib/access";

/** Optimistic route guard only — the real authorization check runs per query,
 *  in (app)/(admin)/layout.tsx, and in requireAdmin() on the server (PRD §7).
 *  Next 16 renamed Middleware to Proxy; the file must be src/proxy.ts. */
export const proxy = auth((req) => {
  const session = req.auth as { user?: { role?: Role } } | null;
  const { pathname } = req.nextUrl;

  if (!session?.user) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Sent to their own home, not to /login: bouncing an already-signed-in employee
  // back to the login page made a loop, because login only ever redirected admins
  // away from it. homeFor() is asserted to be reachable by its own role.
  const role = session.user.role as Role;
  if (!canAccess(pathname, role)) {
    return NextResponse.redirect(new URL(homeFor(role), req.url));
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
  matcher: [
    // lupa-sandi and atur-sandi are public for the same reason login is: they are
    // how somebody who cannot sign in gets back in. `kebijakan-privasi` must also
    // be readable without an account for app-store review. `buka` joins them: it
    // is the landing page for every emailed link, opened from an inbox on devices
    // that have never signed in — and it shows nobody's data.
    //
    // `verifikasi` is the QR target printed on leave letters: it is scanned by
    // outsiders — a kelurahan clerk, a school, a bank — who will never have an
    // account here. It is deliberately NOT under `buka`, whose paths app.json
    // claims as Android App Links: a scan on an employee's own phone would be
    // hijacked into the app and land on a 404 instead of the answer.
    //
    // `ios` adalah PWA karyawan iOS. Ia menjaga dirinya sendiri di
    // ios/(app)/layout.tsx dan mengarahkan ke /ios/masuk, bukan /login: PWA yang
    // terpasang punya penyimpanan cookie sendiri, terpisah dari Safari, jadi
    // login harus terjadi DI DALAM cakupan /ios. Proxy di sini juga akan menolak
    // karyawan biasa (canAccess hanya membuka konsol untuk HR) dan mengalihkan
    // service worker serta manifest-nya ke halaman login — keduanya harus bisa
    // diambil tanpa redirect.
    "/((?!login|lupa-sandi|atur-sandi|kebijakan-privasi|buka|verifikasi|ios|api|\\.well-known|_next/static|_next/image|favicon.ico).*)",
  ],
};
