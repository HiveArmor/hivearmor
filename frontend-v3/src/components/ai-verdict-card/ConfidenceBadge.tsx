import './ConfidenceBadge.css';

export interface ConfidenceBadgeProps {
  /** Confidence 0–100 (or 0–1, auto-detected). */
  value: number;
  /** Small (default) or medium density. */
  size?: 'sm' | 'md';
  /** Show the ✦ provenance glyph (default true). */
  showGlyph?: boolean;
  className?: string;
}

/**
 * ConfidenceBadge — an AI-kit confidence pill wearing `--ha-intelligence-primary` provenance
 * (design §5a/§5c). Confidence is an AI signal, NOT severity — so it uses the intelligence-violet
 * token, never severity colors (that is the mistake the older ConfidenceIndicator makes with a
 * severity-gradient bar). Pairs the % with a ✦ glyph so meaning is never color-alone (WCAG).
 *
 * Tokens only. Used standalone and inside AiVerdictCard.
 */
export function ConfidenceBadge({
  value,
  size = 'sm',
  showGlyph = true,
  className,
}: ConfidenceBadgeProps): JSX.Element {
  const pct = value <= 1 ? Math.round(value * 100) : Math.round(value);
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <span
      className={['ha-confidence', `ha-confidence--${size}`, className].filter(Boolean).join(' ')}
      aria-label={`AI confidence: ${clamped}%`}
    >
      {showGlyph && <span className="ha-confidence__glyph" aria-hidden="true">✦</span>}
      <span className="ha-confidence__value">{clamped}%</span>
      <span className="ha-confidence__label">confidence</span>
    </span>
  );
}
