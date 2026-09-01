import type { Meta, StoryObj } from '@storybook/react';

import { ApprovalCard } from './ApprovalCard';
import { PlanThenExecuteDiff } from '../plan-then-execute-diff';


/** Lifecycle: **alpha**. Human-in-the-loop gate for a state-changing agent action (§5a). */
const meta = {
  title: 'HaUI/AI Kit/ApprovalCard',
  component: ApprovalCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded', lifecycle: 'alpha' },
} satisfies Meta<typeof ApprovalCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HighRiskReversible: Story = {
  args: {
    action: 'Isolate HOST-1000',
    agent: 'Response agent',
    risk: 'high',
    blastRadius: '1 endpoint · 1 user session',
    reversible: true,
    expiry: 'auto-rejects in 15m',
    onApprove: () => {},
    onModify: () => {},
    onReject: () => {},
  },
};

export const CriticalIrreversible: Story = {
  args: {
    action: 'Disable service account svc-backup',
    agent: 'Response agent',
    risk: 'critical',
    blastRadius: '12 downstream jobs · org-wide',
    reversible: false,
    expiry: 'auto-rejects in 5m',
    onApprove: () => {},
    onReject: () => {},
  },
};

export const WithEmbeddedPlan: Story = {
  args: {
    action: 'Contain HOST-1000',
    agent: 'Response agent',
    risk: 'high',
    blastRadius: '1 endpoint',
    reversible: true,
    onApprove: () => {},
    onReject: () => {},
    children: (
      <div style={{ marginTop: 10 }}>
        <PlanThenExecuteDiff
          title="Contain HOST-1000"
          steps={[
            { action: 'Block 10.0.14.203 at the firewall', kind: 'add', effect: 'stops C2 beacon' },
            { action: 'Set HOST-1000 to isolation policy', kind: 'modify' },
          ]}
          rollback="Remove the block and restore the prior policy on approval."
        />
      </div>
    ),
  },
};
