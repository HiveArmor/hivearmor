/**
 * msspNavStore — Zustand slice tracking the last-visited MSSP tenant id.
 * Used by HaNavigation to render the dynamic "Tenant detail" and
 * "Tenant users" sidebar links.
 */

import { create } from "zustand";

interface MsspNavState {
  lastTenantId: string | null;
  setLastTenantId: (id: string) => void;
}

export const useMsspNavStore = create<MsspNavState>()((set) => ({
  lastTenantId: null,
  setLastTenantId: (id) => set({ lastTenantId: id }),
}));
