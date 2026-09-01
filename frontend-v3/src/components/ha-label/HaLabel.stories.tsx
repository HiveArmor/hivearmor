import type { Meta, StoryObj } from '@storybook/react';

import { HaLabel } from './HaLabel';

/** Lifecycle: **alpha**. Inline icon + colored text label extracted from StatusLabel. */
const meta = {
  title: 'HaUI/HaLabel',
  component: HaLabel,
  tags: ['autodocs'],
  parameters: { layout: 'centered', lifecycle: 'alpha' },
  args: { children: 'Label' },
} satisfies Meta<typeof HaLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

const dot = (c: string): JSX.Element => (
  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
);

export const Healthy: Story = {
  args: { children: 'Resolved', color: 'var(--ha-state-healthy)', icon: dot('var(--ha-state-healthy)') },
};
export const Warning: Story = {
  args: { children: 'In progress', color: 'var(--ha-state-warning)', icon: dot('var(--ha-state-warning)') },
};
export const Verdict: Story = {
  args: { children: 'Malicious', color: 'var(--ha-intelligence-primary)', icon: dot('var(--ha-intelligence-primary)') },
};
