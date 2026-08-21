/**
 * Auth Store Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { useAuthStore, type HaUser } from './auth.store';

describe('useAuthStore', () => {
  const mockUser: HaUser = {
    id: 1,
    login: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    roles: ['ROLE_ANALYST'],
    langKey: 'en',
  };

  const mockToken = 'mock-jwt-token';

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      selectedTenantId: null,
    });
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('initializes with default state', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(true);
    expect(state.selectedTenantId).toBeNull();
  });

  it('setUser stores token in localStorage and updates state', () => {
    const { setUser } = useAuthStore.getState();
    setUser(mockUser, mockToken);

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.token).toBe(mockToken);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(localStorage.getItem('hivearmor_auth_token')).toBe(mockToken);
  });

  it('logout clears token from localStorage and resets state', () => {
    const { setUser, logout } = useAuthStore.getState();
    setUser(mockUser, mockToken);
    logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.selectedTenantId).toBeNull();
    expect(localStorage.getItem('hivearmor_auth_token')).toBeNull();
  });

  it('setLoading updates loading state', () => {
    const { setLoading } = useAuthStore.getState();
    setLoading(false);
    expect(useAuthStore.getState().isLoading).toBe(false);

    setLoading(true);
    expect(useAuthStore.getState().isLoading).toBe(true);
  });

  it('setSelectedTenant updates selected tenant', () => {
    const { setSelectedTenant } = useAuthStore.getState();
    setSelectedTenant(42);
    expect(useAuthStore.getState().selectedTenantId).toBe(42);
    expect(sessionStorage.getItem('ha_selected_tenant_id')).toBe('42');

    setSelectedTenant(null);
    expect(useAuthStore.getState().selectedTenantId).toBeNull();
    expect(sessionStorage.getItem('ha_selected_tenant_id')).toBe('all');
  });

  it('logout clears persisted tenant preference', () => {
    const { setUser, setSelectedTenant, logout } = useAuthStore.getState();
    setUser(mockUser, mockToken);
    setSelectedTenant(1);
    logout();
    expect(useAuthStore.getState().selectedTenantId).toBeNull();
    expect(sessionStorage.getItem('ha_selected_tenant_id')).toBeNull();
  });

  it('hasRole returns true when user has the role', () => {
    const { setUser, hasRole } = useAuthStore.getState();
    setUser(mockUser, mockToken);
    expect(hasRole('ROLE_ANALYST')).toBe(true);
  });

  it('hasRole returns false when user does not have the role', () => {
    const { setUser, hasRole } = useAuthStore.getState();
    setUser(mockUser, mockToken);
    expect(hasRole('ROLE_ADMIN')).toBe(false);
  });

  it('hasRole returns false when user is null', () => {
    const { hasRole } = useAuthStore.getState();
    expect(hasRole('ROLE_ANALYST')).toBe(false);
  });

  it('hasAnyRole returns true when user has at least one role', () => {
    const { setUser, hasAnyRole } = useAuthStore.getState();
    setUser(mockUser, mockToken);
    expect(hasAnyRole(['ROLE_ADMIN', 'ROLE_ANALYST'])).toBe(true);
  });

  it('hasAnyRole returns false when user has none of the roles', () => {
    const { setUser, hasAnyRole } = useAuthStore.getState();
    setUser(mockUser, mockToken);
    expect(hasAnyRole(['ROLE_ADMIN', 'ROLE_SOC_MANAGER'])).toBe(false);
  });

  it('getDefaultLanding returns /admin/users for ROLE_ADMIN', () => {
    const { setUser, getDefaultLanding } = useAuthStore.getState();
    const adminUser: HaUser = { ...mockUser, roles: ['ROLE_ADMIN'] };
    setUser(adminUser, mockToken);
    expect(getDefaultLanding()).toBe('/admin/users');
  });

  it('getDefaultLanding returns /queue for ROLE_ANALYST', () => {
    const { setUser, getDefaultLanding } = useAuthStore.getState();
    setUser(mockUser, mockToken);
    expect(getDefaultLanding()).toBe('/queue');
  });

  it('getDefaultLanding returns /queue for ROLE_SOC_MANAGER', () => {
    const { setUser, getDefaultLanding } = useAuthStore.getState();
    const socUser: HaUser = { ...mockUser, roles: ['ROLE_SOC_MANAGER'] };
    setUser(socUser, mockToken);
    expect(getDefaultLanding()).toBe('/queue');
  });

  it('getDefaultLanding returns /login when user is null', () => {
    const { getDefaultLanding } = useAuthStore.getState();
    expect(getDefaultLanding()).toBe('/login');
  });

  it('getDefaultLanding prioritizes ROLE_ADMIN when user has multiple roles', () => {
    const { setUser, getDefaultLanding } = useAuthStore.getState();
    const multiRoleUser: HaUser = { ...mockUser, roles: ['ROLE_ANALYST', 'ROLE_ADMIN'] };
    setUser(multiRoleUser, mockToken);
    expect(getDefaultLanding()).toBe('/admin/users');
  });
});
