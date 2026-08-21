import { EntityTypeIcon } from '@/components/entity-type-icon';
import type { CanonicalEntityIconType } from '@/components/entity-type-icon';
import { SEVERITY_COLORS } from '@/lib/severity';

export interface EntityBadgeProps {
  type: Extract<CanonicalEntityIconType, 'host' | 'user' | 'ip' | 'domain' | 'process' | 'file'>;
  label: string;
  riskScore?: number;
  onClick?: () => void;
  size?: 'sm' | 'md';
}

function isIpAddress(text: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  return ipv4Regex.test(text) || ipv6Regex.test(text);
}

function getRiskColor(score: number): string {
  if (score >= 80) return SEVERITY_COLORS.critical;
  if (score >= 60) return SEVERITY_COLORS.high;
  if (score >= 40) return SEVERITY_COLORS.medium;
  return SEVERITY_COLORS.low;
}

export function EntityBadge({
  type,
  label,
  riskScore,
  onClick,
  size = 'sm',
}: EntityBadgeProps): JSX.Element {
  const iconSize = size === 'sm' ? 12 : 14;
  const useMonoFont = isIpAddress(label);

  return (
    <span
      className="entity-badge"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: 'var(--ha-surface-raised)',
        border: '1px solid var(--ha-border)',
        borderRadius: 'var(--ha-radius-md)',
        padding: '3px 8px',
        fontSize: 'var(--ha-text-xs)',
        color: 'var(--ha-text-primary)',
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: useMonoFont ? 'var(--ha-font-mono)' : 'inherit',
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {riskScore !== undefined && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: getRiskColor(riskScore),
          }}
          aria-label={`Risk score: ${riskScore}`}
        />
      )}
      <EntityTypeIcon type={type} size={iconSize} className="entity-badge__type-icon" />
      <span>{label}</span>
    </span>
  );
}
