/**
 * Sidebar Store
 * Manages sidebar collapsed/expanded state.
 * Persisted to localStorage["ha_sidebar_collapsed"].
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: true,
      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
    }),
    { name: 'ha_sidebar_collapsed' }
  )
);
