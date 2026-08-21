/**
 * ActionParamForm.test.tsx — Sprint 18 SOAR T03-3.9
 *
 * Five Vitest test cases:
 *   1) Renders a text input for type=string
 *   2) Renders a number input for type=integer
 *   3) Renders a select dropdown for type=select with the correct options
 *   4) Required param with empty value shows the "error" validation state
 *   5) onChange is invoked with the correct name and value when the input changes
 *
 * Mocked dependencies:
 *   - @patternfly/react-core (TextInput, TextArea, Switch) — render as simple HTML elements
 *   - @/components/ha-select/HaSelect                     — renders as a plain <select>
 *   - @/components/ha-form-group/HaFormGroup              — renders children with a label
 *
 * No `any` types.
 *
 * **Validates: Requirements 3.3**
 *
 * Product name: HiveArmor
 */

import React from 'react';

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { ActionParamForm } from './ActionParamForm';
import type { ActionParamFormProps } from './ActionParamForm';

import type { HaFormGroupProps } from '@/components/ha-form-group/HaFormGroup';
import type { HaSelectProps } from '@/components/ha-select/HaSelect';

// ---------------------------------------------------------------------------
// Mock @patternfly/react-core — TextInput, TextArea, Switch as HTML stubs
// ---------------------------------------------------------------------------

vi.mock('@patternfly/react-core', () => ({
  TextInput: ({
    id,
    type,
    value,
    placeholder,
    isDisabled,
    validated,
    onChange,
  }: {
    id?: string;
    type?: string;
    value?: string;
    placeholder?: string;
    isDisabled?: boolean;
    validated?: string;
    onChange?: (evt: React.FormEvent<HTMLInputElement>, val: string) => void;
    style?: React.CSSProperties;
  }) => (
    <input
      data-testid={id}
      id={id}
      type={type ?? 'text'}
      value={value ?? ''}
      placeholder={placeholder}
      disabled={isDisabled}
      data-validated={validated}
      onChange={(e) => onChange?.(e, e.target.value)}
    />
  ),
  TextArea: ({
    id,
    value,
    isDisabled,
    validated,
    onChange,
  }: {
    id?: string;
    value?: string;
    rows?: number;
    resizeOrientation?: string;
    isDisabled?: boolean;
    validated?: string;
    onChange?: (evt: React.FormEvent<HTMLTextAreaElement>, val: string) => void;
    style?: React.CSSProperties;
  }) => (
    <textarea
      data-testid={id}
      id={id}
      value={value ?? ''}
      disabled={isDisabled}
      data-validated={validated}
      onChange={(e) => onChange?.(e, e.target.value)}
    />
  ),
  Switch: ({
    id,
    isChecked,
    isDisabled,
    onChange,
  }: {
    id?: string;
    label?: string;
    isChecked?: boolean;
    isDisabled?: boolean;
    onChange?: (evt: React.FormEvent<HTMLInputElement>, val: boolean) => void;
    style?: React.CSSProperties;
  }) => (
    <input
      data-testid={id}
      id={id}
      type="checkbox"
      checked={isChecked ?? false}
      disabled={isDisabled}
      onChange={(e) => onChange?.(e, e.target.checked)}
    />
  ),
}));

// ---------------------------------------------------------------------------
// Mock @/components/ha-select/HaSelect — renders as a plain <select>
// ---------------------------------------------------------------------------

vi.mock('@/components/ha-select/HaSelect', () => ({
  HaSelect: ({
    options,
    value,
    onChange,
    isDisabled,
    placeholder,
  }: HaSelectProps) => (
    <select
      data-testid="ha-select"
      value={value ?? ''}
      disabled={isDisabled}
      onChange={(e) => onChange?.(e.target.value)}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

// ---------------------------------------------------------------------------
// Mock @/components/ha-form-group/HaFormGroup — renders children with a label
// ---------------------------------------------------------------------------

vi.mock('@/components/ha-form-group/HaFormGroup', () => ({
  HaFormGroup: ({
    label,
    fieldId,
    children,
  }: HaFormGroupProps) => (
    <div data-testid={`form-group-${fieldId}`}>
      <label htmlFor={fieldId}>{label}</label>
      {children}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Shared test fixture helpers
// ---------------------------------------------------------------------------

function buildProps(overrides: Partial<ActionParamFormProps> = {}): ActionParamFormProps {
  return {
    params: [],
    values: {},
    onChange: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActionParamForm', () => {
  it('renders a text input for type=string', () => {
    const props = buildProps({
      params: [
        {
          name: 'agentId',
          type: 'string',
          required: false,
          defaultValue: null,
          options: null,
        },
      ],
      values: { agentId: 'abc-123' },
    });

    render(<ActionParamForm {...props} />);

    const input = screen.getByTestId('param-agentId') as HTMLInputElement;
    expect(input).toBeDefined();
    // TextInput mock renders type="text" by default
    expect(input.type).toBe('text');
    expect(input.value).toBe('abc-123');
  });

  it('renders a number input for type=integer', () => {
    const props = buildProps({
      params: [
        {
          name: 'duration',
          type: 'integer',
          required: false,
          defaultValue: 3600,
          options: null,
        },
      ],
      values: { duration: 120 },
    });

    render(<ActionParamForm {...props} />);

    const input = screen.getByTestId('param-duration') as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.type).toBe('number');
    expect(input.value).toBe('120');
  });

  it('renders a select dropdown for type=select with the correct options', () => {
    const props = buildProps({
      params: [
        {
          name: 'priority',
          type: 'select',
          required: false,
          defaultValue: 'Medium',
          options: ['Highest', 'High', 'Medium', 'Low'],
        },
      ],
      values: { priority: 'High' },
    });

    render(<ActionParamForm {...props} />);

    const select = screen.getByTestId('ha-select') as HTMLSelectElement;
    expect(select).toBeDefined();
    expect(select.value).toBe('High');

    const optionLabels = Array.from(select.options)
      .map((o) => o.text)
      // The placeholder option is the first one (empty value, disabled)
      .filter((text) => !text.startsWith('Select'));

    expect(optionLabels).toEqual(['Highest', 'High', 'Medium', 'Low']);
  });

  it('shows the "error" validation state for a required param with empty value', () => {
    const props = buildProps({
      params: [
        {
          name: 'username',
          type: 'string',
          required: true,
          defaultValue: null,
          options: null,
        },
      ],
      // Empty string triggers the missing-value check
      values: { username: '' },
    });

    render(<ActionParamForm {...props} />);

    const input = screen.getByTestId('param-username');
    expect(input.getAttribute('data-validated')).toBe('error');
  });

  it('invokes onChange with the correct name and value when the input changes', () => {
    const handleChange = vi.fn();
    const props = buildProps({
      params: [
        {
          name: 'agentId',
          type: 'string',
          required: false,
          defaultValue: null,
          options: null,
        },
      ],
      values: { agentId: '' },
      onChange: handleChange,
    });

    render(<ActionParamForm {...props} />);

    const input = screen.getByTestId('param-agentId');
    fireEvent.change(input, { target: { value: 'endpoint-42' } });

    expect(handleChange).toHaveBeenCalledOnce();
    expect(handleChange).toHaveBeenCalledWith('agentId', 'endpoint-42');
  });
});
