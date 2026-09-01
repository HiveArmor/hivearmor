import type { Meta, StoryObj } from '@storybook/react';

import { AgentStatusPill } from './AgentStatusPill';

/** Lifecycle: **alpha**. Agent lifecycle-state pill (design §5a); STATE tokens, not severity. */
const meta = {
  title: 'HaUI/AI Kit/AgentStatusPill',
  component: AgentStatusPill,
  tags: ['autodocs'],
  parameters: { layout: 'centered', lifecycle: 'alpha' },
  args: { agent: 'Triage' },
} satisfies Meta<typeof AgentStatusPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = { args: { status: 'running' } };
export const Queued: Story = { args: { status: 'queued' } };
export const Stopped: Story = { args: { status: 'stopped' } };
export const Idle: Story = { args: { status: 'idle' } };
export const Failed: Story = { args: { status: 'failed' } };
export const NoAgentName: Story = { args: { status: 'running', agent: undefined } };
