"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  Building2,
  CalendarCheck2,
  Clock3,
  MapPin,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FileDrop } from "@/components/file-drop";
import { SelectField } from "@/components/select-field";
import { cn } from "@/lib/utils";

type SettingsValue = {
  companyName: string;
  companyLogoUrl: string | null;
  shiftStart: string;
  shiftEnd: string;
  lateToleranceMinutes: number;
  baseLeaveQuota: number;
  weeklyOvertimeCapHours: number;
  /** id of the office the app offers first; "" when none is chosen */
  defaultLocationId: string;
};

/** Just enough of an office to name it and show the geofence it carries. */
type Location = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
};

const LABEL = "text-[12px] font-medium";
const FIELD =
  "bg-card border-border-strong mt-1 h-9 w-full rounded-[9px] border px-3 text-[13px] outline-none transition-shadow focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20";

async function errorFrom(res: Response, fallback: string) {
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    [key: string]: unknown;
  };
  if (!res.ok) throw new Error(data.error ?? fallback);
  return data;
}

export function SettingsForm({
  initial,
  locations,
}: {
  initial: SettingsValue;
  locations: Location[];
}) {
  const router = useRouter();
  const [logoKey, setLogoKey] = useState(initial.companyLogoUrl);
  const [saved, setSaved] = useState(false);
  // mirrored in state only so the coordinates below the select can follow it
  const [defaultLocationId, setDefaultLocationId] = useState(
    initial.defaultLocationId,
  );
  const chosen = locations.find((l) => String(l.id) === defaultLocationId);

  const save = useMutation({
    mutationFn: async (payload: Record<string, FormDataEntryValue>) =>
      errorFrom(
        await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        "Pengaturan gagal disimpan",
      ),
    onSuccess: () => {
      setSaved(true);
      toast.success("Pengaturan perusahaan disimpan");
      router.refresh();
      window.setTimeout(() => setSaved(false), 2200);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const logo = useMutation({
    mutationFn: async (file: File) => {
      const data = new FormData();
      data.append("kind", "logo");
      data.append("file", file);
      return errorFrom(
        await fetch("/api/files", { method: "POST", body: data }),
        "Logo gagal diunggah",
      );
    },
    onSuccess: (data) => {
      setLogoKey(String(data.key));
      toast.success("Logo perusahaan diperbarui");
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeLogo = useMutation({
    mutationFn: async () =>
      errorFrom(
        await fetch("/api/settings", { method: "DELETE" }),
        "Logo gagal dihapus",
      ),
    onSuccess: () => {
      setLogoKey(null);
      toast.success("Logo perusahaan dihapus");
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_272px]"
      onChange={() => setSaved(false)}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(Object.fromEntries(new FormData(e.currentTarget)));
      }}
    >
      <div className="space-y-4">
        <SettingSection
          icon={Building2}
          title="Identitas perusahaan"
          description="Nama dan logo ini tampil pada navigasi utama untuk seluruh tim HR."
        >
          <div className="grid items-start gap-5 lg:grid-cols-1">
            <label className={LABEL}>
              Nama perusahaan
              <input
                name="companyName"
                required
                minLength={2}
                maxLength={120}
                defaultValue={initial.companyName}
                className={FIELD}
              />
              <span className="text-subtle mt-1.5 block text-[11px] font-normal">
                Gunakan nama legal atau nama yang dikenal karyawan.
              </span>
            </label>

            <div className="min-w-0">
              <span className={LABEL}>Logo perusahaan</span>
              {logoKey && (
                <div className="bg-surface-2 mt-1 mb-2 flex items-center gap-3 rounded-[10px] border p-2.5">
                  <div className="bg-card flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
                    {logoKey ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={logoKey}
                        src={`/api/files/${logoKey}?v=${logo.submittedAt || 0}`}
                        alt="Logo perusahaan saat ini"
                        className="size-full object-contain p-1"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium">
                      Logo saat ini
                    </span>
                    <span className="text-subtle block text-[10.5px]">
                      Akan langsung diperbarui di navigasi
                    </span>
                  </div>
                  <ConfirmDialog
                    destructive
                    title="Hapus logo perusahaan?"
                    description="Navigasi akan kembali memakai ikon bawaan Ruang HR."
                    confirmLabel="Hapus logo"
                    onConfirm={() => removeLogo.mutate()}
                    trigger={
                      <button
                        type="button"
                        disabled={removeLogo.isPending}
                        className="text-danger hover:bg-danger-subtle inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="size-3" aria-hidden />
                        Hapus
                      </button>
                    }
                  />
                </div>
              )}
              <FileDrop
                accept=".jpg,.jpeg,.png,.webp"
                maxBytes={2 * 1024 * 1024}
                disabled={logo.isPending || removeLogo.isPending}
                hint={
                  logo.isPending
                    ? "Sedang mengunggah logo…"
                    : "PNG, JPG, atau WEBP · maksimal 2 MB"
                }
                onFile={(file) => file && logo.mutate(file)}
                className="mt-1"
              />
            </div>
          </div>
        </SettingSection>

        <SettingSection
          icon={Clock3}
          title="Jadwal kerja default"
          description="Dipakai oleh divisi yang tidak mengatur jam kerjanya sendiri."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Jam masuk"
              name="shiftStart"
              type="time"
              defaultValue={initial.shiftStart}
            />
            <Field
              label="Jam keluar"
              name="shiftEnd"
              type="time"
              defaultValue={initial.shiftEnd}
            />
            <Field
              label="Toleransi keterlambatan"
              name="lateToleranceMinutes"
              type="number"
              min={0}
              max={120}
              suffix="menit"
              defaultValue={initial.lateToleranceMinutes}
            />
          </div>
          <p className="text-subtle mt-3 text-[11.5px] leading-relaxed">
            Contoh: jam masuk 08:00 dengan toleransi 15 menit berarti absen
            setelah 08:15 berstatus terlambat.{" "}
            <Link
              href="/divisi"
              className="text-primary font-medium hover:underline"
            >
              Divisi dengan jam berbeda diatur di sini ↗
            </Link>
          </p>
        </SettingSection>

        <SettingSection
          icon={CalendarCheck2}
          title="Kebijakan cuti & lembur"
          description="Batas dasar yang dipakai saat menghitung saldo dan memvalidasi pengajuan."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Jatah cuti tahunan"
              name="baseLeaveQuota"
              type="number"
              min={1}
              max={60}
              suffix="hari / tahun"
              defaultValue={initial.baseLeaveQuota}
            />
            <Field
              label="Batas lembur mingguan"
              name="weeklyOvertimeCapHours"
              type="number"
              min={1}
              max={40}
              suffix="jam / minggu"
              defaultValue={initial.weeklyOvertimeCapHours}
            />
          </div>
          <p className="text-subtle mt-3 text-[11.5px] leading-relaxed">
            Masa kerja tetap menambah cuti 1 hari setiap 2 tahun. Nilai di atas
            adalah kuota dasarnya.
          </p>
        </SettingSection>

        <SettingSection
          icon={MapPin}
          title="Lokasi absensi"
          description="Karyawan memilih titik absen saat masuk; absen keluar mengikuti pilihan itu."
        >
          {locations.length === 0 ? (
            <p className="text-muted-foreground text-[12.5px] leading-relaxed">
              Belum ada lokasi absen, jadi karyawan hanya bisa absen dengan
              menandai WFH.
            </p>
          ) : (
            <>
              <div className={LABEL}>
                <label htmlFor="defaultLocationId">Kantor default</label>
                <SelectField
                  id="defaultLocationId"
                  name="defaultLocationId"
                  defaultValue={defaultLocationId}
                  onChange={setDefaultLocationId}
                  ariaLabel="Kantor default"
                  className="mt-1 h-9 w-full sm:max-w-[280px]"
                  options={locations.map((l) => ({
                    value: String(l.id),
                    label: l.name,
                  }))}
                />
              </div>
              {/* read-only: the coordinates belong to the location, and editing
                  them in two places is how the two places start disagreeing */}
              <p className="text-subtle tnum mt-2 text-[11.5px]">
                {chosen
                  ? `${chosen.lat.toFixed(6)}, ${chosen.lng.toFixed(6)} · radius ${chosen.radiusM} m`
                  : "Lokasi ini sudah tidak aktif — pilih yang lain."}
              </p>
              <p className="text-subtle mt-3 text-[11.5px] leading-relaxed">
                Ini yang ditawarkan aplikasi lebih dulu. Begitu GPS menjawab,
                titik terdekatlah yang dipilih, kecuali karyawan menggantinya
                sendiri.
              </p>
            </>
          )}
          <Link
            href="/lokasi"
            className="text-primary mt-3 inline-flex text-[12px] font-medium hover:underline"
          >
            Kelola lokasi absen ↗
          </Link>
        </SettingSection>
      </div>

      <aside className="bg-card sticky top-0 rounded-[13px] border p-4 shadow-sm xl:top-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full transition-colors",
              saved ? "bg-success" : "bg-warning",
            )}
            aria-hidden
          />
          <h2 className="text-[13.5px] font-semibold">
            {saved ? "Perubahan tersimpan" : "Konfigurasi aktif"}
          </h2>
        </div>
        <p className="text-muted-foreground mt-2 text-[12px] leading-relaxed">
          Setelah disimpan, aturan baru langsung dipakai pada absensi dan
          pengajuan berikutnya.
        </p>
        <div className="mt-4 space-y-2 border-y py-3 text-[11.5px]">
          <Summary
            label="Jam kerja default"
            value={`${initial.shiftStart}–${initial.shiftEnd}`}
          />
          <Summary label="Kantor default" value={chosen?.name ?? "—"} />
          <Summary
            label="Cuti dasar"
            value={`${initial.baseLeaveQuota} hari`}
          />
        </div>
        <Button type="submit" className="mt-4 w-full" disabled={save.isPending}>
          <Save aria-hidden />
          {save.isPending ? "Menyimpan…" : "Simpan perubahan"}
        </Button>
        <p className="text-subtle mt-2 text-center text-[10.5px]">
          Setiap perubahan dicatat dalam audit log.
        </p>
      </aside>
    </form>
  );
}

function SettingSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Building2;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card rounded-[13px] border shadow-sm">
      <header className="flex items-start gap-3 border-b px-4 pt-4 pb-3.5 sm:px-5 sm:pt-5">
        <span className="bg-primary-subtle text-primary flex size-9 shrink-0 items-center justify-center rounded-[10px]">
          <Icon className="size-[17px]" aria-hidden />
        </span>
        <div className="min-w-0 pt-0.5">
          <h2 className="text-[14px] font-semibold tracking-[-0.01em]">
            {title}
          </h2>
          <p className="text-muted-foreground mt-0.5 max-w-[62ch] text-[11.5px] leading-relaxed text-pretty">
            {description}
          </p>
        </div>
      </header>
      <div className="px-4 pt-4 pb-5 sm:px-5 sm:pt-5 sm:pb-6">{children}</div>
    </section>
  );
}

function Field({
  label,
  suffix,
  ...props
}: React.ComponentProps<"input"> & { label: string; suffix?: string }) {
  return (
    <label className={LABEL}>
      {label}
      <span className="relative block">
        <input {...props} required className={cn(FIELD, suffix && "pr-24")} />
        {suffix && (
          <span className="text-subtle pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[11px] font-normal">
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-subtle">{label}</span>
      <span className="tnum font-medium">{value}</span>
    </div>
  );
}
