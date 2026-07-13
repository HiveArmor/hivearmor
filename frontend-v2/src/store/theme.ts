import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "dark" as Theme,

      setTheme: (theme: Theme) => {
        if (typeof window !== "undefined") {
          const html = document.documentElement;
          if (theme === "light") {
            html.classList.remove("dark");
            html.classList.add("light");
          } else {
            html.classList.remove("light");
            html.classList.add("dark");
          }
        }
        set({ theme });
      },

      toggleTheme: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        get().setTheme(next);
      },
    }),
    { name: "hivearmor-theme" }
  )
);
