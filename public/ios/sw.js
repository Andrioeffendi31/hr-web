/**
 * Service worker PWA iOS (/ios).
 *
 * Tugasnya hanya dua: menampilkan push, dan membuka PWA di halaman yang tepat
 * saat notifikasinya diketuk. Tidak ada cache offline — data absensi yang basi
 * lebih berbahaya daripada layar "tidak ada koneksi", dan iOS tidak menuntut
 * dukungan offline untuk memasang PWA atau menerima push.
 *
 * Lokasi TIDAK diambil di sini: service worker tidak punya Geolocation. Push
 * pengingat lokasi membawa url `/ios?ping=1`, dan halaman yang terbuka itulah
 * yang mengambil serta mengirim fix-nya.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  // iOS mencabut izin push dari PWA yang menerima push tanpa menampilkan
  // notifikasi, jadi setiap push SELALU berakhir dengan showNotification.
  event.waitUntil(
    self.registration.showNotification(data.title || "NanumHR", {
      body: data.body || "",
      icon: "/ios/icon-192.png",
      badge: "/ios/badge.png",
      tag: data.tag,
      data: { url: data.url || "/ios" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/ios",
    self.location.origin,
  ).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const open = windows.find((w) => new URL(w.url).pathname.startsWith("/ios"));
      if (open) {
        await open.focus();
        // client.navigate() tidak bisa diandalkan di WebKit; halaman yang
        // mendengarkan pesan ini yang berpindah sendiri lewat router-nya
        open.postMessage({ type: "navigate", url: target });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
