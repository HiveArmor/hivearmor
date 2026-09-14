import { useMastheadTenants } from '@/hooks/useMastheadTenants';
import { ALL_TENANTS_OPTION } from '@/services/mastheadTenants.service';
import { useAuthStore } from '@/store/auth.store';

export interface CurrentTenantLabel {
  /** Selected tenant id, or null for the aggregate "all tenants" scope. */
  tenantId: number | null;
  /** Whether the current scope is the aggregate (all authorized tenants) view. */
  isAllTenants: boolean;
  /**
   * Human label for the CURRENT scope, resolved live from the authorized
   * inventory — never a hardcoded map. Single tenant → its real name;
   * aggregate → "All Tenants (N)" when the count is known, else the option label.
   */
  label: string;
  /** Short prefix for the current tenant ('' for aggregate). */
  prefix: string;
  /** Count of authorized single tenants (excludes the aggregate option). */
  tenantCount: number;
  isLoading: boolean;
}

/**
 * Shared source of truth for "what tenant scope is the user in right now",
 * used by every scoped surface (Command Center, File Quarantine, headers) so
 * the displayed scope always matches the masthead selection. Reuses the
 * masthead inventory query (same queryKey) — no extra fetch. Replaces the
 * per-page hardcoded TENANT_SCOPE_LABELS maps (UX-001).
 */
export function useCurrentTenantLabel(): CurrentTenantLabel {
  const selectedTenantId = useAuthStore((s) => s.selectedTenantId);
  const { tenants, isLoading } = useMastheadTenants();

  const singleTenants = tenants.filter((t) => t.id !== null);
  const tenantCount = singleTenants.length;

  if (selectedTenantId === null) {
    // Aggregate scope — make it unmistakably different from a single tenant.
    const label = tenantCount > 0 ? `All Tenants (${tenantCount})` : ALL_TENANTS_OPTION.label;
    return {
      tenantId: null,
      isAllTenants: true,
      label,
      prefix: '',
      tenantCount,
      isLoading,
    };
  }

  const match = tenants.find((t) => t.id === selectedTenantId);
  return {
    tenantId: selectedTenantId,
    isAllTenants: false,
    label: match?.label ?? `Tenant ${String(selectedTenantId)}`,
    prefix: match?.prefix ?? '',
    tenantCount,
    isLoading,
  };
}
