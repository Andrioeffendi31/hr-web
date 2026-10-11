import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import logo from "../../../../public/images/nanumhr-logo.png";
import { MasukForm } from "./masuk-form";

export const metadata = { title: "Masuk — NanumHR" };

/**
 * Login di DALAM cakupan /ios. PWA yang terpasang di Home Screen punya
 * penyimpanan cookie sendiri, terpisah dari Safari — login di /login (di luar
 * cakupan) akan membuka bilah browser dan, sesudah dipasang, tetap tidak
 * membawa sesinya masuk ke aplikasi.
 */
export default async function MasukPage() {
  const session = await auth();
  if (session?.user) redirect("/ios");

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-background px-5 pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <div className="mx-auto w-full max-w-sm space-y-8">
        <div className="space-y-4">
          <Image src={logo} alt="NanumHR" className="h-10 w-auto" priority />
          <div className="space-y-1.5">
            <h1 className="font-heading text-[28px] leading-tight font-bold tracking-tight">
              Masuk ke NanumHR
            </h1>
            <p className="text-[15px] text-muted-foreground">
              Pakai email dan kata sandi kantor Anda.
            </p>
          </div>
        </div>
        <MasukForm />
      </div>
    </main>
  );
}
