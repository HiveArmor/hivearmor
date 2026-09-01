import type React from 'react';

import './HaCard.css';

export interface HaCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Render as a semantic element other than div (e.g. 'article', 'section'). */
  as?: 'div' | 'article' | 'section';
  /** Compact density — tighter padding for dense contexts. */
  compact?: boolean;
  children: React.ReactNode;
}

export interface HaCardSlotProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * HaCard — the panel/card surface primitive extracted from EvidenceCard, LlmUnavailableCard,
 * AiIncidentSummaryCard, and IntelligenceFindingCard (rule of three, 4×). It owns the surface,
 * border, panel radius, low shadow, and overflow — the chrome each of those hand-rolled.
 *
 * Compound API: `HaCard` is the container; `HaCard.Header` / `HaCard.Body` / `HaCard.Footer`
 * are optional slots that add the internal padding + divider borders. A card that is just a
 * surface (e.g. a centered null-state) uses `HaCard` alone with its own body markup.
 *
 * Tokens only. Header/Footer dividers use `--ha-border-subtle`; surface uses `--ha-surface-panel`.
 */
export function HaCard({ as = 'div', compact, className, children, ...rest }: HaCardProps): JSX.Element {
  const Tag = as;
  return (
    <Tag
      className={['ha-card', compact ? 'ha-card--compact' : '', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </Tag>
  );
}

function HaCardHeader({ className, children, ...rest }: HaCardSlotProps): JSX.Element {
  return (
    <div className={['ha-card__header', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

function HaCardBody({ className, children, ...rest }: HaCardSlotProps): JSX.Element {
  return (
    <div className={['ha-card__body', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

function HaCardFooter({ className, children, ...rest }: HaCardSlotProps): JSX.Element {
  return (
    <div className={['ha-card__footer', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

HaCard.Header = HaCardHeader;
HaCard.Body = HaCardBody;
HaCard.Footer = HaCardFooter;
