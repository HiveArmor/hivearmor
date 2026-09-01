import { Building } from 'lucide-react';

import { HaBadge } from '@/components/ha-badge';

export interface TenantBadgeProps {
  tenantId: number;
  tenantName: string;
  size?: 'sm' | 'md';
}

export function TenantBadge({ tenantName, size = 'sm' }: TenantBadgeProps): JSX.Element {
  const displayName = tenantName.length > 20 ? `${tenantName.slice(0, 20)}...` : tenantName;

  return (
    <HaBadge
      className="tenant-badge"
      size={size}
      pill
      muted
      icon={<Building size={10} aria-hidden="true" />}
    >
      {displayName}
    </HaBadge>
  );
}
