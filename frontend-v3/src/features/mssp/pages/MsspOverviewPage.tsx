/**
 * MsspOverviewPage — MSSP admin dashboard.
 *
 * Displays four KPI cards, one ECharts bar chart (per-tenant EPS), and one
 * AG Grid tenants table. Supports four mutually exclusive render states:
 * loading, error, empty, and populated.
 *
 * Requirements: 7.1 – 7.12, 17.4, 17.5, 17.6, 17.7
 */

import type { ReactElement } from "react";

import { useQuery } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import type { EChartsOption } from "echarts";

import { DownloadAggregateButton } from "./DownloadAggregateButton";
import { fetchMsspOverview } from "../api/msspOverviewApi";
import type { MsspOverviewDTO, TenantHealthDTO } from "../api/msspTypes";

import { ErrorState } from "@/components/error-state/ErrorState";
import { HaChart } from "@/components/ha-chart/HaChart";
import { LoadingState } from "@/components/loading-state/LoadingState";
import { SiemDataGrid } from "@/components/siem-data-grid/SiemDataGrid";


// ---------------------------------------------------------------------------
// Color palette — read from CSS custom properties at render time so that
// theme overrides are reflected without a page reload.
// No hex literal appears anywhere in this file.
// ---------------------------------------------------------------------------

function readPalette(): readonly string[] {
  const style = window.getComputedStyle(document.documentElement);
  return [
    style.getPropertyValue("--ha-primary").trim(),
    style.getPropertyValue("--ha-intelligence").trim(),
    style.getPropertyValue("--ha-critical").trim(),
    style.getPropertyValue("--ha-high").trim(),
    style.getPropertyValue("--ha-medium").trim(),
    style.getPropertyValue("--ha-positive").trim(),
  ];
}

// ---------------------------------------------------------------------------
// KPI card — inline component; no external dependency.
// Styled exclusively with design tokens.
// ---------------------------------------------------------------------------

interface KpiCardProps {
  label: string;
  value: number;
}

function KpiCard({ label, value }: KpiCardProps): ReactElement {
  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: "160px",
        background: "var(--ha-surface-primary)",
        border: "1px solid var(--ha-border)",
        borderRadius: "var(--ha-radius-base)",
        padding: "var(--ha-space-4)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--ha-space-1)",
      }}
    >
      <span
        style={{
          fontSize: "var(--ha-text-sm)",
          color: "var(--ha-text-secondary)",
          textAlign: "center",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "var(--ha-text-2xl)",
          fontWeight: "var(--ha-weight-semibold)",
          color: "var(--ha-text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value.toLocaleString()}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column definitions for the tenants data grid
// ---------------------------------------------------------------------------

const TENANTS_COLUMN_DEFS: ColDef<TenantHealthDTO>[] = [
  { headerName: "Name", field: "name", flex: 2, sortable: true, filter: true },
  {
    headerName: "Client Prefix",
    field: "clientPrefix",
    flex: 1,
    sortable: true,
    filter: true,
  },
  {
    headerName: "Users",
    field: "userCount",
    flex: 1,
    sortable: true,
    type: "numericColumn",
  },
  {
    headerName: "EPS",
    field: "eps",
    flex: 1,
    sortable: true,
    type: "numericColumn",
  },
  {
    headerName: "Health",
    field: "healthStatus",
    flex: 1,
    sortable: true,
    filter: true,
  },
  {
    headerName: "Last Event",
    field: "lastEventAt",
    flex: 2,
    sortable: true,
    valueFormatter: (params) => {
      if (!params.value) return "—";
      return new Date(params.value as string).toLocaleString();
    },
  },
];

// ---------------------------------------------------------------------------
// KPI card row — extracted so it can be reused in both empty and populated branches
// ---------------------------------------------------------------------------

function KpiCardRow({ data }: { data: MsspOverviewDTO }): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        gap: "var(--ha-space-4)",
        flexWrap: "wrap",
        marginBottom: "var(--ha-space-6)",
      }}
    >
      <KpiCard label="Managed Tenants" value={data.tenantCount} />
      <KpiCard label="Active Users" value={data.activeUserCount} />
      <KpiCard label="Total EPS" value={data.totalEps} />
      <KpiCard label="Alerts Today" value={data.alertsToday} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ECharts bar chart option builder
// ---------------------------------------------------------------------------

function buildBarChartOption(data: MsspOverviewDTO): EChartsOption {
  const palette = readPalette();

  return {
    backgroundColor: "transparent",
    color: palette as string[],
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
    },
    grid: {
      top: 16,
      right: 16,
      bottom: 32,
      left: 56,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: data.tenants.map((t) => t.name),
      axisLabel: {
        color: "var(--ha-text-secondary)",
        rotate: data.tenants.length > 6 ? 30 : 0,
      },
      axisLine: { lineStyle: { color: "var(--ha-border)" } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "var(--ha-text-secondary)" },
      splitLine: { lineStyle: { color: "var(--ha-border)", opacity: 0.4 } },
    },
    series: [
      {
        name: "EPS",
        type: "bar",
        data: data.tenants.map((t) => t.eps),
        itemStyle: { color: palette[0] ?? "var(--ha-primary)" },
        emphasis: {
          itemStyle: { color: palette[1] ?? "var(--ha-intelligence)" },
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function MsspOverviewPage(): ReactElement {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["mssp", "overview"] as const,
    queryFn: fetchMsspOverview,
    refetchInterval: 60_000,
  });

  // ── Loading branch ─────────────────────────────────────────────────────────
  // NO KPI cards, NO chart, NO grid.
  if (isLoading) {
    return (
      <div
        data-testid="mssp-overview-loading"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: "var(--ha-space-6)",
        }}
      >
        <LoadingState message="Loading MSSP overview…" />
      </div>
    );
  }

  // ── Error branch ───────────────────────────────────────────────────────────
  // NO KPI cards, NO chart, NO grid.
  if (isError || !data) {
    return (
      <div
        data-testid="mssp-overview-error"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: "var(--ha-space-6)",
        }}
      >
        <ErrorState
          title="Could not load MSSP overview"
          message="An error occurred while fetching the dashboard data."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const isEmpty = data.tenants.length === 0;

  // ── Empty branch ───────────────────────────────────────────────────────────
  // 4 KPI cards + "No managed tenants yet". NO chart. NO grid.
  if (isEmpty) {
    return (
      <div
        data-testid="mssp-overview-empty"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: "var(--ha-space-6)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "var(--ha-space-4)",
          }}
        >
          <h1
            style={{
              fontSize: "var(--ha-text-xl)",
              fontWeight: "var(--ha-weight-semibold)",
              color: "var(--ha-text-primary)",
              margin: 0,
            }}
          >
            MSSP Overview
          </h1>
          <DownloadAggregateButton />
        </div>

        <KpiCardRow data={data} />

        <p
          style={{
            color: "var(--ha-text-secondary)",
            fontSize: "var(--ha-text-sm)",
            textAlign: "center",
            marginTop: "var(--ha-space-6)",
          }}
        >
          No managed tenants yet
        </p>
      </div>
    );
  }

  // ── Populated branch ───────────────────────────────────────────────────────
  // 4 KPI cards + bar chart + data grid.
  return (
    <div
      data-testid="mssp-overview-populated"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "var(--ha-space-6)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--ha-space-4)",
        }}
      >
        <h1
          style={{
            fontSize: "var(--ha-text-xl)",
            fontWeight: "var(--ha-weight-semibold)",
            color: "var(--ha-text-primary)",
            margin: 0,
          }}
        >
          MSSP Overview
        </h1>
        <DownloadAggregateButton />
      </div>

      <KpiCardRow data={data} />

      {/* EPS bar chart */}
      <div
        style={{
          background: "var(--ha-surface-primary)",
          border: "1px solid var(--ha-border)",
          borderRadius: "var(--ha-radius-base)",
          padding: "var(--ha-space-4)",
          marginBottom: "var(--ha-space-6)",
        }}
      >
        <h2
          style={{
            fontSize: "var(--ha-text-sm)",
            color: "var(--ha-text-secondary)",
            marginBottom: "var(--ha-space-3)",
          }}
        >
          EPS by Tenant
        </h2>
        <HaChart
          option={buildBarChartOption(data)}
          height={260}
          ariaLabel="Bar chart showing events per second by managed tenant"
        />
      </div>

      {/* Tenants grid */}
      <div
        style={{
          flex: 1,
          background: "var(--ha-surface-primary)",
          border: "1px solid var(--ha-border)",
          borderRadius: "var(--ha-radius-base)",
          overflow: "hidden",
          minHeight: "300px",
        }}
      >
        <SiemDataGrid
          columnDefs={TENANTS_COLUMN_DEFS}
          rowData={data.tenants as TenantHealthDTO[]}
          height="100%"
          defaultColDef={{ resizable: true, sortable: true }}
        />
      </div>
    </div>
  );
}
