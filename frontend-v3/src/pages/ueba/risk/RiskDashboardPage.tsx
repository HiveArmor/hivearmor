/**
 * RiskDashboardPage — UEBA Risk Dashboard at `/ueba/risk`.
 *
 * Contains four panels:
 * - Horizontal bar chart of high-risk users (HaChart, backed by /risk-scores)
 * - 30-day risk-trend line chart (HaChart, backed by /risk-trend)
 * - Anomaly-count chips (backed by /anomaly-counts)
 * - UserRiskTable (AG Grid / SiemDataGrid, backed by /risk-scores)
 *
 * Actions:
 * - "View Timeline" opens View_Timeline_Drawer embedding EntityTimelinePage
 * - "Create Incident" opens honest guidance to collect evidence in Search & Hunt
 *
 * All fetches go through uebaService (JWT injection is automatic via apiClient).
 * No raw fetch() or axios calls. No hex color literals. No `any` types.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 7.7, 7.8
 */

import { useCallback, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { UserRiskTable } from './UserRiskTable';

import { HaChart } from '@/components/ha-chart/HaChart';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { useHaThemeTokens } from '@/hooks/useHaThemeTokens';
import { EntityTimelinePage } from '@/pages/ueba/entity-timeline/EntityTimelinePage';
import { getAnomalyCounts, getRiskScores, getRiskTrend } from '@/services/ueba.service';
import type { AnomalyCountsDTO, RiskTrendPointDTO, UserRiskDTO } from '@/types/ueba.types';

// ── Theme tokens ─────────────────────────────────────────────────────────────
const DASHBOARD_TOKENS = [
  '--ha-high',
  '--ha-medium',
  '--ha-critical',
  '--ha-primary',
  '--ha-text-secondary',
] as const;

// ── Hooks (all go through uebaService → apiClient → JWT auto-injection) ──────

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

// ── Component ────────────────────────────────────────────────────────────────

export function RiskDashboardPage(): JSX.Element {
  const tokens = useHaThemeTokens(DASHBOARD_TOKENS);

  // Data queries — all go through uebaService (task 7.8: no raw fetch/axios)
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

  // ── Drawer state (task 7.6: View Timeline opens View_Timeline_Drawer) ────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerUserId, setDrawerUserId] = useState('');
  const originatingRowRef = useRef<HTMLElement | null>(null);

  const openTimelineDrawer = useCallback((userId: string) => {
    setDrawerUserId(userId);
    setDrawerOpen(true);
    // Capture the currently focused element for focus return on close
    originatingRowRef.current = document.activeElement as HTMLElement | null;
  }, []);

  const closeTimelineDrawer = useCallback(() => {
    setDrawerOpen(false);
    // Return focus to the originating row (Req 6.7)
    if (originatingRowRef.current) {
      originatingRowRef.current.focus();
      originatingRowRef.current = null;
    }
  }, []);

  // A2-UEBA-02: prior window event had no listener; POST /ha-incidents requires alertList.
  // Guide analysts to Search & Hunt (?q=) for evidence collection.
  const [incidentGuidanceUserId, setIncidentGuidanceUserId] = useState<string | null>(null);

  const handleCreateIncident = useCallback((userId: string) => {
    setIncidentGuidanceUserId(userId);
  }, []);

  const dismissIncidentGuidance = useCallback(() => {
    setIncidentGuidanceUserId(null);
  }, []);

  // ── Bar chart: top high-risk users ────────────────────────────────────────
  const barChartOption = buildBarChartOption(
    riskScores ?? [],
    tokens['--ha-high'],
    tokens['--ha-medium'],
    tokens['--ha-text-secondary'],
  );

  // ── Line chart: 30-day risk trend ─────────────────────────────────────────
  const lineChartOption = buildLineChartOption(
    riskTrend ?? [],
    tokens['--ha-primary'],
    tokens['--ha-text-secondary'],
  );

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {(scoresError || trendError || countsError) && (
        <div
          role="alert"
          data-testid="ueba-risk-partial-error"
          style={{
            background: 'var(--ha-surface-raised)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            padding: '12px 16px',
            color: 'var(--ha-text-primary)',
            fontSize: 'var(--ha-text-base)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <span>
            <strong>Partial UEBA data unavailable.</strong> One or more risk panels failed to load.
            Available panels remain below.
          </span>
          <button
            type="button"
            onClick={() => {
              if (scoresError) void refetchScores();
              if (trendError) void refetchTrend();
              if (countsError) void refetchCounts();
            }}
            style={{
              background: 'transparent',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
              color: 'var(--ha-primary)',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 'var(--ha-text-sm)',
            }}
          >
            Retry
          </button>
        </div>
      )}
      {/* Top row: bar chart + trend line */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* High-risk users bar chart */}
        <div
          data-testid="risk-bar-chart-panel"
          style={{
            background: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: 8,
            padding: 16,
          }}
        >
          <h3 style={{ margin: '0 0 12px', color: 'var(--ha-text-primary)', fontSize: 'var(--ha-text-md)' }}>
            High-Risk Users
          </h3>
          {scoresError ? (
            <p style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)', margin: 0 }}>
              High-risk user scores could not be loaded.
            </p>
          ) : !scoresLoading && (riskScores?.length ?? 0) === 0 ? (
            <p style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)', margin: 0 }}>
              No high-risk users were returned for the current scope.
            </p>
          ) : (
            <HaChart
              option={barChartOption}
              height={260}
              loading={scoresLoading}
              ariaLabel="High-risk users horizontal bar chart"
            />
          )}
        </div>

        {/* 30-day risk trend */}
        <div
          data-testid="risk-trend-panel"
          style={{
            background: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: 8,
            padding: 16,
          }}
        >
          <h3 style={{ margin: '0 0 12px', color: 'var(--ha-text-primary)', fontSize: 'var(--ha-text-md)' }}>
            30-Day Risk Trend
          </h3>
          {trendError ? (
            <p style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)', margin: 0 }}>
              Risk trend could not be loaded.
            </p>
          ) : !trendLoading && (riskTrend?.length ?? 0) === 0 ? (
            <p style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)', margin: 0 }}>
              No risk-trend points were returned for the last 30 days.
            </p>
          ) : (
            <HaChart
              option={lineChartOption}
              height={260}
              loading={trendLoading}
              ariaLabel="30-day risk trend line chart"
            />
          )}
        </div>
      </div>

      {/* Middle: anomaly-count chips */}
      <AnomalyChips
        counts={anomalyCounts}
        loading={countsLoading}
        mediumColor={tokens['--ha-medium']}
        highColor={tokens['--ha-high']}
        criticalColor={tokens['--ha-critical']}
      />

      {/* Bottom: UserRiskTable */}
      <div data-testid="user-risk-table-panel">
        <UserRiskTable
          data={riskScores}
          isLoading={scoresLoading}
          onViewTimeline={openTimelineDrawer}
          onCreateIncident={handleCreateIncident}
        />
      </div>

      {/* View Timeline Drawer (task 7.6) */}
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
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface AnomalyChipsProps {
  counts: AnomalyCountsDTO | undefined;
  loading: boolean;
  mediumColor: string;
  highColor: string;
  criticalColor: string;
}

function AnomalyChips({ counts, loading, mediumColor, highColor, criticalColor }: AnomalyChipsProps): JSX.Element {
  if (loading || !counts) {
    return (
      <div data-testid="anomaly-chips-panel" style={{ display: 'flex', gap: 16 }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              padding: '12px 20px',
              borderRadius: 8,
              background: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              width: 140,
              height: 56,
            }}
          />
        ))}
      </div>
    );
  }

  const chips = [
    { testId: 'chip-tier10', label: '10-point', count: counts.tier10, color: mediumColor },
    { testId: 'chip-tier25', label: '25-point', count: counts.tier25, color: highColor },
    { testId: 'chip-tier50', label: '50-point', count: counts.tier50, color: criticalColor },
  ];

  return (
    <div data-testid="anomaly-chips-panel" style={{ display: 'flex', gap: 16 }}>
      {chips.map((chip) => (
        <div
          key={chip.testId}
          data-testid={chip.testId}
          style={{
            padding: '12px 20px',
            borderRadius: 8,
            backgroundColor: chip.color,
            border: `1px solid ${chip.color}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minWidth: 120,
          }}
        >
          <span style={{ fontSize: 'var(--ha-text-lg)', fontWeight: 700, color: 'var(--ha-text-primary)' }}>
            {chip.count}
          </span>
          <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
            {chip.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Chart builders ───────────────────────────────────────────────────────────

function buildBarChartOption(
  scores: UserRiskDTO[],
  highColor: string,
  mediumColor: string,
  axisColor: string,
) {
  // Sort descending, take top 10
  const sorted = [...scores].sort((a, b) => b.totalScore - a.totalScore).slice(0, 10);
  const maxScore = sorted.length > 0 ? sorted[0].totalScore : 100;
  const topDecileThreshold = maxScore * 0.9;

  return {
    tooltip: { trigger: 'axis' as const },
    grid: { left: '20%', right: '10%', top: '5%', bottom: '10%' },
    xAxis: {
      type: 'value' as const,
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: axisColor },
    },
    yAxis: {
      type: 'category' as const,
      data: sorted.map((s) => s.userId),
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: axisColor },
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
    grid: { left: '10%', right: '5%', top: '10%', bottom: '15%' },
    xAxis: {
      type: 'category' as const,
      data: trend.map((t) => t.day),
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: axisColor, rotate: 30 },
    },
    yAxis: {
      type: 'value' as const,
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: axisColor },
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
