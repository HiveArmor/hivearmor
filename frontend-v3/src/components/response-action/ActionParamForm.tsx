/**
 * HiveArmor SOAR — ActionParamForm
 * Sprint 18 — T03 · frontend-v3/src/components/response-action/ActionParamForm.tsx
 *
 * Renders a dynamic form field for each ResponseActionParam entry.
 * Field types: string → TextInput, integer → TextInput[number],
 *              text → TextArea (4 rows), select → <select> via HaSelect,
 *              boolean → Switch.
 *
 * Validation: required params show a label "*" suffix and an error state
 *             when the current value is null / undefined / empty string.
 *
 * defaultValue is shown as placeholder text for string/integer fields only —
 * it is NEVER pre-filled into the controlled value.
 */

import type React from 'react';

import { Switch, TextArea, TextInput } from '@patternfly/react-core';

import type { ResponseActionParam } from '../../types/responseAction';

import { HaFormGroup } from '@/components/ha-form-group/HaFormGroup';
import { HaSelect } from '@/components/ha-select/HaSelect';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ActionParamFormProps {
  params: ResponseActionParam[];
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when a required param's value is absent / empty. */
function isMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

/** Humanise a snake_case / camelCase param name into a readable label. */
function toLabel(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

// ---------------------------------------------------------------------------
// Sub-field components
// ---------------------------------------------------------------------------

interface FieldProps {
  param: ResponseActionParam;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  disabled: boolean;
  hasError: boolean;
}

function StringField({ param, value, onChange, disabled, hasError }: FieldProps): JSX.Element {
  const placeholder =
    param.defaultValue !== null && param.defaultValue !== undefined
      ? String(param.defaultValue)
      : undefined;

  return (
    <TextInput
      id={`param-${param.name}`}
      value={typeof value === 'string' ? value : ''}
      placeholder={placeholder}
      isDisabled={disabled}
      validated={hasError ? 'error' : 'default'}
      onChange={(_evt: React.FormEvent<HTMLInputElement>, val: string) => onChange(param.name, val)}
      style={
        {
          '--pf-v5-c-form-control--Color': 'var(--ha-text-primary)',
          '--pf-v5-c-form-control--BackgroundColor': 'var(--ha-surface-raised)',
          '--pf-v5-c-form-control--BorderColor': hasError ? 'var(--ha-critical)' : 'var(--ha-border)',
        } as React.CSSProperties
      }
    />
  );
}

function IntegerField({ param, value, onChange, disabled, hasError }: FieldProps): JSX.Element {
  const placeholder =
    param.defaultValue !== null && param.defaultValue !== undefined
      ? String(param.defaultValue)
      : undefined;

  return (
    <TextInput
      id={`param-${param.name}`}
      type="number"
      value={value !== null && value !== undefined ? String(value) : ''}
      placeholder={placeholder}
      isDisabled={disabled}
      validated={hasError ? 'error' : 'default'}
      onChange={(_evt: React.FormEvent<HTMLInputElement>, val: string) => {
        // Propagate as a number when non-empty, otherwise propagate empty string
        // so the parent can detect "missing" for required validation.
        onChange(param.name, val === '' ? '' : Number(val));
      }}
      style={
        {
          '--pf-v5-c-form-control--Color': 'var(--ha-text-primary)',
          '--pf-v5-c-form-control--BackgroundColor': 'var(--ha-surface-raised)',
          '--pf-v5-c-form-control--BorderColor': hasError ? 'var(--ha-critical)' : 'var(--ha-border)',
        } as React.CSSProperties
      }
    />
  );
}

function TextField({ param, value, onChange, disabled, hasError }: FieldProps): JSX.Element {
  return (
    <TextArea
      id={`param-${param.name}`}
      rows={4}
      resizeOrientation="vertical"
      value={typeof value === 'string' ? value : ''}
      isDisabled={disabled}
      validated={hasError ? 'error' : 'default'}
      onChange={(_evt: React.FormEvent<HTMLTextAreaElement>, val: string) => onChange(param.name, val)}
      style={
        {
          '--pf-v5-c-form-control--Color': 'var(--ha-text-primary)',
          '--pf-v5-c-form-control--BackgroundColor': 'var(--ha-surface-primary)',
          '--pf-v5-c-form-control--BorderColor': hasError ? 'var(--ha-critical)' : 'var(--ha-border)',
          fontFamily: 'var(--ha-font-mono)',
        } as React.CSSProperties
      }
    />
  );
}

function SelectField({ param, value, onChange, disabled }: FieldProps): JSX.Element {
  const options = (param.options ?? []).map((opt) => ({ value: opt, label: opt }));

  return (
    <HaSelect
      options={options}
      value={typeof value === 'string' ? value : ''}
      onChange={(val) => onChange(param.name, val)}
      isDisabled={disabled}
      placeholder={`Select ${toLabel(param.name)}…`}
    />
  );
}

function BooleanField({ param, value, onChange, disabled }: FieldProps): JSX.Element {
  const checked = typeof value === 'boolean' ? value : false;

  return (
    <Switch
      id={`param-${param.name}`}
      label={checked ? 'Enabled' : 'Disabled'}
      isChecked={checked}
      isDisabled={disabled}
      onChange={(_evt: React.FormEvent<HTMLInputElement>, val: boolean) => onChange(param.name, val)}
      style={
        {
          '--pf-v5-c-switch__toggle--BackgroundColor': 'var(--ha-surface-raised)',
          '--pf-v5-c-switch__toggle--BorderColor': 'var(--ha-border)',
          '--pf-v5-c-switch__toggle--checked--BackgroundColor': 'var(--ha-primary)',
          '--pf-v5-c-switch__label--Color': 'var(--ha-text-primary)',
        } as React.CSSProperties
      }
    />
  );
}

// ---------------------------------------------------------------------------
// ActionParamForm
// ---------------------------------------------------------------------------

export function ActionParamForm({
  params,
  values,
  onChange,
  disabled = false,
}: ActionParamFormProps): JSX.Element {
  if (params.length === 0) {
    return (
      <p
        style={{
          fontSize: 'var(--ha-text-sm)',
          color: 'var(--ha-text-secondary)',
          margin: 0,
        }}
      >
        This action has no configurable parameters.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {params.map((param) => {
        const value = values[param.name];
        const hasError = param.required && isMissing(value);
        const labelText = param.required ? `${toLabel(param.name)} *` : toLabel(param.name);

        const fieldProps: FieldProps = {
          param,
          value,
          onChange,
          disabled,
          hasError,
        };

        let field: JSX.Element;
        switch (param.type) {
          case 'string':
            field = <StringField {...fieldProps} />;
            break;
          case 'integer':
            field = <IntegerField {...fieldProps} />;
            break;
          case 'text':
            field = <TextField {...fieldProps} />;
            break;
          case 'select':
            field = <SelectField {...fieldProps} />;
            break;
          case 'boolean':
            field = <BooleanField {...fieldProps} />;
            break;
          default: {
            // Exhaustive guard — ActionParamType is a closed union.
            const _exhaustive: never = param.type;
            field = <span style={{ color: 'var(--ha-critical)' }}>Unknown type: {_exhaustive}</span>;
          }
        }

        return (
          <HaFormGroup
            key={param.name}
            label={labelText}
            fieldId={`param-${param.name}`}
            isRequired={param.required}
          >
            {field}
            {hasError && (
              <div
                role="alert"
                style={{
                  marginTop: 4,
                  fontSize: 'var(--ha-text-xs)',
                  color: 'var(--ha-critical)',
                }}
              >
                {toLabel(param.name)} is required.
              </div>
            )}
          </HaFormGroup>
        );
      })}
    </div>
  );
}
