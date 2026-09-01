import type { Meta, StoryObj } from '@storybook/react';

import { ReasoningStream } from './ReasoningStream';

/** Lifecycle: **alpha**. Live "watch the agent think" surface (design §5a), intelligence-violet. */
const meta = {
  title: 'HaUI/AI Kit/ReasoningStream',
  component: ReasoningStream,
  tags: ['autodocs'],
  parameters: { layout: 'padded', lifecycle: 'alpha' },
} satisfies Meta<typeof ReasoningStream>;

export default meta;
type Story = StoryObj<typeof meta>;

const lines = [
  { id: '1', text: 'Triaging: 47 auth failures from a single source in 4 minutes.' },
  { id: '2', text: 'Enriching source IP.', citations: [{ label: 'GTI: 10.0.14.203', onClick: () => {} }] },
  { id: '3', text: 'Building process tree on HOST-1000.', citations: [{ label: 'proc: powershell.exe', onClick: () => {} }] },
  { id: '4', text: 'Checking for lateral movement over SMB.' },
];

export const Streaming: Story = {
  args: { lines, streaming: true, onStop: () => {} },
};

export const Finished: Story = {
  args: { lines: [...lines, { id: '5', text: 'Verdict ready: Malicious (92%).' }], streaming: false },
};
