import type React from 'react';

import './HaDefinitionList.css';

export interface HaDefinitionItem {
  /** The field label (dt). */
  term: string;
  /** The field value (dd). */
  value: React.ReactNode;
  /** Render the value in the monospace font — for machine identifiers (IP/host/hash/user). */
  mono?: boolean;
}

export interface HaDefinitionListProps extends React.HTMLAttributes<HTMLDListElement> {
  /** Key/value rows. Items with `value == null || ''` are skipped (common in detail drawers). */
  items: HaDefinitionItem[];
  /**
   * Layout:
   *  - `stacked` (default): dt above dd — good for narrow drawers.
   *  - `inline`: dt | dd in two columns — good for wider detail panels.
   */
  layout?: 'stacked' | 'inline';
}

/**
 * HaDefinitionList — a semantic `<dl>` key/value list extracted from the ~10 hand-built detail
 * lists across the app (QueueDetailDrawer, detection-rules panels, quarantine, investigation
 * detail, …), each of which inline-styled its own dt/dd pairs. Consumers pass DATA (`items`),
 * not markup, and set `mono` per item so machine identifiers follow the value-color rule.
 *
 * Tokens only. Skips empty values so a drawer's optional fields don't render blank rows.
 */
export function HaDefinitionList({
  items,
  layout = 'stacked',
  className,
  ...rest
}: HaDefinitionListProps): JSX.Element {
  const rows = items.filter((i) => i.value !== null && i.value !== undefined && i.value !== '');
  return (
    <dl
      className={['ha-dl', `ha-dl--${layout}`, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {rows.map((item) => (
        <div className="ha-dl__row" key={item.term}>
          <dt className="ha-dl__term">{item.term}</dt>
          <dd className={['ha-dl__value', item.mono ? 'ha-dl__value--mono' : ''].filter(Boolean).join(' ')}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
