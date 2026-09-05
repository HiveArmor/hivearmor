/**
 * HuntMetricsView tests — aggregation/metric view over the loaded result set.
 *  a) KPI tiles reflect the loaded rows (count, alerting, distinct hosts/users).
 *  b) scope note is honest when loaded < matched.
 *  c) empty state renders when there are no rows.
 * (HaChart is lazy + canvas — mocked so the aggregation logic is what's under test.)
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { HuntMetricsView } from './HuntMetricsView';
import type { HuntEvent } from '../searchHunt.types';

vi.mock('@/components/ha-chart/HaChart', () => ({
  HaChart: () => <div data-testid="ha-chart" />,
}));

function evt(over: Partial<HuntEvent>): HuntEvent {
  return {
    id: 'e', timestamp: 't', ingestedAt: 't', severity: 'low', dataSource: 'windows', dataset: 'windows.security',
    category: 'auth', action: 'logon_failed', host: 'H1', user: 'U1', sourceIp: '1.1.1.1', destinationIp: null,
    message: 'm', tenantId: 't', tenantName: 'T', alertCount: 0, normalized: {}, ...over,
  };
}

describe('HuntMetricsView', () => {
  const events: HuntEvent[] = [
    evt({ id: '1', severity: 'critical', host: 'H1', user: 'U1', alertCount: 2 }),
    evt({ id: '2', severity: 'high', host: 'H2', user: 'U2', alertCount: 0 }),
    evt({ id: '3', severity: 'high', host: 'H1', user: 'U1', alertCount: 1 }),
  ];

  it('shows KPI counts derived from the loaded rows', () => {
    const { container } = render(<HuntMetricsView events={events} totalApproximate={3} totalIsExact />);
    // Each KPI tile is a value+label pair; assert value by walking from the label.
    const kpiValueFor = (label: RegExp): string | null => {
      const labelEl = screen.getByText(label);
      return labelEl.parentElement?.querySelector('.hunt-metrics__kpi-value')?.textContent ?? null;
    };
    expect(kpiValueFor(/^Events$/i)).toBe('3');
    expect(kpiValueFor(/With alerts/i)).toBe('2');       // 2 rows have alertCount>0
    expect(kpiValueFor(/Distinct hosts/i)).toBe('2');    // H1, H2
    expect(kpiValueFor(/Distinct users/i)).toBe('2');    // U1, U2
    expect(screen.getByText(/Summarising all 3 matched rows/i)).toBeInTheDocument();
    expect(container.querySelectorAll('.hunt-metrics__panel').length).toBeGreaterThan(0);
  });

  it('warns honestly when only some matched rows are loaded', () => {
    render(<HuntMetricsView events={events} totalApproximate={239} totalIsExact={false} />);
    expect(screen.getByText(/Summarising the 3 loaded rows of ~239 matched/i)).toBeInTheDocument();
  });

  it('renders an empty state with no rows', () => {
    render(<HuntMetricsView events={[]} />);
    expect(screen.getByText(/No rows loaded to summarise/i)).toBeInTheDocument();
  });
});
