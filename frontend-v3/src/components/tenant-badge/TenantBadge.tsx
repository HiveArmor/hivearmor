import { Building } from 'lucide-react';

export interface TenantBadgeProps {
  tenantId: number;
  tenantName: string;
  size?: 'sm' | 'md';
}

export function TenantBadge({ tenantName }: TenantBadgeProps): JSX.Element {
  const displayName = tenantName.length > 20 ? `${tenantName.slice(0, 20)}...` : tenantName;

  return (
    <span
      className="tenant-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: 'var(--ha-surface-raised)',
        border: '1px solid var(--ha-border)',
        borderRadius: 'var(--ha-radius-full, 9999px)',
        padding: '3px 8px',
        fontSize: 'var(--ha-text-xs)',
        color: 'var(--ha-text-secondary)',
      }}
    >
      <Building size={10} style={{ color: 'var(--ha-text-secondary)' }} />
      <span>{displayName}</span>
    </span>
  );
}
