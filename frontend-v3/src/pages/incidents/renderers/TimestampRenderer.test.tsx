/**
 * TimestampRenderer — Tests
 */

import { render, screen } from '@testing-library/react';
import type { ICellRendererParams } from 'ag-grid-community';
import { describe, it, expect } from 'vitest';

import { TimestampRenderer } from './TimestampRenderer';

function makeParams(value: unknown): ICellRendererParams {
  return { value } as ICellRendererParams;
}

describe('TimestampRenderer', () => {
  it('renders — for null', () => {
    render(<TimestampRenderer {...makeParams(null)} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('renders — for undefined', () => {
    render(<TimestampRenderer {...makeParams(undefined)} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('renders — for empty string', () => {
    render(<TimestampRenderer {...makeParams('')} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('renders — for invalid date string', () => {
    render(<TimestampRenderer {...makeParams('not-a-date')} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('renders formatted date for valid ISO string', () => {
    const { container } = render(<TimestampRenderer {...makeParams('2024-01-15T10:30:00Z')} />);
    expect(container.textContent).not.toBe('—');
    expect(container.textContent).not.toBe('Invalid Date');
  });
});
