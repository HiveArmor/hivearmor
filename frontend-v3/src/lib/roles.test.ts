/**
 * Roles helpers tests
 */

import { describe, it, expect } from 'vitest';

import {
  ROLES,
  ROLE_HIERARCHY,
  ROLE_LABELS,
  hasRoleLevel,
  hasAnyRole,
  getHighestRole,
} from './roles';

describe('roles', () => {
  describe('constants', () => {
    it('ROLES contains all role constants', () => {
      expect(ROLES.ADMIN).toBe('ROLE_ADMIN');
      expect(ROLES.SOC_MANAGER).toBe('ROLE_SOC_MANAGER');
      expect(ROLES.ANALYST).toBe('ROLE_ANALYST');
      expect(ROLES.USER).toBe('ROLE_USER');
    });

    it('ROLE_HIERARCHY descends from ADMIN (4) to USER (1)', () => {
      expect(ROLE_HIERARCHY.ROLE_ADMIN).toBe(4);
      expect(ROLE_HIERARCHY.ROLE_SOC_MANAGER).toBe(3);
      expect(ROLE_HIERARCHY.ROLE_ANALYST).toBe(2);
      expect(ROLE_HIERARCHY.ROLE_USER).toBe(1);
    });

    it('ROLE_LABELS provides display names', () => {
      expect(ROLE_LABELS.ROLE_ADMIN).toBe('Administrator');
      expect(ROLE_LABELS.ROLE_SOC_MANAGER).toBe('SOC Manager');
      expect(ROLE_LABELS.ROLE_ANALYST).toBe('Analyst');
      expect(ROLE_LABELS.ROLE_USER).toBe('User');
    });
  });

  describe('hasRoleLevel', () => {
    it('returns true when user has exact required role', () => {
      expect(hasRoleLevel(ROLES.ADMIN, ROLES.ADMIN)).toBe(true);
      expect(hasRoleLevel(ROLES.SOC_MANAGER, ROLES.SOC_MANAGER)).toBe(true);
      expect(hasRoleLevel(ROLES.ANALYST, ROLES.ANALYST)).toBe(true);
    });

    it('returns true when user has higher role than required', () => {
      expect(hasRoleLevel(ROLES.ADMIN, ROLES.SOC_MANAGER)).toBe(true);
      expect(hasRoleLevel(ROLES.ADMIN, ROLES.ANALYST)).toBe(true);
      expect(hasRoleLevel(ROLES.SOC_MANAGER, ROLES.ANALYST)).toBe(true);
    });

    it('returns false when user has lower role than required', () => {
      expect(hasRoleLevel(ROLES.ANALYST, ROLES.SOC_MANAGER)).toBe(false);
      expect(hasRoleLevel(ROLES.USER, ROLES.ANALYST)).toBe(false);
      expect(hasRoleLevel(ROLES.SOC_MANAGER, ROLES.ADMIN)).toBe(false);
    });
  });

  describe('hasAnyRole', () => {
    it('returns true when user has one of the allowed roles', () => {
      expect(hasAnyRole([ROLES.ANALYST], [ROLES.ANALYST, ROLES.SOC_MANAGER])).toBe(true);
      expect(hasAnyRole([ROLES.ADMIN], [ROLES.ADMIN, ROLES.USER])).toBe(true);
    });

    it('returns true when user has multiple roles and any match', () => {
      expect(hasAnyRole([ROLES.ANALYST, ROLES.USER], [ROLES.ANALYST])).toBe(true);
      expect(hasAnyRole([ROLES.SOC_MANAGER, ROLES.ANALYST], [ROLES.SOC_MANAGER, ROLES.ADMIN])).toBe(true);
    });

    it('returns false when user has none of the allowed roles', () => {
      expect(hasAnyRole([ROLES.USER], [ROLES.ANALYST, ROLES.SOC_MANAGER])).toBe(false);
      expect(hasAnyRole([ROLES.ANALYST], [ROLES.ADMIN])).toBe(false);
    });

    it('returns false when user has no roles', () => {
      expect(hasAnyRole([], [ROLES.ADMIN, ROLES.ANALYST])).toBe(false);
    });

    it('returns false when allowed roles is empty', () => {
      expect(hasAnyRole([ROLES.ADMIN], [])).toBe(false);
    });
  });

  describe('getHighestRole', () => {
    it('returns ADMIN when user has ADMIN role', () => {
      expect(getHighestRole([ROLES.ADMIN])).toBe(ROLES.ADMIN);
      expect(getHighestRole([ROLES.ANALYST, ROLES.ADMIN, ROLES.USER])).toBe(ROLES.ADMIN);
    });

    it('returns SOC_MANAGER when highest role is SOC_MANAGER', () => {
      expect(getHighestRole([ROLES.SOC_MANAGER])).toBe(ROLES.SOC_MANAGER);
      expect(getHighestRole([ROLES.ANALYST, ROLES.SOC_MANAGER, ROLES.USER])).toBe(ROLES.SOC_MANAGER);
    });

    it('returns ANALYST when highest role is ANALYST', () => {
      expect(getHighestRole([ROLES.ANALYST])).toBe(ROLES.ANALYST);
      expect(getHighestRole([ROLES.USER, ROLES.ANALYST])).toBe(ROLES.ANALYST);
    });

    it('returns USER when only USER role exists', () => {
      expect(getHighestRole([ROLES.USER])).toBe(ROLES.USER);
    });

    it('returns null when no valid roles exist', () => {
      expect(getHighestRole([])).toBeNull();
      expect(getHighestRole(['INVALID_ROLE'])).toBeNull();
    });

    it('filters out invalid roles before finding highest', () => {
      expect(getHighestRole(['INVALID', ROLES.ANALYST, 'ANOTHER_INVALID'])).toBe(ROLES.ANALYST);
    });
  });
});
