/**
 * Auth Store
 * Manages authentication state, user data, and tenant selection.
 * Token is stored in localStorage["hivearmor_auth_token"].
 */

import { create } from 'zustand';

const TENANT_PREFERENCE_KEY = 'ha_selected_tenant_id';

function readTenantPreference(): number | null {
  try {
    const raw = sessionStorage.getItem(TENANT_PREFERENCE_KEY);
    if (raw === null || raw === '' || raw === 'all') return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeTenantPreference(tenantId: number | null): void {
  try {
    sessionStorage.setItem(TENANT_PREFERENCE_KEY, tenantId === null ? 'all' : String(tenantId));
  } catch {
    // Private mode or quota — selection still applies for this page session.
  }
}

function clearTenantPreference(): void {
  try {
    sessionStorage.removeItem(TENANT_PREFERENCE_KEY);
  } catch {
    // ignore
  }
}

export interface HaUser {
  id: number;
  login: string;
  firstName: string;
  lastName: string;
  email: string;
  roles: string[];
  langKey: string;
  imageUrl?: string;
}

interface AuthState {
  user: HaUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  selectedTenantId: number | null;

  // Actions
  setUser: (user: HaUser, token: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  setSelectedTenant: (tenantId: number | null) => void;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  getDefaultLanding: () => string;
}

const visualFixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';
const foundationVisualUser: HaUser = {
  id: 41,
  login: 'maya.chen',
  firstName: 'Maya',
  lastName: 'Chen',
  email: 'maya.chen@example.test',
  roles: ['ROLE_ANALYST', 'ROLE_SOC_MANAGER'],
  langKey: 'en',
};
const foundationVisualToken = 'foundation-visual-validation-token';

export const useAuthStore = create<AuthState>((set, get) => ({
  // Fixture review sessions are authenticated synchronously so the protected
  // router never paints /login. Both the DEV check and explicit environment
  // flag are required; production retains the normal unauthenticated state.
  user: visualFixtureMode ? foundationVisualUser : null,
  token: visualFixtureMode ? foundationVisualToken : null,
  isAuthenticated: visualFixtureMode,
  isLoading: !visualFixtureMode,
  selectedTenantId: visualFixtureMode ? null : readTenantPreference(),

  setUser: (user, token) => {
    localStorage.setItem('hivearmor_auth_token', token);
    set({ user, token, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    localStorage.removeItem('hivearmor_auth_token');
    clearTenantPreference();
    set({ user: null, token: null, isAuthenticated: false, isLoading: false, selectedTenantId: null });
  },

  setLoading: (loading) => set({ isLoading: loading }),

  setSelectedTenant: (tenantId) => {
    writeTenantPreference(tenantId);
    set({ selectedTenantId: tenantId });
  },

  hasRole: (role) => {
    const { user } = get();
    return user?.roles.includes(role) ?? false;
  },

  hasAnyRole: (roles) => {
    const { user } = get();
    return roles.some(r => user?.roles.includes(r)) ?? false;
  },

  getDefaultLanding: () => {
    const { user } = get();
    if (!user) return '/login';
    if (user.roles.includes('ROLE_ADMIN')) return '/admin/users';
    return '/queue';
  },
}));
