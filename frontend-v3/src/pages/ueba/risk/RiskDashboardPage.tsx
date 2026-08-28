/**
 * RiskDashboardPage — UEBA Risk Dashboard at `/ueba/risk`.
 *
 * Table-primary layout: user risk scores grid (≥50vh) with trend/anomaly charts
 * in a secondary sidebar. All data from confirmed `/api/ha-ueba/*` endpoints.
 *
 * Actions:
 * - "View Timeline" opens drawer embedding EntityTimelinePage
 * - "Create Incident" opens honest guidance to collect evidence in Search & Hunt
 *
 * Requirements: Prompt 14 UEBA Risk UX — STAGING CANDIDATE
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Activity, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

import { UserRiskTable } from './UserRiskTable';

import { HaChart } from '@/components/ha-chart/HaChart';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { useHaThemeTokens } from '@/hooks/useHaThemeTokens';
import { EntityTimelinePage } from '@/pages/ueba/entity-timeline/EntityTimelinePage';
import { getAnomalyCounts, getRiskScores, getRiskTrend } from '@/services/ueba.service';
import type { AnomalyCountsDTO, RiskTrendPointDTO, UserRiskDTO } from '@/types/ueba.types';

import './RiskDashboardPage.css';

/** Bundle-visible job sentence — behavioral risk overview, not alert triage or entity inventory. */
export const UEBA_RISK_JOB_SENTENCE =
  'UEBA risk overview — prioritize users by behavioral risk score, inspect trends and anomaly tiers, then pivot into per-user timeline or hunt.';

const DASHBOARD_TOKENS = [
  '--ha-high',
  '--ha-medium',
  '--ha-critical',
  '--ha-primary',
  '--ha-text-secondary',
] as const;

function useHighRiskUsers() {
  return useQuery<UserRiskDTO[], Error>({
    queryKey: ['ueba', 'risk-scores'],
    queryFn: getRiskScores,
    staleTime: 30_000,
  });
}

function useRiskTrend() {
  return useQuery<RiskTrendPointDTO[], Error>({
    queryKey: ['ueba', 'risk-trend'],
    queryFn: getRiskTrend,
    staleTime: 30_000,
  });
}

function useAnomalyCounts() {
  return useQuery<AnomalyCountsDTO, Error>({
    queryKey: ['ueba', 'anomaly-counts'],
    queryFn: getAnomalyCounts,
    staleTime: 30_000,
  });
}

export function RiskDashboardPage(): JSX.Element {
  const tokens = useHaThemeTokens(DASHBOARD_TOKENS);

  const {
    data: riskScores,
    isLoading: scoresLoading,
    isError: scoresError,
    refetch: refetchScores,
  } = useHighRiskUsers();
  const {
    data: riskTrend,
    isLoading: trendLoading,
    isError: trendError,
    refetch: refetchTrend,
  } = useRiskTrend();
  const {
    data: anomalyCounts,
    isLoading: countsLoading,
    isError: countsError,
    refetch: refetchCounts,
  } = useAnomalyCounts();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerUserId, setDrawerUserId] = useState('');
  const originatingRowRef = useRef<HTMLElement | null>(null);

  const openTimelineDrawer = useCallback((userId: string) => {
    setDrawerUserId(userId);
    setDrawerOpen(true);
    originatingRowRef.current = document.activeElement as HTMLElement | null;
  }, []);

  const closeTimelineDrawer = useCallback(() => {
    setDrawerOpen(false);
    if (originatingRowRef.current) {
      originatingRowRef.current.focus();
      originatingRowRef.current = null;
    }
  }, []);

  const [incidentGuidanceUserId, setIncidentGuidanceUserId] = useState<string | null>(null);

  const handleCreateIncident = useCallback((userId: string) => {
    setIncidentGuidanceUserId(userId);
  }, []);

  const dismissIncidentGuidance = useCallback(() => {
    setIncidentGuidanceUserId(null);
  }, []);

  const refreshAll = useCallback(() => {
    void refetchScores();
    void refetchTrend();
    void refetchCounts();
  }, [refetchCounts, refetchScores, refetchTrend]);

  const retryFailed = useCallback(() => {
    if (scoresError) void refetchScores();
    if (trendError) void refetchTrend();
    if (countsError) void refetchCounts();
  }, [countsError, refetchCounts, refetchScores, refetchTrend, scoresError, trendError]);

  const scoreRows = riskScores ?? [];
  const trendRows = riskTrend ?? [];
  const hasPartialError = scoresError || trendError || countsError;

  const allPanelsEmpty = useMemo(() => {
    if (scoresLoading || trendLoading || countsLoading) return false;
    if (hasPartialError) return false;
    const anomalyTotal = (anomalyCounts?.tier10 ?? 0) + (anomalyCounts?.tier25 ?? 0) + (anomalyCounts?.tier50 ?? 0);
    return scoreRows.length === 0 && trendRows.length === 0 && anomalyTotal === 0;
  }, [
    anomalyCounts,
    countsLoading,
    hasPartialError,
    scoreRows.length,
    scoresLoading,
    trendLoading,
    trendRows.length,
  ]);

  const barChartOption = buildBarChartOption(
    scoreRows,
    tokens['--ha-high'],
    tokens['--ha-medium'],
    tokens['--ha-text-secondary'],
  );

  const lineChartOption = buildLineChartOption(
    trendRows,
    tokens['--ha-primary'],
    tokens['--ha-text-secondary'],
  );

  return (
    <section className="ueba-risk-page" aria-label="UEBA risk dashboard">
      <header className="ueba-risk-page__header">
        <div className="ueba-risk-page__title-icon">
          <Activity size={20} aria-hidden="true" />
        </div>
        <div className="ueba-risk-page__title">
          <div className="ueba-risk-page__eyebrow">
            <span>Behavioral analytics</span>
            <span className="ueba-risk-page__badge">STAGING CANDIDATE</span>
          </div>
          <h1>UEBA Risk</h1>
          <p className="ueba-risk-page__job">{UEBA_RISK_JOB_SENTENCE}</p>
        </div>
        <div className="ueba-risk-page__header-actions">
          <button
            type="button"
            className="ueba-risk-page__refresh"
            onClick={refreshAll}
            aria-label="Refresh UEBA risk data"
          >
            <RefreshCw size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      <p className="ueba-risk-page__meta">
        <Link to="/dashboard">Mission Control</Link>
        <span aria-hidden="true">·</span>
        <Link to="/search">Search &amp; Hunt</Link>
        <span aria-hidden="true">·</span>
        <Link to="/entities">Entities</Link>
        <span aria-hidden="true">·</span>
        <Link to="/intelligence">Hive Intelligence</Link>
        <span aria-hidden="true">·</span>
        <Link to="/investigations">Investigations</Link>
        <span aria-hidden="true">·</span>
        <Link to="/incidents">Incidents</Link>
      </p>

      {allPanelsEmpty && (
        <div className="ueba-risk-page__honesty" role="status" data-testid="ueba-risk-empty-honesty">
          <strong>No UEBA risk data yet.</strong>
          <span>
            The baseline engine may have no scored users on this tenant. Panels below stay empty until
            `/api/ha-ueba/*` returns rows — not a production-ready UEBA deployment claim.
          </span>
        </div>
      )}

      {hasPartialError && (
        <div
          className="ueba-risk-page__partial-error"
          role="alert"
          data-testid="ueba-risk-partial-error"
        >
          <span>
            <strong>Partial UEBA data unavailable.</strong> One or more risk panels failed to load.
            Available panels remain below.
          </span>
          <button type="button" onClick={retryFailed}>
            Retry
          </button>
        </div>
      )}

      <div className="ueba-risk-page__body">
        <div className="ueba-risk-page__primary" data-testid="user-risk-table-panel">
          <UserRiskTable
            data={riskScores}
            isLoading={scoresLoading}
            isError={scoresError}
            onViewTimeline={openTimelineDrawer}
            onCreateIncident={handleCreateIncident}
          />
        </div>

        <aside className="ueba-risk-page__secondary" aria-label="UEBA risk summary charts">
          <AnomalyChips
            counts={anomalyCounts}
            loading={countsLoading}
            isError={countsError}
            mediumColor={tokens['--ha-medium']}
            highColor={tokens['--ha-high']}
            criticalColor={tokens['--ha-critical']}
          />

          <div className="ueba-risk-page__panel" data-testid="risk-bar-chart-panel">
            <h3>High-Risk Users</h3>
            {scoresError ? (
              <p className="ueba-risk-page__panel-empty">
                High-risk user scores could not be loaded.
              </p>
            ) : !scoresLoading && scoreRows.length === 0 ? (
              <p className="ueba-risk-page__panel-empty">
                No high-risk users were returned for the current scope.
              </p>
            ) : (
              <HaChart
                option={barChartOption}
                height={200}
                loading={scoresLoading}
                ariaLabel="High-risk users horizontal bar chart"
              />
            )}
          </div>

          <div className="ueba-risk-page__panel" data-testid="risk-trend-panel">
            <h3>30-Day Risk Trend</h3>
            {trendError ? (
              <p className="ueba-risk-page__panel-empty">Risk trend could not be loaded.</p>
            ) : !trendLoading && trendRows.length === 0 ? (
              <p className="ueba-risk-page__panel-empty">
                No risk-trend points were returned for the last 30 days.
              </p>
            ) : (
              <HaChart
                option={lineChartOption}
                height={200}
                loading={trendLoading}
                ariaLabel="30-day risk trend line chart"
              />
            )}
          </div>
        </aside>
      </div>

      {drawerOpen && (
        <div data-testid="view-timeline-drawer" data-user-id={drawerUserId}>
          <HaDrawer
            isOpen={drawerOpen}
            onClose={closeTimelineDrawer}
            title="Entity Timeline"
            subtitle={drawerUserId ? `User: ${drawerUserId}` : undefined}
            width={720}
          >
            {drawerUserId && <EntityTimelinePage userId={drawerUserId} height={520} />}
          </HaDrawer>
        </div>
      )}

      {incidentGuidanceUserId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ueba-incident-guidance-title"
          data-testid="ueba-create-incident-guidance"
          data-user-id={incidentGuidanceUserId}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 'var(--ha-z-modal)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'color-mix(in srgb, var(--ha-background) 70%, transparent)',
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 480,
              width: '100%',
              background: 'var(--ha-surface-raised)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-md)',
              padding: 20,
              color: 'var(--ha-text-primary)',
              fontSize: 'var(--ha-text-base)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <h2 id="ueba-incident-guidance-title" style={{ margin: 0, fontSize: 'var(--ha-text-md)' }}>
              Incident creation needs evidence
            </h2>
            <p style={{ margin: 0, color: 'var(--ha-text-secondary)' }}>
              UEBA risk scores are not alerts. Creating an incident requires linked alert evidence.
              Collect events for <strong>{incidentGuidanceUserId}</strong> in Search &amp; Hunt, then
              create an incident from selected rows.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="button"
                onClick={dismissIncidentGuidance}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--ha-border)',
                  borderRadius: 'var(--ha-radius-base)',
                  color: 'var(--ha-text-secondary)',
                  padding: '6px 12px',
                  cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
              <Link
                to={`/search?q=${encodeURIComponent(incidentGuidanceUserId)}`}
                onClick={dismissIncidentGuidance}
                style={{
                  background: 'color-mix(in srgb, var(--ha-primary) 20%, transparent)',
                  border: '1px solid var(--ha-primary)',
                  borderRadius: 'var(--ha-radius-base)',
                  color: 'var(--ha-primary)',
                  padding: '6px 12px',
                  textDecoration: 'none',
                  fontSize: 'var(--ha-text-sm)',
                }}
              >
                Open Search &amp; Hunt
              </Link>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

interface AnomalyChipsProps {
  counts: AnomalyCountsDTO | undefined;
  loading: boolean;
  isError: boolean;
  mediumColor: string;
  highColor: string;
  criticalColor: string;
}

function AnomalyChips({
  counts,
  loading,
  isError,
  mediumColor,
  highColor,
  criticalColor,
}: AnomalyChipsProps): JSX.Element {
  if (loading) {
    return (
      <div className="ueba-risk-page__panel" data-testid="anomaly-chips-panel">
        <h3>Anomaly Tiers</h3>
        <div className="ueba-risk-page__chips">
          {[1, 2, 3].map((i) => (
            <div key={i} className="ueba-risk-page__chip-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !counts) {
    return (
      <div className="ueba-risk-page__panel" data-testid="anomaly-chips-panel">
        <h3>Anomaly Tiers</h3>
        <p className="ueba-risk-page__panel-empty">Anomaly counts could not be loaded.</p>
      </div>
    );
  }

  const chips = [
    { testId: 'chip-tier10', label: '10-point', count: counts.tier10, color: mediumColor },
    { testId: 'chip-tier25', label: '25-point', count: counts.tier25, color: highColor },
    { testId: 'chip-tier50', label: '50-point', count: counts.tier50, color: criticalColor },
  ];

  const allZero = chips.every((chip) => chip.count === 0);

  return (
    <div className="ueba-risk-page__panel" data-testid="anomaly-chips-panel">
      <h3>Anomaly Tiers</h3>
      {allZero ? (
        <p className="ueba-risk-page__panel-empty">No anomaly tier counts for the current scope.</p>
      ) : (
        <div className="ueba-risk-page__chips">
          {chips.map((chip) => (
            <div
              key={chip.testId}
              data-testid={chip.testId}
              className="ueba-risk-page__chip"
              style={{
                background: `color-mix(in srgb, ${chip.color} 15%, transparent)`,
                borderColor: `color-mix(in srgb, ${chip.color} 35%, var(--ha-border))`,
              }}
            >
              <span className="ueba-risk-page__chip-count">{chip.count}</span>
              <span className="ueba-risk-page__chip-label">{chip.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function buildBarChartOption(
  scores: UserRiskDTO[],
  highColor: string,
  mediumColor: string,
  axisColor: string,
) {
  const sorted = [...scores].sort((a, b) => b.totalScore - a.totalScore).slice(0, 10);
  const maxScore = sorted.length > 0 ? sorted[0].totalScore : 100;
  const topDecileThreshold = maxScore * 0.9;

  return {
    tooltip: { trigger: 'axis' as const },
    grid: { left: '22%', right: '8%', top: '5%', bottom: '10%' },
    xAxis: {
      type: 'value' as const,
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: axisColor, fontSize: 10 },
    },
    yAxis: {
      type: 'category' as const,
      data: sorted.map((s) => s.userId),
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: axisColor, fontSize: 10 },
    },
    series: [
      {
        type: 'bar' as const,
        data: sorted.map((s) => ({
          value: s.totalScore,
          itemStyle: {
            color: s.totalScore >= topDecileThreshold ? highColor : mediumColor,
          },
        })),
      },
    ],
  };
}

function buildLineChartOption(
  trend: RiskTrendPointDTO[],
  lineColor: string,
  axisColor: string,
) {
  return {
    tooltip: { trigger: 'axis' as const },
    grid: { left: '12%', right: '6%', top: '10%', bottom: '18%' },
    xAxis: {
      type: 'category' as const,
      data: trend.map((t) => t.day),
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: axisColor, fontSize: 9, rotate: 35 },
    },
    yAxis: {
      type: 'value' as const,
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: axisColor, fontSize: 10 },
    },
    series: [
      {
        type: 'line' as const,
        data: trend.map((t) => t.totalScore),
        lineStyle: { color: lineColor },
        itemStyle: { color: lineColor },
        smooth: true,
      },
    ],
  };
}
