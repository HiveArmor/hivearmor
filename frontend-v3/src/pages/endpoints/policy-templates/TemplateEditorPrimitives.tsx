/**
 * PT-2 template editor — shared primitives.
 * Honesty note (SPEC-PT-2 §2), a reusable multi-line string-list editor, and a
 * labelled section shell. Hive Carbon tokens only; WCAG 2.2 AA.
 */

import type { ReactNode } from 'react';

import { HaButton } from '@/components/ha-button/HaButton';
import type { TabEnforcement } from '@/types/policyTemplates';

/** "Not yet enforced by agent" note — never a silent no-op. */
export function EnforcementNote({ enforcement }: { enforcement: TabEnforcement }): JSX.Element | null {
  if (enforcement.status === 'enforced') return null;
  return (
    <div className="tmpl-editor__honesty" role="note">
      <span className="tmpl-editor__honesty-badge">Authored — not yet enforced</span>
      <p className="tmpl-editor__honesty-text">
        {enforcement.note}
        {enforcement.enforcedBy ? ` Enforced by the agent once ${enforcement.enforcedBy} lands.` : ''}
      </p>
    </div>
  );
}

export function TabSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="tmpl-editor__section" aria-label={title}>
      <h3 className="tmpl-editor__section-title">{title}</h3>
      {hint && <p className="tmpl-editor__hint">{hint}</p>}
      {children}
    </section>
  );
}

/** Editor for a simple list of strings (one per row). */
export function StringListEditor({
  label,
  values,
  placeholder,
  disabled,
  monospace,
  onChange,
}: {
  label: string;
  values: string[];
  placeholder?: string;
  disabled?: boolean;
  monospace?: boolean;
  onChange: (next: string[]) => void;
}): JSX.Element {
  const rows = values.length > 0 ? values : [''];
  const update = (idx: number, val: string): void => {
    const next = rows.map((v, i) => (i === idx ? val : v));
    onChange(next);
  };
  const add = (): void => onChange([...values, '']);
  const remove = (idx: number): void => {
    const next = values.filter((_, i) => i !== idx);
    onChange(next);
  };
  return (
    <div className="tmpl-editor__list" role="group" aria-label={label}>
      {rows.map((val, idx) => (
        <div key={idx} className="tmpl-editor__list-row">
          <input
            type="text"
            className={monospace ? 'tmpl-editor__input tmpl-editor__input--mono' : 'tmpl-editor__input'}
            aria-label={`${label} ${idx + 1}`}
            placeholder={placeholder}
            value={val}
            disabled={disabled}
            onChange={(e) => update(idx, e.target.value)}
          />
          {!disabled && values.length > 0 && (
            <button
              type="button"
              className="tmpl-editor__text-btn tmpl-editor__text-btn--danger"
              onClick={() => remove(idx)}
              aria-label={`Remove ${label} ${idx + 1}`}
            >
              Remove
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <HaButton variant="secondary" onClick={add}>
          Add {label.toLowerCase()}
        </HaButton>
      )}
    </div>
  );
}

/** Labelled checkbox row. */
export function CheckRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}): JSX.Element {
  return (
    <label className="tmpl-editor__check">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
