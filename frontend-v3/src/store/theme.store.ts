/**
 * Theme Store
 * Persists the analyst's Hive Carbon appearance preference and applies it to
 * the document root so every component resolves the same semantic tokens.
 * First visit (no persisted preference) follows prefers-color-scheme.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type HaTheme = 'dark' | 'light';

interface ThemeState {
  theme: HaTheme;
  setTheme: (theme: HaTheme) => void;
  toggleTheme: () => void;
}

function systemTheme(): HaTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(theme: HaTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.haTheme = theme;
  document.documentElement.style.colorScheme = theme;
}

function readPersistedTheme(): HaTheme | null {
  try {
    const raw = localStorage.getItem('ha_theme');
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'state' in parsed &&
      typeof (parsed as { state?: { theme?: unknown } }).state?.theme === 'string'
    ) {
      const theme = (parsed as { state: { theme: string } }).state.theme;
      if (theme === 'dark' || theme === 'light') return theme;
    }
  } catch {
    // ignore corrupt preference
  }
  return null;
}

const initialTheme = readPersistedTheme() ?? systemTheme();

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: initialTheme,
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
