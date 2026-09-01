import type { Meta, StoryObj } from '@storybook/react';

import { HaBadge } from './HaBadge';

/** Lifecycle: **alpha**. Bordered inline pill extracted from EntityBadge + TenantBadge. */
const meta = {
  title: 'HaUI/HaBadge',
  component: HaBadge,
  tags: ['autodocs'],
  parameters: { layout: 'centered', lifecycle: 'alpha' },
  args: { children: 'Badge' },
} satisfies Meta<typeof HaBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Pill: Story = { args: { pill: true, children: 'Acme Corp' } };
export const Mono: Story = { args: { mono: true, children: '10.0.14.203' } };
export const Muted: Story = { args: { muted: true, children: 'staging' } };
export const WithDot: Story = {
  args: {
    children: 'HOST-1000',
    icon: (
      <span
        style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ha-severity-high)' }}
      />
    ),
  },
};
export const Interactive: Story = {
  args: { children: 'Clickable', onClick: () => alert('clicked') },
};
