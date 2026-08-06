import { eq } from "drizzle-orm";
import { requireAdmin } from "@/auth";
import { PageHead } from "@/components/bits";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { SettingsForm } from "./settings-form";

export default async function PengaturanPage() {
  await requireAdmin();
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);

  const initial = {
    companyName: row?.companyName ?? "PT Nusantara Digital",
    companyLogoUrl: row?.companyLogoUrl ?? null,
    shiftStart: (row?.shiftStart ?? "08:00:00").slice(0, 5),
    shiftEnd: (row?.shiftEnd ?? "17:00:00").slice(0, 5),
    lateToleranceMinutes: row?.lateToleranceMinutes ?? 15,
    baseLeaveQuota: row?.baseLeaveQuota ?? 12,
    weeklyOvertimeCapHours: row?.weeklyOvertimeCapHours ?? 14,
  };

  return (
    <>
      <PageHead
        title="Pengaturan perusahaan"
        desc="Satu sumber konfigurasi untuk tampilan, kehadiran, cuti, dan lembur."
      />
      <SettingsForm initial={initial} />
    </>
  );
}
