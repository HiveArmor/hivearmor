"use client";

import { useAuthStore } from "@/store/auth";
import { ROLES } from "@/lib/roles";

export function useCurrentUser() {
  return useAuthStore((s) => s.user);
}

export function useHasRole(role: string): boolean {
  const user = useCurrentUser();
  return user?.authorities?.includes(role) ?? false;
}

export function useIsAdmin(): boolean {
  return useHasRole(ROLES.ADMIN);
}
