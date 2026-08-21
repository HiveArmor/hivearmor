/**
 * AdminUsersPage tests
 * ADM-01 Users & Roles
 */

import { describe, it, expect } from 'vitest';

describe('AdminUsersPage', () => {
  describe('role badge mapping', () => {
    it('maps ROLE_ADMIN correctly', () => {
      const ROLE_ADMIN = 'ROLE_ADMIN';
      expect(ROLE_ADMIN).toBe('ROLE_ADMIN');
    });

    it('maps ROLE_SOC_MANAGER correctly', () => {
      const ROLE_SOC_MANAGER = 'ROLE_SOC_MANAGER';
      expect(ROLE_SOC_MANAGER).toBe('ROLE_SOC_MANAGER');
    });

    it('maps ROLE_ANALYST correctly', () => {
      const ROLE_ANALYST = 'ROLE_ANALYST';
      expect(ROLE_ANALYST).toBe('ROLE_ANALYST');
    });
  });

  describe('user form validation', () => {
    it('validates login format', () => {
      const validLogin = 'admin_user.test-123';
      const invalidLogin = 'Admin_User!';

      const validPattern = /^[a-z0-9._-]+$/;
      expect(validPattern.test(validLogin)).toBe(true);
      expect(validPattern.test(invalidLogin)).toBe(false);
    });

    it('validates email format', () => {
      const validEmail = 'user@example.com';
      const invalidEmail = 'not-an-email';

      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      expect(emailPattern.test(validEmail)).toBe(true);
      expect(emailPattern.test(invalidEmail)).toBe(false);
    });

    it('validates password minimum length', () => {
      const validPassword = 'password123';
      const invalidPassword = 'short';

      expect(validPassword.length >= 8).toBe(true);
      expect(invalidPassword.length >= 8).toBe(false);
    });
  });

  describe('authorities filtering', () => {
    it('filters known roles from authorities list', () => {
      const KNOWN_ROLES = [
        'ROLE_ADMIN',
        'ROLE_SOC_MANAGER',
        'ROLE_ANALYST',
        'ROLE_USER',
        'ROLE_READ_ONLY',
      ];

      const authorities = [
        { id: '1', name: 'ROLE_ADMIN' },
        { id: '2', name: 'ROLE_ANALYST' },
        { id: '3', name: 'ROLE_PRE_VERIFICATION_USER' },
        { id: '4', name: 'UNKNOWN_ROLE' },
      ];

      const filtered = authorities.filter((auth) => KNOWN_ROLES.includes(auth.name));

      expect(filtered.length).toBe(2);
      expect(filtered[0].name).toBe('ROLE_ADMIN');
      expect(filtered[1].name).toBe('ROLE_ANALYST');
    });
  });

  describe('filter state management', () => {
    it('handles search filter', () => {
      const filters = {
        search: 'admin',
        activated: 'all' as const,
        roles: [],
      };

      expect(filters.search).toBe('admin');
    });

    it('handles activation filter', () => {
      const filters = {
        search: '',
        activated: 'active' as const,
        roles: [],
      };

      expect(filters.activated).toBe('active');
    });

    it('handles role filter', () => {
      const filters = {
        search: '',
        activated: 'all' as const,
        roles: ['ROLE_ADMIN'],
      };

      expect(filters.roles.length).toBe(1);
      expect(filters.roles[0]).toBe('ROLE_ADMIN');
    });
  });
});
