/**
 * Shared plumbing for /api/me/* — the employee self-service API the mobile app
 * (PRD-Mobile) talks to. Everything here derives the employee from the session;
 * no route may accept an employeeId from the client.
 */
import { eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { db } from "@/db";
import { employees, settings } from "@/db/schema";

export type Me = Awaited<ReturnType<typeof loadMe>>;

async function loadMe(id: number) {
  const [emp] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);
  if (!emp) throw new Error("Karyawan tidak ditemukan");
  return emp;
}

export async function config() {
  const [cfg] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (!cfg) throw new Error("Konfigurasi belum diisi");
  return cfg;
}

/**
 * Wraps a handler so it only ever runs for a signed-in employee, with the
 * employee row already loaded. Errors become JSON instead of a 500 HTML page,
 * which an Axios/fetch client on a phone cannot do anything useful with.
 */
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
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    let me;
    try {
      const user = await requireUser();
      me = await loadMe(Number(user.id));
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 401 });
    }
    if (!me.active) {
      return Response.json({ error: "Akun tidak aktif" }, { status: 403 });
    }
    try {
      return (await handler(me, req, ctx)) as Response;
    } catch (e) {
      const msg = (e as Error).message;
      // a thrown Bad is the handler's way of rejecting input; anything else is
      // a real fault and must not be reported as if the user did something wrong
      if (e instanceof Bad) return Response.json({ error: msg }, { status: e.status });
      console.error("[api/me]", req.method, new URL(req.url).pathname, e);
      return Response.json({ error: "Terjadi kesalahan di server" }, { status: 500 });
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
