import { useMemo, useState } from 'react';

import { LayoutTemplate } from 'lucide-react';

import { PIVOT_TEMPLATES, isTemplateApplicable, type PivotTemplate } from '../lib/pivotTemplates';
import type { HuntFieldDefinition } from '../searchHunt.types';

export interface PivotTemplatesMenuProps {
  /** Live schema fields — used to disable a template no axis of which is eligible here. */
  fields: HuntFieldDefinition[];
  /** Apply a curated template. The parent validates against the schema and surfaces any warnings. */
  onApply: (template: PivotTemplate) => void;
}

/**
 * Pivot templates menu (P1.1): a keyboard-accessible "Templates" menu on the pivot toolbar offering
 * curated starting-point pivots grouped by category. A template with no schema-eligible axis is disabled
 * with a tooltip rather than hidden, so the analyst can see it exists.
 */
export function PivotTemplatesMenu({ fields, onApply }: PivotTemplatesMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, PivotTemplate[]>();
    for (const t of PIVOT_TEMPLATES) {
      const list = byCategory.get(t.category) ?? [];
      list.push(t);
      byCategory.set(t.category, list);
    }
    return [...byCategory.entries()];
  }, []);

  return (
    <div className="pivot-templates">
      <button
        type="button"
        className="pivot-toolbar__templates"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Apply a curated starting-point pivot"
      >
        <LayoutTemplate size={13} aria-hidden="true" /> Templates
      </button>
      {open && (
        <ul className="pivot-templates__menu" role="menu" aria-label="Pivot templates">
          {grouped.map(([category, templates]) => (
            <li key={category} className="pivot-templates__group" role="presentation">
              <span className="pivot-templates__group-label" role="presentation">{category}</span>
              <ul role="presentation">
                {templates.map((t) => {
                  const applicable = isTemplateApplicable(t, fields);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!applicable}
                        title={applicable ? t.description : 'No field in this template matches the current schema'}
                        onClick={() => { onApply(t); setOpen(false); }}
                      >
                        <strong>{t.name}</strong>
                        <small>{t.description}</small>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
