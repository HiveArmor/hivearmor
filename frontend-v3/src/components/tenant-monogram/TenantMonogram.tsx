import './TenantMonogram.css';

export interface TenantMonogramProps {
  /** Tenant id — null means the "All tenants" scope. Used to pick a stable tint. */
  tenantId: number | null;
  /** Tenant prefix (preferred monogram source) and label (fallback). */
  prefix: string;
  label: string;
  size?: 'sm' | 'md';
}

/** Palette of meaning-neutral accent tints from the Hive Carbon token set. */
const TINTS = ['violet', 'blue', 'teal', 'green', 'neutral'] as const;
type Tint = (typeof TINTS)[number];

/** Derive a 3-char monogram: prefix if present, else initials of the label. */
export function tenantMonogram(prefix: string, label: string): string {
  const p = prefix.trim();
  if (p) return p.slice(0, 3).toUpperCase();
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
  return (label.trim().slice(0, 3) || '—').toUpperCase();
}

/** Stable tint per tenant: "All" is always teal; others hash their id. */
function tenantTint(tenantId: number | null): Tint {
  if (tenantId === null) return 'teal';
  return TINTS[Math.abs(tenantId) % TINTS.length];
}

export function TenantMonogram({ tenantId, prefix, label, size = 'sm' }: TenantMonogramProps): JSX.Element {
  const code = tenantId === null ? 'ALL' : tenantMonogram(prefix, label);
  return (
    <span className="tenant-monogram" data-tint={tenantTint(tenantId)} data-size={size} aria-hidden="true">
      {code}
    </span>
  );
}
