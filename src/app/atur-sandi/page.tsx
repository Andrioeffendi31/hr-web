import Link from "next/link";
import { peekReset } from "@/lib/reset";
import { AturForm } from "./atur-form";

export const metadata = { title: "Buat kata sandi baru — NanumHR" };

/**
 * "Lupa kata sandi" — step two, reached from the emailed link.
 *
 * The token is checked with peekReset (a read), not takeReset (a consume): landing
 * on the page, or refreshing it, must not burn the one link the person has.
 */
export default async function AturSandiPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = token ? await peekReset(token) : null;

  return (
    <main className="bg-surface-2 flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="bg-card w-full max-w-[420px] rounded-[14px] border p-6 shadow-sm">
        <h1 className="text-[17px] font-semibold tracking-[-0.01em]">
          Buat kata sandi baru
        </h1>

        {valid ? (
          <>
            <p className="text-muted-foreground mt-1.5 text-[12.5px] leading-relaxed">
              Pilih kata sandi baru. Setelah tersimpan, semua perangkat yang
              masih masuk ke akun ini akan keluar.
            </p>
            <AturForm token={token!} />
          </>
        ) : (
          <>
            <p className="text-muted-foreground mt-1.5 text-[12.5px] leading-relaxed">
              Tautan ini tidak berlaku lagi — mungkin sudah dipakai, sudah lewat
              1 jam, atau sudah diganti tautan yang lebih baru.
            </p>
            <Link
              href="/lupa-sandi"
              className="text-primary mt-4 block text-center text-[12.5px] font-medium hover:underline"
            >
              Minta tautan baru
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
