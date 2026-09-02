import type { Meta, StoryObj } from '@storybook/react';

import { TenantBadge } from './TenantBadge';

const meta = {
  title: 'HaUI/TenantBadge',
  component: TenantBadge,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof TenantBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    tenantId: 1,
    tenantName: 'Acme Corp',
  },
};

export const LongName: Story = {
  args: {
    tenantId: 2,
    tenantName: 'Very Long Tenant Organization Name Inc.',
  },
};

export const ShortName: Story = {
  args: {
    tenantId: 3,
    tenantName: 'Globex',
  },
};
