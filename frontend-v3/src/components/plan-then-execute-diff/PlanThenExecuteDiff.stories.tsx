import type { Meta, StoryObj } from '@storybook/react';

import { PlanThenExecuteDiff } from './PlanThenExecuteDiff';

/** Lifecycle: **alpha**. Shows the remediation plan + rollback before acting, confirm-gated (§5a). */
const meta = {
  title: 'HaUI/AI Kit/PlanThenExecuteDiff',
  component: PlanThenExecuteDiff,
  tags: ['autodocs'],
  parameters: { layout: 'padded', lifecycle: 'alpha' },
} satisfies Meta<typeof PlanThenExecuteDiff>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Containment: Story = {
  args: {
    title: 'Contain HOST-1000',
    steps: [
      { action: 'Block 10.0.14.203 at the perimeter firewall', kind: 'add', effect: 'stops the outbound C2 beacon' },
      { action: 'Remove the temporary allow-any egress rule', kind: 'remove' },
      { action: 'Set HOST-1000 to network-isolation policy', kind: 'modify', effect: 'agent stays connected to HiveArmor only' },
    ],
    rollback: 'Remove the firewall block and restore the prior egress policy; isolation is lifted on approval.',
    onConfirm: () => {},
    onDryRun: () => {},
    onCancel: () => {},
  },
};
