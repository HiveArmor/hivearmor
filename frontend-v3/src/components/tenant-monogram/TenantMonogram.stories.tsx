import type { Meta, StoryObj } from '@storybook/react';

import { TenantMonogram } from './TenantMonogram';

const meta = {
  title: 'HaUI/TenantMonogram',
  component: TenantMonogram,
  parameters: { lifecycle: 'stable' },
  tags: ['autodocs'],
} satisfies Meta<typeof TenantMonogram>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { tenantId: 1, prefix: 'nwf', label: 'Northwind Financial' } };

export const AllTenants: Story = { args: { tenantId: null, prefix: '', label: 'All Tenants' } };

export const Medium: Story = { args: { tenantId: 2, prefix: 'mhc', label: 'Meridian Health', size: 'md' } };

export const Palette: Story = {
  args: { tenantId: 0, prefix: 'aps', label: 'Aegis Public Sector' },
  render: () => (
    <div style={{ display: 'flex', gap: 10 }}>
      <TenantMonogram tenantId={1} prefix="nwf" label="Northwind Financial" />
      <TenantMonogram tenantId={2} prefix="mhc" label="Meridian Health" />
      <TenantMonogram tenantId={3} prefix="aps" label="Aegis Public Sector" />
      <TenantMonogram tenantId={4} prefix="grn" label="Green Co" />
      <TenantMonogram tenantId={null} prefix="" label="All Tenants" />
    </div>
  ),
};
