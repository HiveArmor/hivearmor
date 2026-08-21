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
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.SOC_MANAGER]: 'SOC Manager',
  [ROLES.ANALYST]: 'Analyst',
  [ROLES.USER]: 'User',
};

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
