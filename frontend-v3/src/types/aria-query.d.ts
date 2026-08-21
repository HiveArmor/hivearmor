/**
 * Type declarations for aria-query module (used by @testing-library/jest-dom)
 * No official @types package exists for this module.
 */
declare module 'aria-query' {
  export type ARIARole = string;
  export const roles: Map<ARIARole, unknown>;
  export const dom: Map<string, unknown>;
  export const aria: Map<string, unknown>;
}
