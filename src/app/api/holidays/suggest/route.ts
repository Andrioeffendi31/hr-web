import { and, gte, lte } from "drizzle-orm";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { holidays } from "@/db/schema";
import { isIsoDate } from "@/lib/hr";

/** Google's public Indonesian holiday calendar — Indonesian names, no API key,
 *  no dependency. (The api-harilibur.vercel.app service this originally used is
 *  dead.) ponytail: if this feed ever dies too, CSV import still covers it. */
const ICS =
  "https://calendar.google.com/calendar/ical/id.indonesian%23holiday%40group.v.calendar.google.com/public/basic.ics";

type Event = { date: string; name: string; description: string };

/** Pull DTSTART/SUMMARY/DESCRIPTION out of each VEVENT. Only all-day events
 *  matter here, so the full RFC 5545 grammar is not worth pulling in. */
function parseIcs(text: string): Event[] {
  // unfold: continuation lines start with a space
  const lines = text.replace(/\r\n[ \t]/g, "").split(/\r?\n/);
  const out: Event[] = [];
  let cur: Partial<Event> = {};

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur.date && cur.name) {
        out.push({
          date: cur.date,
          name: cur.name,
          description: cur.description ?? "",
        });
      }
    } else if (line.startsWith("DTSTART;VALUE=DATE:")) {
      const d = line.slice("DTSTART;VALUE=DATE:".length).trim();
      cur.date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    } else if (line.startsWith("SUMMARY:")) {
      cur.name = line.slice(8).replace(/\\,/g, ",").trim();
    } else if (line.startsWith("DESCRIPTION:")) {
      cur.description = line.slice(12).trim();
    }
  }
  return out;
}

/**
 * Suggested Indonesian holidays for a year, for HR to review before saving.
 * Nothing is written here — official cuti bersama comes from the SKB 3 Menteri,
 * so an external feed is a starting point, never the source of truth.
 */
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const year = Number(new URL(req.url).searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return Response.json({ error: "Tahun tidak valid" }, { status: 400 });
  }

  let events: Event[];
  try {
    const res = await fetch(ICS, {
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 86400 },
    });
    if (!res.ok) throw new Error(String(res.status));
    events = parseIcs(await res.text());
    if (events.length === 0) throw new Error("kalender kosong");
  } catch {
    return Response.json(
      {
        error:
          "Gagal mengambil kalender libur, silakan input manual atau import CSV",
      },
      { status: 502 },
    );
  }

  const existing = new Set(
    (
      await db
        .select({ date: holidays.date })
        .from(holidays)
        .where(
          and(
            gte(holidays.date, `${year}-01-01`),
            lte(holidays.date, `${year}-12-31`),
          ),
        )
    ).map((r) => r.date),
  );

  const items = events
    .filter((e) => e.date.startsWith(`${year}-`) && isIsoDate(e.date))
    .map((e) => ({
      date: e.date,
      name: e.name,
      // the feed labels national holidays; anything named "cuti bersama" is one
      collective: /cuti bersama/i.test(e.name),
      exists: existing.has(e.date),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return Response.json({ year, items });
}
