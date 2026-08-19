import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/auth";
import { PageHead } from "@/components/bits";
import { db } from "@/db";
import { officeLocations, settings } from "@/db/schema";
import { SettingsForm } from "./settings-form";
import { PERUSAHAAN } from "@/lib/hr";

export default async function PengaturanPage() {
  await requireAdmin();
  const [[row], locations] = await Promise.all([
    db.select().from(settings).where(eq(settings.id, 1)).limit(1),
    // active only: offering a retired site as the default would put it back in
    // front of every employee, which is the opposite of what deactivating meant
    db
      .select()
      .from(officeLocations)
      .where(eq(officeLocations.active, true))
      .orderBy(asc(officeLocations.name)),
  ]);

  const initial = {
    companyName: row?.companyName ?? PERUSAHAAN,
    companyLogoUrl: row?.companyLogoUrl ?? null,
    shiftStart: (row?.shiftStart ?? "08:00:00").slice(0, 5),
    shiftEnd: (row?.shiftEnd ?? "17:00:00").slice(0, 5),
    lateToleranceMinutes: row?.lateToleranceMinutes ?? 15,
    baseLeaveQuota: row?.baseLeaveQuota ?? 12,
    weeklyOvertimeCapHours: row?.weeklyOvertimeCapHours ?? 14,
    // fall back to the first location, so a company that never chose still shows
    // the app the same office the app would have shown anyway
    defaultLocationId: String(row?.defaultLocationId ?? locations[0]?.id ?? ""),
    trackingSince: row?.trackingSince ?? null,
  };

  return (
    <>
      <PageHead
        title="Pengaturan perusahaan"
        desc="Satu sumber konfigurasi untuk tampilan, kehadiran, cuti, dan lembur."
      />
      <SettingsForm
        initial={initial}
        locations={locations.map((l) => ({
          id: l.id,
          name: l.name,
          lat: Number(l.lat),
          lng: Number(l.lng),
          radiusM: l.radiusM,
        }))}
      />
    </>
  );
}
