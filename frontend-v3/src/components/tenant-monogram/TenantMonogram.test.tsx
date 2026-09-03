import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { TenantMonogram, tenantMonogram } from './TenantMonogram';

describe('tenantMonogram', () => {
  it('uses the prefix when present', () => {
    expect(tenantMonogram('nwf', 'Northwind Financial')).toBe('NWF');
  });

  it('falls back to label initials when no prefix', () => {
    expect(tenantMonogram('', 'Aegis Public Sector')).toBe('APS');
  });

  it('takes leading chars for a single-word label', () => {
    expect(tenantMonogram('', 'Meridian')).toBe('MER');
  });
});

describe('TenantMonogram', () => {
  it('renders the monogram with a stable tint for the All-tenants scope', () => {
    render(<TenantMonogram tenantId={null} prefix="" label="All Tenants" />);
    const chip = screen.getByText('ALL');
    expect(chip).toHaveAttribute('data-tint', 'teal');
  });

  it('assigns a tint deterministically from the tenant id', () => {
    render(<TenantMonogram tenantId={2} prefix="mhc" label="Meridian Health" />);
    const chip = screen.getByText('MHC');
    expect(chip.getAttribute('data-tint')).toBeTruthy();
  });
});
