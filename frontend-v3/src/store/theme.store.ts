/**
 * Theme Store
 * Persists the analyst's Hive Carbon appearance preference and applies it to
 * the document root so every component resolves the same semantic tokens.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type HaTheme = 'dark' | 'light';

interface ThemeState {
  theme: HaTheme;
  setTheme: (theme: HaTheme) => void;
  toggleTheme: () => void;
}

function applyTheme(theme: HaTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.haTheme = theme;
  document.documentElement.style.colorScheme = theme;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleTheme: () => {
        const theme: HaTheme = get().theme === 'dark' ? 'light' : 'dark';
        applyTheme(theme);
        set({ theme });
      },
    }),
    {
      name: 'ha_theme',
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    },
  ),
);

applyTheme(useThemeStore.getState().theme);
