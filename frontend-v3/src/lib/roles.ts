/**
 * Role constants and helpers.
 * Roles are used for authorization checks throughout the application.
 */

export const ROLES = {
  ADMIN: 'ROLE_ADMIN',
  SOC_MANAGER: 'ROLE_SOC_MANAGER',
  ANALYST: 'ROLE_ANALYST',
  USER: 'ROLE_USER',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

/**
 * Role hierarchy (higher number = more permissions)
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  [ROLES.ADMIN]: 4,
  [ROLES.SOC_MANAGER]: 3,
  [ROLES.ANALYST]: 2,
  [ROLES.USER]: 1,
};

/**
 * Role display labels
 */
export const ROLE_LABELS: Record<Role, string> = {
  [ROLES.ADMIN]: 'Platform Administrator',
  [ROLES.SOC_MANAGER]: 'SOC Manager',
  [ROLES.ANALYST]: 'Analyst',
  [ROLES.USER]: 'Standard User',
};

/** Map ROLE_* / authority strings to human labels for operator-facing UI. */
export function formatAuthorityLabel(authority: string | null | undefined): string {
  if (!authority) return 'Not reported';
  if (authority in ROLE_LABELS) {
    return ROLE_LABELS[authority as Role];
  }
  if (authority === 'ROLE_READ_ONLY') return 'Read Only';
  if (authority === 'ROLE_THREAT_HUNTER') return 'Threat Hunter';
  if (authority === 'ROLE_SOC_ANALYST') return 'Analyst';
  if (authority === 'MSSP_ADMIN') return 'MSSP Administrator';
  if (authority.startsWith('ROLE_')) {
    return authority
      .replace(/^ROLE_/, '')
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  return authority;
}

/**
 * Check if a role has at least the required permission level
 */
export function hasRoleLevel(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Check if user has any of the specified roles
 */
export function hasAnyRole(userRoles: string[], allowedRoles: string[]): boolean {
  return allowedRoles.some(role => userRoles.includes(role));
}

/**
 * Get the highest role from a list of roles
 */
export function getHighestRole(userRoles: string[]): Role | null {
  const validRoles = userRoles.filter((r): r is Role =>
    Object.values(ROLES).includes(r as Role)
  );

  if (validRoles.length === 0) return null;

  return validRoles.reduce((highest, current) =>
    ROLE_HIERARCHY[current] > ROLE_HIERARCHY[highest] ? current : highest
  );
}
