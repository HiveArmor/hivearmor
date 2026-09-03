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

  it('cycles dark → modern → light → dark and updates the document root', () => {
    useThemeStore.getState().setTheme('dark');

    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('modern');
    expect(document.documentElement).toHaveAttribute('data-ha-theme', 'modern');

    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('light');
    expect(document.documentElement).toHaveAttribute('data-ha-theme', 'light');

    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-ha-theme', 'dark');
  });

  it('setTheme applies the modern theme with a dark color-scheme', () => {
    useThemeStore.getState().setTheme('modern');
    expect(useThemeStore.getState().theme).toBe('modern');
    expect(document.documentElement).toHaveAttribute('data-ha-theme', 'modern');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });
});
