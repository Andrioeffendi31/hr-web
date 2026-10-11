/** Konstanta PWA yang dipakai server dan klien sekaligus. */
export const PLAY_STORE =
  "https://play.google.com/store/apps/details?id=app.nanumhr";

/** Jeda minimum antar ping dari PWA — sama dengan MIN_GAP_PWA_MS di
 *  api/attendance/ping. Dipakai klien supaya tidak mengirim yang pasti ditolak. */
export const PING_GAP_MS = 90 * 60 * 1000;
