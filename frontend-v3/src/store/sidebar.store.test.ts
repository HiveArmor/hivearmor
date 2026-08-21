/**
 * Sidebar Store Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { useSidebarStore } from './sidebar.store';

describe('useSidebarStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useSidebarStore.setState({ collapsed: true });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('initializes with collapsed: true', () => {
    const state = useSidebarStore.getState();
    expect(state.collapsed).toBe(true);
  });

  it('toggle switches collapsed state', () => {
    const { toggle } = useSidebarStore.getState();

    toggle();
    expect(useSidebarStore.getState().collapsed).toBe(false);

    toggle();
    expect(useSidebarStore.getState().collapsed).toBe(true);
  });

  it('setCollapsed updates collapsed state', () => {
    const { setCollapsed } = useSidebarStore.getState();

    setCollapsed(true);
    expect(useSidebarStore.getState().collapsed).toBe(true);

    setCollapsed(false);
    expect(useSidebarStore.getState().collapsed).toBe(false);
  });

  it('persists state to localStorage', () => {
    const { setCollapsed } = useSidebarStore.getState();
    setCollapsed(true);

    // Check localStorage key matches spec (ha_sidebar_collapsed)
    const stored = localStorage.getItem('ha_sidebar_collapsed');
    expect(stored).toBeTruthy();
    if (!stored) return; // Type guard for TypeScript

    const parsed = JSON.parse(stored);
    expect(parsed.state.collapsed).toBe(true);
  });
});
