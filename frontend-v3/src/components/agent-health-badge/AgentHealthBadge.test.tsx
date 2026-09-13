import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AgentHealthBadge } from './AgentHealthBadge';

import { computeCompositeHealth, computeFreshness } from '@/services/agentHealth';
import type { AgentVitalsSample } from '@/services/telemetryService';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NOW = Date.parse('2026-09-13T08:00:00Z');

function sample(overrides: Partial<AgentVitalsSample> = {}): AgentVitalsSample {
  return {
    cpuPct: 20,
    ramMb: 512,
    queueDepth: 30,
    eventsPerSec: 100,
    droppedTotal: 0,
    lastError: null,
    appliedPolicyId: 1,
    appliedPolicyVersion: 1,
    sampledAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

describe('AgentHealthBadge — source hygiene', () => {
  it('uses no raw hex (tokens only)', () => {
    const tsx = readFileSync(join(__dirname, 'AgentHealthBadge.tsx'), 'utf-8');
    const css = readFileSync(join(__dirname, 'AgentHealthBadge.css'), 'utf-8');
    expect(tsx.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
  });
});

describe('AgentHealthBadge — degradation is never hidden', () => {
  it('shows Critical + the failing reason when CPU is red (never a green light)', () => {
    const samples = [sample({ cpuPct: 99 })];
    render(
      <AgentHealthBadge
        variant="compact"
        health={computeCompositeHealth(samples, NOW)}
        freshness={computeFreshness(samples, NOW)}
      />,
    );
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText(/CPU/)).toBeInTheDocument();
    expect(screen.queryByText('Healthy')).not.toBeInTheDocument();
  });

  it('renders per-dimension pills in the full variant', () => {
    const samples = [sample({ queueDepth: 5000 })];
    render(
      <AgentHealthBadge
        variant="full"
        health={computeCompositeHealth(samples, NOW)}
        freshness={computeFreshness(samples, NOW)}
      />,
    );
    expect(screen.getByText('Degraded')).toBeInTheDocument();
    // Dimension pills present.
    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('Queue')).toBeInTheDocument();
    expect(screen.getByText('Freshness')).toBeInTheDocument();
  });

  it('shows an explicit "No vitals reported yet" state, not a fake green', () => {
    render(
      <AgentHealthBadge
        variant="full"
        health={computeCompositeHealth([], NOW)}
        freshness={computeFreshness([], NOW)}
      />,
    );
    expect(screen.getByText(/has not sent a telemetry sample/i)).toBeInTheDocument();
    expect(screen.queryByText('Healthy')).not.toBeInTheDocument();
  });

  it('shows an explicit error state when errored, not a blank', () => {
    render(
      <AgentHealthBadge
        variant="compact"
        errored
        health={computeCompositeHealth([], NOW)}
        freshness={computeFreshness([], NOW)}
      />,
    );
    expect(screen.getByText('Health unavailable')).toBeInTheDocument();
  });
});
