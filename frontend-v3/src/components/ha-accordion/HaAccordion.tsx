/**
 * HaAccordion + HaAccordionItem — Ha_Wrapper over PatternFly 6 Accordion.
 *
 * Enforces HiveArmor design tokens and accessibility defaults.
 * PatternFly 6 Accordion passes `isExpanded` through AccordionItem context —
 * AccordionToggle and AccordionContent read it from that context automatically.
 */

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionToggle,
} from '@patternfly/react-core';

// ---------- HaAccordionItem ----------

export interface HaAccordionItemProps {
  /** Unique identifier for the accordion item. */
  id: string;
  /** Label shown in the toggle header. */
  label: string;
  /** Whether this item is currently open. */
  isExpanded: boolean;
  /** Called when the toggle is clicked. */
  onToggle: () => void;
  /** Panel body content. */
  children: React.ReactNode;
}

export function HaAccordionItem({
  id,
  label,
  isExpanded,
  onToggle,
  children,
}: HaAccordionItemProps): JSX.Element {
  return (
    <AccordionItem isExpanded={isExpanded}>
      <AccordionToggle
        id={`${id}-toggle`}
        onClick={onToggle}
        style={{
          background: 'var(--ha-surface-raised)',
          color: 'var(--ha-text-primary)',
          borderBottom: '1px solid var(--ha-border)',
          fontSize: 'var(--ha-text-sm)',
          fontWeight: 600,
          padding: '10px 12px',
          width: '100%',
        }}
      >
        {label}
      </AccordionToggle>
      <AccordionContent
        id={`${id}-content`}
        aria-labelledby={`${id}-toggle`}
        style={{
          background: 'var(--ha-surface-primary)',
          padding: 0,
        }}
      >
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

// ---------- HaAccordion ----------

export interface HaAccordionProps {
  /** One or more HaAccordionItem children. */
  children: React.ReactNode;
  /** Render as a definition list instead of a div. Defaults to false. */
  asDefinitionList?: boolean;
}

export function HaAccordion({ children, asDefinitionList = false }: HaAccordionProps): JSX.Element {
  return (
    <Accordion
      asDefinitionList={asDefinitionList}
      style={
        {
          '--pf-v5-c-accordion__toggle--BackgroundColor': 'var(--ha-surface-raised)',
          '--pf-v5-c-accordion__toggle--Color': 'var(--ha-text-primary)',
          '--pf-v5-c-accordion__expanded-content--BackgroundColor': 'var(--ha-surface-primary)',
          border: '1px solid var(--ha-border)',
          borderRadius: 'var(--ha-radius-base)',
          overflow: 'hidden',
        } as React.CSSProperties
      }
    >
      {children}
    </Accordion>
  );
}
