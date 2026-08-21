/**
 * TenantCell — AG Grid cell renderer
 * Per spec 03-ANALYST-QUEUE.md §6.4
 */

import { TenantBadge } from '@/components/tenant-badge';
import type { TenantRef } from '@/types/alert.types';

export interface TenantCellProps {
  value: TenantRef;
}

export function TenantCell({ value }: TenantCellProps): JSX.Element {
  if (!value) {
    return <span style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)' }}>—</span>;
  }
  return <TenantBadge tenantId={value.id} tenantName={value.name} />;
}
