import type { Meta, StoryObj } from '@storybook/react';

import { HaStepper } from './HaStepper';

const meta = {
  title: 'HaUI/HaStepper',
  component: HaStepper,
  parameters: { lifecycle: 'beta', layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof HaStepper>;

export default meta;
type Story = StoryObj<typeof meta>;

const STEPS = [
  { id: 'auth', label: 'Authentication' },
  { id: 'verify', label: 'Verification' },
  { id: 'done', label: 'Complete' },
];

export const MidFlow: Story = {
  args: { steps: STEPS, current: 1, ariaLabel: 'Sign in' },
};

export const FirstStep: Story = {
  args: { steps: STEPS, current: 0, ariaLabel: 'Sign in' },
};

export const LastStep: Story = {
  args: { steps: STEPS, current: 2, ariaLabel: 'Sign in' },
};

export const ReportConfig: Story = {
  args: {
    steps: [
      { id: 'scope', label: 'Scope' },
      { id: 'schedule', label: 'Schedule' },
      { id: 'recipients', label: 'Recipients' },
      { id: 'review', label: 'Review' },
    ],
    current: 2,
    ariaLabel: 'Report configuration',
  },
};
