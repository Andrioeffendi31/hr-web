import assert from "node:assert/strict";

// Ditandatangani dengan kunci uji: berkas ini tidak boleh bergantung pada
// .env.local, dan tandanya hanya perlu konsisten dalam satu proses. Ditetapkan
// SEBELUM assert pertama, yang cukup karena lib/surat.ts membaca rahasianya di
// dalam fungsi, bukan di module scope.
process.env.AUTH_SECRET = "kunci-uji-surat";

import { bungkusTeks, idDariToken, nomorSurat, teksAman, tokenSurat } from "./surat";

// 1. bolak-balik
for (const id of [1, 7, 42, 999999]) {
  assert.equal(idDariToken(tokenSurat(id)), id, `token id ${id}`);
}

// 2. tanda yang dikutak-kutik ditolak — inti seluruh fiturnya
const t = tokenSurat(7);
const [nomor, tanda] = [t.slice(0, t.indexOf("-")), t.slice(t.indexOf("-") + 1)];
assert.equal(nomor, "7");
assert.equal(
  idDariToken(`7-${tanda.slice(0, -1)}${tanda.at(-1) === "A" ? "B" : "A"}`),
  null,
  "satu karakter tanda diubah",
);
// nomor pengajuan ditukar tapi tandanya dibiarkan: inilah percobaan yang paling
// wajar dilakukan orang, karena nomornya terbaca jelas di URL
assert.equal(idDariToken(`8-${tanda}`), null, "nomor ditukar, tanda lama");
assert.equal(idDariToken(tanda), null, "tanpa nomor");
// bentuk tokennya tunggal: nomor ber-nol-depan bukan token yang sama
assert.equal(idDariToken(`007-${tanda}`), null, "nomor dengan nol depan");
assert.equal(idDariToken("7-"), null, "tanda kosong");
assert.equal(idDariToken("-abc"), null, "nomor kosong");
assert.equal(idDariToken("0-abc"), null, "id nol");
assert.equal(idDariToken("abc-abc"), null, "nomor bukan angka");
assert.equal(idDariToken(""), null, "token kosong");
// tanda yang panjangnya beda tidak boleh melempar (timingSafeEqual melempar)
assert.equal(idDariToken("7-QQ"), null, "tanda kependekan");

// 3. dua pengajuan tidak boleh punya tanda yang sama
assert.notEqual(tokenSurat(7), tokenSurat(8));

// 4. nomor surat
assert.equal(nomorSurat(7, "2026-08-20"), "007/HRD/VIII/2026");
assert.equal(nomorSurat(1, "2026-01-02"), "001/HRD/I/2026");
assert.equal(nomorSurat(1234, "2025-12-31"), "1234/HRD/XII/2025");

// 5. teks yang aman untuk font PDF standar
assert.equal(teksAman("Kontrol dokter 🏥 pagi"), "Kontrol dokter  pagi");
assert.equal(teksAman("anak “sakit” — demam…"), 'anak "sakit" - demam...');
assert.equal(teksAman("mengurus akta anak"), "mengurus akta anak");
assert.equal(teksAman("Café Ibu Néng"), "Café Ibu Néng", "Latin-1 lolos utuh");
assert.equal(teksAman(null), "");
// dan yang dijaganya: apa pun yang lolos harus bisa ditulis WinAnsi
assert.match(teksAman("🙏 tolong ya 🙏"), /^[\n\x20-\x7E¡-ÿ]*$/);

// 6. pemecahan baris, dengan pengukur palsu: 10 satuan per karakter
const ukur = (t: string) => t.length * 10;
assert.deepEqual(bungkusTeks("satu dua tiga", 200, ukur), ["satu dua tiga"]);
assert.deepEqual(bungkusTeks("satu dua tiga", 90, ukur), ["satu dua", "tiga"]);
assert.deepEqual(bungkusTeks("a\nb", 90, ukur), ["a", "b"], "baris baru dihormati");
assert.deepEqual(bungkusTeks("", 90, ukur), [""], "teks kosong tetap satu baris");
assert.deepEqual(
  bungkusTeks("kata_yang_sangat_panjang lagi", 90, ukur),
  ["kata_yang_sangat_panjang", "lagi"],
  "kata yang lebih lebar dari kolomnya tidak dipotong di tengah",
);
assert.deepEqual(
  bungkusTeks("  spasi   berlebih  ", 900, ukur),
  ["spasi berlebih"],
  "spasi ganda diringkas",
);

console.log("surat.check.ts ok");
