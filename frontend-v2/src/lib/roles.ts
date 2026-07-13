// Must match AuthoritiesConstants.java exactly
export const ROLES = {
  ADMIN: "ROLE_ADMIN",
  USER: "ROLE_USER",
  PRE_VERIFICATION_USER: "ROLE_PRE_VERIFICATION_USER",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
