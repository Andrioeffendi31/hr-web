const TZ = "Asia/Jakarta";

/** "07.41" — zona WIB, sama dengan yang dihitung server. */
export const jam = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: TZ,
      }).format(new Date(iso))
    : "—";

/** "Minggu, 11 Oktober 2026" dari YYYY-MM-DD (dibaca sebagai tanggal WIB). */
export const tanggalPanjang = (ymd: string) =>
  new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${ymd}T00:00:00Z`));

export const bulanTahun = (ym: string) =>
  new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${ym}-01T00:00:00Z`),
  );

/** Tanggal hari ini menurut WIB, YYYY-MM-DD. */
export const hariIniWib = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

export const salam = () => {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: TZ }).format(
      new Date(),
    ),
  );
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam";
};

/** Menit sejak tengah malam WIB untuk "HH:MM". */
export const menitDari = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const menitSekarangWib = () => {
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  })
    .format(new Date())
    .split(":")
    .map(Number);
  return h * 60 + m;
};

export const formatJarak = (m: number) =>
  m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;
