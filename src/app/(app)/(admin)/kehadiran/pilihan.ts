import { create } from "zustand";

/**
 * Baris kehadiran yang sedang dicentang di papan.
 *
 * Sengaja BUKAN di src/store/ui.ts: yang di sana `persist`-ed, dan seleksi yang
 * bertahan melewati reload adalah seleksi yang kelak dihapus tanpa sengaja —
 * orang menutup tab, kembali besok, menekan Hapus, dan yang hilang adalah baris
 * yang dipilih kemarin untuk alasan yang sudah dilupakan.
 *
 * Juga bukan React context: checkbox-nya dirender di dalam sel DataTable yang
 * server component, jadi tiap sel harus bisa menyentuh state ini sendiri tanpa
 * ada provider yang membungkus tabelnya.
 */
type Pilihan = {
  ids: ReadonlySet<number>;
  toggle: (id: number) => void;
  kosongkan: () => void;
};

export const usePilihan = create<Pilihan>((set) => ({
  ids: new Set<number>(),
  toggle: (id) =>
    set((s) => {
      const next = new Set(s.ids);
      if (!next.delete(id)) next.add(id);
      return { ids: next };
    }),
  kosongkan: () => set({ ids: new Set<number>() }),
}));
