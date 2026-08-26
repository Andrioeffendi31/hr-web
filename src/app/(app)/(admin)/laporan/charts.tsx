"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { tanggalPendek } from "@/lib/hr";

/**
 * Chart /laporan. Klien, karena recharts mengukur wadahnya di browser; datanya
 * sudah dihitung di server (lihat agregat.ts) jadi yang menyeberang cuma angka.
 *
 * Warnanya token, bukan hex: `var(--success)` dan kawan-kawan sudah punya nilai
 * terang dan gelap di globals.css, jadi grafiknya ikut tema tanpa satu pun
 * cabang di sini.
 */

export type IrisanDonut = {
  key: string;
  label: string;
  value: number;
  color: string;
};

/**
 * Donut + angka di tengahnya.
 *
 * Total nol digambar sebagai satu cincin abu, bukan lingkaran kosong: panel yang
 * hilang membuat orang mengira halamannya rusak, sedangkan cincin kosong dengan
 * "—" di tengah mengatakan yang sebenarnya, yaitu belum ada yang bisa dihitung.
 */
export function Donut({
  data,
  pusat,
  pusatLabel,
}: {
  data: IrisanDonut[];
  pusat: string;
  pusatLabel: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const config: ChartConfig = Object.fromEntries(
    data.map((d) => [d.key, { label: d.label, color: d.color }]),
  );
  const irisan = total
    ? data.filter((d) => d.value > 0)
    : [
        {
          key: "kosong",
          label: "Belum ada data",
          value: 1,
          color: "var(--muted)",
        },
      ];

  return (
    <div className="relative">
      <ChartContainer
        config={config}
        className="mx-auto aspect-square max-h-[188px]"
      >
        <PieChart>
          {total > 0 && (
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel nameKey="key" />}
            />
          )}
          <Pie
            data={irisan}
            dataKey="value"
            nameKey="key"
            innerRadius="64%"
            outerRadius="93%"
            paddingAngle={irisan.length > 1 ? 1.5 : 0}
            strokeWidth={0}
            isAnimationActive={false}
          >
            {irisan.map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      {/* teks tengah di atas chart, bukan <text> di dalamnya: recharts tidak
          menaruh label tengah tanpa perhitungan koordinat manual */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum text-[21px] font-bold tracking-tight">
          {pusat}
        </span>
        <span className="text-subtle mt-0.5 text-[11px]">{pusatLabel}</span>
      </div>
    </div>
  );
}

const TREN_CONFIG = {
  hadir: { label: "Hadir", color: "var(--success)" },
  telat: { label: "Terlambat", color: "var(--warning)" },
  alpa: { label: "Tanpa Keterangan", color: "var(--danger)" },
} satisfies ChartConfig;

/**
 * Tren harian, tiga seri persen.
 *
 * `connectNulls` mati: hari tanpa hari kerja memang tidak punya nilai (lihat
 * `tren()` di agregat.ts), dan menyambungnya berarti menggambar garis melewati
 * hari yang tidak pernah dinilai siapa pun.
 */
export function TrenGaris({
  data,
}: {
  data: {
    date: string;
    hadir: number | null;
    telat: number | null;
    alpa: number | null;
  }[];
}) {
  return (
    <ChartContainer config={TREN_CONFIG} className="h-[188px] w-full">
      <LineChart
        data={data}
        margin={{ top: 6, right: 8, bottom: 0, left: -18 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={(v: string) => tanggalPendek(v)}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${v}%`}
          tick={{ fontSize: 11 }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(v) => tanggalPendek(String(v))}
              formatter={(value, name) => (
                <span className="text-muted-foreground flex flex-1 justify-between gap-3 text-[12px]">
                  {TREN_CONFIG[name as keyof typeof TREN_CONFIG]?.label ?? name}
                  <span className="tnum text-foreground font-medium">
                    {value}%
                  </span>
                </span>
              )}
            />
          }
        />
        {(["hadir", "telat", "alpa"] as const).map((k) => (
          <Line
            key={k}
            dataKey={k}
            type="monotone"
            stroke={`var(--color-${k})`}
            strokeWidth={2.25}
            /**
             * Titik yang cukup besar untuk dibaca sendirian.
             *
             * Hari tanpa hari kerja memutus garisnya (`connectNulls` mati), jadi
             * pada periode yang sebagian besar harinya belum dinilai yang tersisa
             * di layar HANYA titik — dan titik r=2 tanpa cincin praktis tidak
             * terlihat. Cincin sewarna kartu memisahkan titik yang bertumpuk
             * ketika dua seri bernilai sama.
             */
            dot={{
              r: 3.2,
              fill: `var(--color-${k})`,
              stroke: "var(--card)",
              strokeWidth: 1.4,
            }}
            activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 1.5 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

const HARI_CONFIG = {
  pct: { label: "Tingkat kehadiran", color: "var(--success)" },
} satisfies ChartConfig;

/** Tujuh batang Sen…Min. Hari tanpa hari kerja tidak punya batang dan tidak punya label. */
export function BarPerHari({
  data,
}: {
  data: { label: string; pct: number | null }[];
}) {
  return (
    <ChartContainer config={HARI_CONFIG} className="h-[212px] w-full">
      <BarChart
        data={data}
        margin={{ top: 20, right: 8, bottom: 0, left: -18 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${v}%`}
          tick={{ fontSize: 11 }}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <span className="text-muted-foreground flex flex-1 justify-between gap-3 text-[12px]">
                  Tingkat kehadiran
                  <span className="tnum text-foreground font-medium">
                    {value}%
                  </span>
                </span>
              )}
            />
          }
        />
        <Bar
          dataKey="pct"
          fill="var(--color-pct)"
          radius={[5, 5, 0, 0]}
          maxBarSize={34}
          isAnimationActive={false}
        >
          <LabelList
            dataKey="pct"
            position="top"
            offset={7}
            className="tnum fill-foreground"
            fontSize={11}
            formatter={(v) => (v === null || v === undefined ? "" : `${v}%`)}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
