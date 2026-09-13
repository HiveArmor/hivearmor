/**
 * AgentHealthBadge.tsx — composite agent-health treatment for SPEC-02 (W2).
 *
 * Renders the composite health level (green/amber/red/unknown) as a dot+label
 * that ALWAYS carries the failing dimension's human reason — never a bare green
 * light hiding a degraded dimension (the CrowdStrike RFM trap the spec forbids).
 * A colour dot always pairs with text (WCAG — never colour alone).
 *
 * Two variants:
 *   - `compact` — one line for a SensorGrid cell: dot + level word + short reason.
 *   - `full`    — header treatment: composite line + freshness chip + per-dimension
 *                 pills, each pill carrying its last-check timestamp on hover.
 *
 * Honest states: `unknown`/no-vitals renders "No vitals reported yet" in the
 * neutral disconnected tone (NOT green); an error passed by the caller renders
 * the error state rather than a blank cell.
 *
 * Token-only styling (foundation.css). No raw hex.
 */

import { formatBoundedRelativeTime } from '@/lib/threatIntelFreshness';
import type {
  CompositeHealth,
  Freshness,
  HealthDimension,
  HealthLevel,
} from '@/services/agentHealth';

import './AgentHealthBadge.css';

const LEVEL_WORD: Record<HealthLevel, string> = {
  red: 'Critical',
  amber: 'Degraded',
  green: 'Healthy',
  unknown: 'No data',
};

function absoluteTitle(iso: string | null): string {
  if (!iso) return 'No sample';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'No sample' : d.toISOString().replace('T', ' ').replace('Z', ' Z');
}

/** Freshness chip: relative primary, absolute on hover; Stale (amber) / Offline (red). */
function FreshnessChip({ freshness }: { freshness: Freshness }): JSX.Element {
  const level = freshness.level;
  const label =
    level === 'offline'
      ? 'Offline'
      : level === 'stale'
        ? 'Stale'
        : level === 'unknown'
          ? 'No signal'
          : formatBoundedRelativeTime(freshness.lastSeen);
  const suffix =
    (level === 'offline' || level === 'stale') && freshness.lastSeen
      ? ` · ${formatBoundedRelativeTime(freshness.lastSeen)}`
      : '';
  return (
    <span
      className={`ha-agent-health__fresh ha-agent-health__fresh--${level}`}
      title={absoluteTitle(freshness.lastSeen)}
    >
      {label}
      {suffix}
    </span>
  );
}

function DimensionPill({ dim }: { dim: HealthDimension }): JSX.Element {
  return (
    <span
      className={`ha-agent-health__pill ha-agent-health__pill--${dim.level}`}
      title={
        dim.lastCheck
          ? `${dim.reason} — last check ${absoluteTitle(dim.lastCheck)}`
          : dim.reason
      }
    >
      <span className="ha-agent-health__pill-dot" aria-hidden="true" />
      <span className="ha-agent-health__pill-label">{dim.label}</span>
      {dim.lastCheck && (
        <span className="ha-agent-health__pill-check">
          {formatBoundedRelativeTime(dim.lastCheck)}
        </span>
      )}
    </span>
  );
}

export interface AgentHealthBadgeProps {
  health: CompositeHealth;
  freshness: Freshness;
  variant?: 'compact' | 'full';
  /** When set, forces the error state (e.g. the vitals fetch failed). */
  errored?: boolean;
  className?: string;
}

/**
 * The composite health badge. When `errored`, shows an explicit error state
 * (never a blank or a misleading green).
 */
export function AgentHealthBadge({
  health,
  freshness,
  variant = 'compact',
  errored = false,
  className,
}: AgentHealthBadgeProps): JSX.Element {
  if (errored) {
    return (
      <span
        className={['ha-agent-health', 'ha-agent-health--compact', 'ha-agent-health--error', className]
          .filter(Boolean)
          .join(' ')}
        role="status"
      >
        <span className="ha-agent-health__dot" aria-hidden="true" />
        <span className="ha-agent-health__word">Health unavailable</span>
        <span className="ha-agent-health__reason">Could not load vitals</span>
      </span>
    );
  }

  const level = health.level;
  const word = LEVEL_WORD[level];
  // The composite reason ALWAYS shows — for green it is a positive summary,
  // for anything else it names the failing dimension.
  const ariaLabel = `Agent health: ${word}. ${health.reason}`;

  if (variant === 'compact') {
    return (
      <span
        className={['ha-agent-health', 'ha-agent-health--compact', `ha-agent-health--${level}`, className]
          .filter(Boolean)
          .join(' ')}
        aria-label={ariaLabel}
        title={health.reason}
      >
        <span className="ha-agent-health__dot" aria-hidden="true" />
        <span className="ha-agent-health__word">{word}</span>
        <span className="ha-agent-health__reason">{health.reason}</span>
      </span>
    );
  }

  return (
    <div
      className={['ha-agent-health', 'ha-agent-health--full', `ha-agent-health--${level}`, className]
        .filter(Boolean)
        .join(' ')}
      aria-label={ariaLabel}
    >
      <div className="ha-agent-health__headline">
        <span className="ha-agent-health__dot" aria-hidden="true" />
        <span className="ha-agent-health__word">{word}</span>
        <span className="ha-agent-health__reason">{health.reason}</span>
        <FreshnessChip freshness={freshness} />
      </div>
      {health.dimensions.length > 0 && (
        <div className="ha-agent-health__pills" role="list" aria-label="Health dimensions">
          {health.dimensions.map((dim) => (
            <span role="listitem" key={dim.id}>
              <DimensionPill dim={dim} />
            </span>
          ))}
        </div>
      )}
      {health.noVitals && (
        <p className="ha-agent-health__novitals" role="status">
          No vitals reported yet — this agent has not sent a telemetry sample.
        </p>
      )}
    </div>
  );
}
