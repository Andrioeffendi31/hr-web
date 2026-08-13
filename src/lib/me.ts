/**
 * Shared plumbing for /api/me/* — the employee self-service API the mobile app
 * (PRD-Mobile) talks to. Everything here derives the employee from the session;
 * no route may accept an employeeId from the client.
 */
import { eq, getTableColumns } from "drizzle-orm";
import { requireUser, stale } from "@/auth";
import { db } from "@/db";
import { divisions, employees, settings } from "@/db/schema";

export type Me = Awaited<ReturnType<typeof loadMe>>;

/**
 * The employee row, plus their division's shift columns flattened onto it.
 *
 * Joined here rather than queried per route because this runs on every /api/me/*
 * request anyway, and three of those routes need the shift — a separate lookup
 * would be a second round trip for three columns. The result satisfies
 * resolveShift() directly; a left join, so an employee whose division has no
 * override simply carries nulls and inherits the company default.
 */
async function loadMe(id: number) {
  const [emp] = await db
    .select({
      ...getTableColumns(employees),
      shiftStart: divisions.shiftStart,
      shiftEnd: divisions.shiftEnd,
      lateToleranceMinutes: divisions.lateToleranceMinutes,
    })
    .from(employees)
    .leftJoin(divisions, eq(employees.division, divisions.name))
    .where(eq(employees.id, id))
    .limit(1);
  if (!emp) throw new Error("Karyawan tidak ditemukan");
  return emp;
}

export async function config() {
  const [cfg] = await db
    .select()
    .from(settings)
    .where(eq(settings.id, 1))
    .limit(1);
  if (!cfg) throw new Error("Konfigurasi belum diisi");
  return cfg;
}

/**
 * Wraps a handler so it only ever runs for a signed-in employee, with the
 * employee row already loaded. Errors become JSON instead of a 500 HTML page,
 * which an Axios/fetch client on a phone cannot do anything useful with.
 */
/** The bootstrap that tells a client the flag is set, and the one that clears it.
 *  Blocking either would leave an account with no way to fix itself. */
const SANDI_OK = new Set(["/api/me", "/api/me/password"]);

export function withMe<T>(
  handler: (
    me: Awaited<ReturnType<typeof loadMe>>,
    req: Request,
    /** Next's route context, forwarded so a dynamic segment can be read from
     *  params instead of being sliced back out of the URL. Handlers that do not
     *  need it simply declare two parameters. */
    ctx: { params: Promise<Record<string, string>> },
  ) => Promise<T>,
) {
  return async (
    req: Request,
    ctx: { params: Promise<Record<string, string>> },
  ) => {
    let me;
    let pwdAt: number | undefined;
    try {
      const user = await requireUser();
      pwdAt = user.pwdAt;
      me = await loadMe(Number(user.id));
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 401 });
    }
    if (!me.active) {
      return Response.json({ error: "Akun tidak aktif" }, { status: 403 });
    }
    // The password changed after this token was minted — on another device, or by
    // HR resetting the account. 401, so the phone clears its stored session and
    // asks for the new password (api.ts already does exactly that on a 401).
    if (stale(me.passwordChangedAt, pwdAt)) {
      return Response.json(
        { error: "Sesi berakhir, silakan masuk lagi" },
        { status: 401 },
      );
    }
    /**
     * An account still on the shared password HR handed out gets no API surface
     * beyond the two endpoints that retire it.
     *
     * The redirect in (app)/layout.tsx and the mobile SandiGate are navigation,
     * not enforcement: an older build of the app, or curl with a valid cookie,
     * would still clock in as somebody who has never opened the UI. One guard in
     * the shared wrapper covers every /api/me/* route, including ones not written
     * yet.
     *
     * 403 and not 401: the caller is correctly authenticated, and a 401 makes the
     * phone wipe its stored session and bounce to the login screen (api.ts), which
     * is precisely the wrong instruction here.
     */
    if (me.mustChangePassword) {
      const path = new URL(req.url).pathname.replace(/\/+$/, "");
      if (!SANDI_OK.has(path)) {
        return Response.json(
          {
            error: "Buat kata sandi baru dulu untuk melanjutkan",
            code: "must_change_password",
          },
          { status: 403 },
        );
      }
    }
    try {
      return (await handler(me, req, ctx)) as Response;
    } catch (e) {
      const msg = (e as Error).message;
      // a thrown Bad is the handler's way of rejecting input; anything else is
      // a real fault and must not be reported as if the user did something wrong
      if (e instanceof Bad)
        return Response.json({ error: msg }, { status: e.status });
      console.error("[api/me]", req.method, new URL(req.url).pathname, e);
      return Response.json(
        { error: "Terjadi kesalahan di server" },
        { status: 500 },
      );
    }
  };
}

/** Client error with a message meant for the phone's toast. */
export class Bad extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
