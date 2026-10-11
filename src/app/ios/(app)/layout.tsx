import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Shell } from "./shell";

/** Semua layar PWA kecuali /ios/masuk. Penjaga halaman saja; data tetap
 *  diotorisasi per permintaan oleh withMe() di /api/me/*. */
export default async function IosAppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/ios/masuk");
  return <Shell>{children}</Shell>;
}
