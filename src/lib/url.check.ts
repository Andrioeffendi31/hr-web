/** Self-check for the public origin every emailed link is built from.
 *  Run: npm run check */
import assert from "node:assert/strict";

/**
 * Kenapa berkas ini ada: email reset kata sandi pertama di produksi terkirim
 * dengan tautan `http://localhost:3000` — `AUTH_URL` tidak diisi di Vercel dan
 * fallback-nya diam-diam benar di laptop, salah di dunia nyata. Sebuah nilai yang
 * hanya salah di tempat yang tidak bisa dilihat dari mesin pengembang adalah
 * persis nilai yang layak dijaga assert.
 */
import { baseUrl } from "./url";

const asli = { ...process.env };
const set = (env: Record<string, string | undefined>) => {
  for (const k of ["AUTH_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"])
    delete process.env[k];
  Object.assign(process.env, env);
};

// 1. yang dinyatakan manusia selalu menang
set({
  AUTH_URL: "https://hr.nanumindahsejati.co.id",
  VERCEL_PROJECT_PRODUCTION_URL: "produksi.vercel.app",
  VERCEL_URL: "deploy-abc123.vercel.app",
});
assert.equal(baseUrl(), "https://hr.nanumindahsejati.co.id");

// 2. garis miring di ujung dibuang — tanpa ini tautannya jadi "//atur-sandi"
set({ AUTH_URL: "https://hr.nanumindahsejati.co.id/" });
assert.equal(baseUrl(), "https://hr.nanumindahsejati.co.id");

// 3. tanpa AUTH_URL: domain produksi Vercel, BUKAN localhost. Inilah yang membuat
//    env var yang lupa diisi tidak lagi mengirim tautan mati ke orang sungguhan.
set({
  VERCEL_PROJECT_PRODUCTION_URL: "hr-web-preview-app-v1.vercel.app",
  VERCEL_URL: "deploy-abc123.vercel.app",
});
assert.equal(baseUrl(), "https://hr-web-preview-app-v1.vercel.app");

// 4. domain produksi didahulukan atas URL per-deployment: yang kedua mati begitu
//    deployment-nya dihapus, dan tautan reset akan ikut mati bersamanya
set({ VERCEL_URL: "deploy-abc123.vercel.app" });
assert.equal(baseUrl(), "https://deploy-abc123.vercel.app");

// 5. di laptop, tanpa satu pun dari ketiganya
set({});
assert.equal(baseUrl(), "http://localhost:3000");

Object.assign(process.env, asli);
console.log("url.check.ts ok");
