import type { Meta, StoryObj } from '@storybook/react';

import { HaJsonViewer } from './HaJsonViewer';

const meta = {
  title: 'HaUI/HaJsonViewer',
  component: HaJsonViewer,
  parameters: { lifecycle: 'beta' },
  tags: ['autodocs'],
} satisfies Meta<typeof HaJsonViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleEvent: Record<string, unknown> = {
  '@timestamp': '2026-09-03T06:58:12Z',
  severity: 10,
  category: 'exfiltration',
  threatIntelMatched: true,
  source: { ip: '10.1.5.44', port: 51288 },
  destination: { ip: '203.0.113.88', port: 443 },
  rule: { id: 'HA-DET-114', mitre: 'T1048.003' },
  host: 'FIN-WKS-044',
  riskScore: 95,
  visibleBy: ['acme'],
  note: null,
};

export const RawEvent: Story = { args: { data: sampleEvent } };

export const Nested: Story = {
  args: {
    data: {
      process: { name: 'powershell.exe', pid: 4821, args: ['-enc', 'JABzAD0A'] },
      parent: { name: 'explorer.exe', pid: 992 },
      network: { connections: [{ dst: '203.0.113.88', bytes: 84213 }] },
    },
  },
};
