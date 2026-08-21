/**
 * RiskProfilePanel — Sprint 46
 * Displays risk score (colored by level), trend arrow, ECharts sparkline
 * for risk history, and driver cards with contribution bars.
 */

import { lazy, Suspense } from 'react';

import type { EChartsOption } from 'echarts';
import { ArrowDownRight, ArrowRight, ArrowUpRight, ShieldAlert } from 'lucide-react';

import type { RiskProfile } from '../types/dossier.types';

import './RiskProfilePanel.css';

const HaChart = lazy(() =>
  import('@/components/ha-chart/HaChart').then(m => ({ default: m.HaChart })),
);

export interface RiskProfilePanelProps {
  riskProfile: RiskProfile;
}

function buildSparklineOption(history: { date: string; score: number }[]): EChartsOption {
  if (!history.length) {
    return { title: { text: 'No history data', left: 'center', top: 'center' } };
  }
  return {
    animation: false,
    grid: { left: 32, right: 12, top: 8, bottom: 24 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: history.map(h => {
        const d = new Date(h.date);
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }),
      axisLabel: { fontSize: 10 },
    },
    yAxis: { type: 'value', min: 0, max: 100, interval: 25, axisLabel: { fontSize: 10 } },
    tooltip: { trigger: 'axis', valueFormatter: (v) => `${String(v)}/100` },
    series: [{
      type: 'line',
      data: history.map(h => h.score),
      smooth: false,
      symbolSize: 3,
      lineStyle: { width: 2 },
      areaStyle: { opacity: 0.06 },
    }],
  };
}

function TrendIndicator({ trend }: { trend: string }): JSX.Element {
  const Icon = trend === 'rising' ? ArrowUpRight : trend === 'declining' ? ArrowDownRight : ArrowRight;
  return (
    <span className="ha-risk-panel__trend" data-trend={trend}>
      <Icon size={14} />
      {trend}
    </span>
  );
}

export function RiskProfilePanel({ riskProfile }: RiskProfilePanelProps): JSX.Element {
  const sparklineOption = buildSparklineOption(riskProfile.history);

  return (
    <section className="ha-risk-panel">
      <header className="ha-risk-panel__header">
        <ShieldAlert size={14} />
        <h2>Risk Profile</h2>
      </header>

      <div className="ha-risk-panel__top">
        <div className="ha-risk-panel__score" data-level={riskProfile.level}>
          <span className="ha-risk-panel__score-value">{riskProfile.score}</span>
          <span className="ha-risk-panel__score-label">{riskProfile.level}</span>
          <TrendIndicator trend={riskProfile.trend} />
        </div>

        <div className="ha-risk-panel__sparkline">
          <Suspense fallback={<div className="ha-risk-panel__chart-loading" />}>
            <HaChart
              option={sparklineOption}
              height={120}
              ariaLabel="Risk score history"
              ariaDescription="Daily risk scores over the selected window period"
            />
          </Suspense>
        </div>
      </div>

      {riskProfile.drivers.length > 0 && (
        <div className="ha-risk-panel__drivers">
          <h3>Risk Drivers</h3>
          <ul>
            {riskProfile.drivers.map(driver => (
              <li key={driver.id} className="ha-risk-panel__driver">
                <div className="ha-risk-panel__driver-header">
                  <span className="ha-risk-panel__driver-category">{driver.category.replace(/_/g, ' ')}</span>
                  <span className="ha-risk-panel__driver-contribution">+{driver.contribution}</span>
                </div>
                <p className="ha-risk-panel__driver-desc">{driver.description}</p>
                <div className="ha-risk-panel__driver-bar">
                  <i style={{ width: `${Math.min(100, driver.contribution * 2)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
