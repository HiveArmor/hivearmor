/**
 * Theme Store Tests
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { useThemeStore } from './theme.store';

describe('useThemeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.getState().setTheme('dark');
  });

  it('initializes with theme: dark', () => {
    const state = useThemeStore.getState();
    expect(state.theme).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-ha-theme', 'dark');
  });

  it('toggles between dark and light modes and updates the document root', () => {
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('light');
    expect(document.documentElement).toHaveAttribute('data-ha-theme', 'light');

    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-ha-theme', 'dark');
  });
});
