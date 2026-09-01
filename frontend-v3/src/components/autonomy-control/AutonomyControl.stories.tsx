import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { AutonomyControl, type AutonomyLevel } from './AutonomyControl';

/** Lifecycle: **alpha**. Graduated trust-gradient autonomy control (design §5a); never binary. */
const meta = {
  title: 'HaUI/AI Kit/AutonomyControl',
  component: AutonomyControl,
  tags: ['autodocs'],
  parameters: { layout: 'centered', lifecycle: 'alpha' },
} satisfies Meta<typeof AutonomyControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  args: { value: 'auto-approve', label: 'Triage agent', onChange: () => {} },
  render: (args) => {
    const Demo = (): JSX.Element => {
      const [level, setLevel] = useState<AutonomyLevel>(args.value);
      return <AutonomyControl {...args} value={level} onChange={setLevel} />;
    };
    return <Demo />;
  },
};

export const Suggest: Story = { args: { value: 'suggest', label: 'Response agent', onChange: () => {} } };
export const Autopilot: Story = { args: { value: 'autopilot', label: 'Context agent', onChange: () => {} } };
export const LockedByPolicy: Story = {
  args: { value: 'suggest', label: 'Response agent (policy-locked)', disabled: true, onChange: () => {} },
};
