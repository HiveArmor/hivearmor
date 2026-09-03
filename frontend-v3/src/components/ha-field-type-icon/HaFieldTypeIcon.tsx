import { Braces, Calendar, Globe, Hash, ToggleLeft, Type } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import './HaFieldTypeIcon.css';

/**
 * SIEM field data types. Mirrors HuntFieldType in the search-hunt model so the
 * same icon language can be reused across the field browser, event flyout, and
 * any typed key/value grid. Kept local (not imported) so this primitive has no
 * dependency on a page-level type.
 */
export type HaFieldType = 'date' | 'keyword' | 'text' | 'ip' | 'number' | 'boolean';

interface FieldTypeSpec {
  icon: LucideIcon;
  /** Human label used for the tooltip and the accessible name. */
  label: string;
}

const FIELD_TYPE_SPECS: Record<HaFieldType, FieldTypeSpec> = {
  date: { icon: Calendar, label: 'Date' },
  keyword: { icon: Type, label: 'Keyword' },
  text: { icon: Braces, label: 'Text' },
  ip: { icon: Globe, label: 'IP address' },
  number: { icon: Hash, label: 'Number' },
  boolean: { icon: ToggleLeft, label: 'Boolean' },
};

export interface HaFieldTypeIconProps {
  /** The field's data type. Unknown values render a neutral keyword glyph. */
  type: HaFieldType | string;
  /** Icon size in px (default 13, matching dense field rows). */
  size?: number;
  /** When true the label is announced to screen readers; otherwise decorative. */
  labelled?: boolean;
  className?: string;
}

/** Resolve a possibly-unknown type string to a known spec, defaulting to keyword. */
function specFor(type: string): FieldTypeSpec {
  return (FIELD_TYPE_SPECS as Record<string, FieldTypeSpec>)[type] ?? FIELD_TYPE_SPECS.keyword;
}

/**
 * A small type glyph for a SIEM field. Pairs the field's data type with a
 * distinct icon so type is never conveyed by text or colour alone (WCAG 2.2).
 */
export function HaFieldTypeIcon({ type, size = 13, labelled = false, className }: HaFieldTypeIconProps) {
  const spec = specFor(type);
  const Icon = spec.icon;
  const classes = className ? `ha-field-type-icon ${className}` : 'ha-field-type-icon';
  return (
    <span
      className={classes}
      data-type={type in FIELD_TYPE_SPECS ? type : 'unknown'}
      title={spec.label}
      role="img"
      aria-label={labelled ? `${spec.label} field` : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      <Icon size={size} aria-hidden="true" />
    </span>
  );
}
