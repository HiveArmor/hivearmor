import { ROLES } from "./roles";

// Routes not listed here are accessible to any authenticated user.
// Matching is prefix-based; longest match wins.
export const ROUTE_PERMISSIONS: Record<string, string[]> = {
  // Admin-only
  "/admin": [ROLES.ADMIN],
  "/admin/users": [ROLES.ADMIN],
  "/admin/settings": [ROLES.ADMIN],
  "/admin/variables": [ROLES.ADMIN],
  "/admin/notifications": [ROLES.ADMIN],
  "/admin/connection-keys": [ROLES.ADMIN],
  "/admin/search-acceleration": [ROLES.ADMIN],
  "/data-sources": [ROLES.ADMIN],
  "/integrations": [ROLES.ADMIN],
  "/agents": [ROLES.ADMIN],
  "/settings": [ROLES.ADMIN],
  "/settings/soc-ai": [ROLES.ADMIN],

  // Analyst (ROLE_USER) + Admin
  "/rules": [ROLES.ADMIN, ROLES.USER],
  "/soar": [ROLES.ADMIN, ROLES.USER],
  "/alerts": [ROLES.ADMIN, ROLES.USER],
  "/incidents": [ROLES.ADMIN, ROLES.USER],
  "/active-directory": [ROLES.ADMIN, ROLES.USER],
  "/threat-intel": [ROLES.ADMIN, ROLES.USER],
};

export function canAccessRoute(pathname: string, userRoles: string[]): boolean {
  const sorted = Object.keys(ROUTE_PERMISSIONS).sort((a, b) => b.length - a.length);
  const match = sorted.find((route) => pathname === route || pathname.startsWith(route + "/"));
  if (!match) return true;
  return userRoles.some((r) => ROUTE_PERMISSIONS[match].includes(r));
}
