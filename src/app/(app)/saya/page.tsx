import { Beranda } from "./beranda";

export const metadata = { title: "Beranda — Ruang HR" };

/**
 * The employee's front door.
 *
 * Unlike every other page in this app this one hands straight over to a client
 * component instead of querying drizzle itself. It is dominated by the clock
 * card, which has to be client anyway — geolocation, camera, a ticking clock —
 * and `GET /api/me` already returns this page's entire payload in one request
 * that the mobile app has been exercising for months. A server version would
 * re-derive that query and then hand most of it to a client child regardless.
 */
export default function SayaPage() {
  return <Beranda />;
}
