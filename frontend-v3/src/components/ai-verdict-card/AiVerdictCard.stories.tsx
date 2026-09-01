import type { Meta, StoryObj } from '@storybook/react';

import { AiVerdictCard } from './AiVerdictCard';

/**
 * Lifecycle: **alpha**. Keystone of the AI kit (design §5a). Built on HaCard, wears
 * --ha-intelligence-primary provenance. Registered in the HaUI Storybook tree.
 */
const meta = {
  title: 'HaUI/AI Kit/AiVerdictCard',
  component: AiVerdictCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded', lifecycle: 'alpha' },
} satisfies Meta<typeof AiVerdictCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Malicious: Story = {
  args: {
    verdict: 'malicious',
    confidence: 92,
    summary: 'Brute-force auth → successful login → lateral movement over SMB.',
    conclusion:
      'The agent correlated 47 auth failures with a successful login and subsequent SMB access to three hosts, consistent with credential access → lateral movement (ATT&CK T1110 → T1021.002).',
    reasoning: [
      { label: 'Initial assessment', detail: 'severity + entity triage', state: 'done' },
      { label: 'Enrichment', detail: 'GTI + geo + asset context', state: 'done' },
      { label: 'Deep-dive', detail: 'process tree + lateral check', state: 'active' },
      { label: 'Verdict', state: 'pending' },
    ],
    evidence: [
      { label: 'Source IP', value: '10.0.14.203' },
      { label: 'Host', value: 'HOST-1000' },
      { label: 'User', value: 'a.khan' },
      { label: 'Technique', value: 'T1110.001' },
    ],
  },
};

export const Benign: Story = {
  args: {
    verdict: 'benign',
    confidence: 78,
    summary: 'Failed logins traced to a misconfigured backup service, not an attacker.',
    conclusion: 'The source is an internal scheduled job with an expired credential.',
    reasoning: [
      { label: 'Enrichment', detail: 'asset is a known backup host', state: 'done' },
      { label: 'Verdict', state: 'done' },
    ],
  },
};

export const Inconclusive: Story = {
  args: {
    verdict: 'inconclusive',
    confidence: 41,
    summary: 'Insufficient endpoint telemetry to confirm or rule out compromise.',
  },
};
