import { LupaForm } from "./lupa-form";

export const metadata = { title: "Lupa kata sandi — NanumHR" };

/** Public by definition: whoever needs this cannot sign in. Excluded from the
 *  proxy matcher alongside /login. */
export default function LupaSandiPage() {
  return (
    <main className="bg-surface-2 flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="bg-card w-full max-w-[420px] rounded-[14px] border p-6 shadow-sm">
        <h1 className="text-[17px] font-semibold tracking-[-0.01em]">
          Lupa kata sandi
        </h1>
        <p className="text-muted-foreground mt-1.5 text-[12.5px] leading-relaxed">
          Masukkan email kantor Anda. Kalau terdaftar, kami kirim tautan untuk
          membuat kata sandi baru.
        </p>
        <LupaForm />
      </div>
    </main>
  );
}
