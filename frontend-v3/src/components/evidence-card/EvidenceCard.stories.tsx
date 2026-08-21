import type { Meta, StoryObj } from '@storybook/react';

import { EvidenceCard } from './EvidenceCard';

import type { EvidenceItem } from '@/types/api.types';

const noteEvidence: EvidenceItem = {
  id: 'ev-001',
  type: 'note',
  title: 'Investigation note',
  content: 'Analyst confirmed lateral movement from WIN-SERVER-01 to DB-PROD-02 at 14:32 UTC.',
  source: 'manual',
  timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  addedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  addedBy: 'john.doe',
};

const logEvidence: EvidenceItem = {
  id: 'ev-002',
  type: 'log_excerpt',
  title: 'Suspicious PowerShell execution',
  content:
    'EventID: 4688\nProcessName: powershell.exe\nCommandLine: powershell -enc JABjAG0AZAAgAD0AIAAnAGMAYQBsAGMAJwA=\nUser: DOMAIN\\jdoe\nHost: WIN-WS-042',
  source: 'windows_security',
  timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  addedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  addedBy: 'soc.analyst',
};

const hashEvidence: EvidenceItem = {
  id: 'ev-003',
  type: 'file_hash',
  title: 'Malware sample hash',
  content: 'SHA256: 3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4',
  source: 'threat_intel',
  timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  addedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  addedBy: 'threat.hunter',
};

const meta = {
  title: 'HiveArmor/EvidenceCard',
  component: EvidenceCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof EvidenceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Note: Story = {
  args: {
    evidence: noteEvidence,
    onEdit: (id) => alert(`Edit ${id}`),
    onDelete: (id) => alert(`Delete ${id}`),
  },
};

export const LogExcerpt: Story = {
  args: {
    evidence: logEvidence,
  },
};

export const FileHash: Story = {
  args: {
    evidence: hashEvidence,
    onEdit: (id) => alert(`Edit ${id}`),
  },
};

export const ReadOnly: Story = {
  args: {
    evidence: noteEvidence,
  },
};
