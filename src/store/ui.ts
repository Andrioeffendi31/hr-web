import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Client-only UI state. Server data lives in TanStack Query, never here.
 *  Kept deliberately small: the employee drawer is driven by URL params and the
 *  search dialog owns its own input state, so neither belongs in here. */
type UiState = {
  theme: "light" | "dark";
  toggleTheme: () => void;
};

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: "light",
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
    }),
    { name: "nanumhr-ui" },
  ),
);
