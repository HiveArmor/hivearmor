/**
 * MsspOverviewPage — MSSP admin dashboard (Prompt 45 / Wave C3).
 *
 * Production reads: GET /api/ha-mssp/overview (MSSP_ADMIN-gated).
 * Displays four KPI cards, one ECharts bar chart (per-tenant EPS), and one
 * AG Grid tenants table. Supports four mutually exclusive render states:
 * loading, error, empty, and populated.
 *
 * Requirements: 7.1 – 7.12, 17.4, 17.5, 17.6, 17.7
 */

import type { ReactElement, ReactNode } from "react";

import { useQuery } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import type { EChartsOption } from "echarts";
import { LayoutDashboard } from "lucide-react";
import { Link } from "react-router-dom";

import { DownloadAggregateButton } from "./DownloadAggregateButton";
import {
  MSSP_OVERVIEW_JOB_SENTENCE,
  MSSP_ROUTES,
} from "./msspOverview.honesty";
import { fetchMsspOverview } from "../api/msspOverviewApi";
import type { MsspOverviewDTO, TenantHealthDTO } from "../api/msspTypes";

import { ErrorState } from "@/components/error-state/ErrorState";
import { HaChart } from "@/components/ha-chart/HaChart";
import { LoadingState } from "@/components/loading-state/LoadingState";
import { SiemDataGrid } from "@/components/siem-data-grid/SiemDataGrid";
import { ROUTES } from "@/constants/routes.constants";

import "./MsspOverviewPage.css";

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

function MsspOverviewHonestyHeader(): ReactElement {
  return (
    <header className="mssp-overview-header">
      <div className="mssp-overview-header__identity">
        <span className="mssp-overview-header__mark">
          <LayoutDashboard size={18} aria-hidden="true" />
        </span>
        <div className="mssp-overview-header__copy">
          <div className="mssp-overview-header__eyebrow">
            <span>MSSP PORTAL</span>
            <span className="mssp-overview-header__badge">STAGING CANDIDATE</span>
          </div>
          <h1>MSSP Overview</h1>
          <p className="mssp-overview-header__job">{MSSP_OVERVIEW_JOB_SENTENCE}</p>
          <p className="mssp-overview-page__projection-note" role="note">
            Inventory via GET /api/ha-mssp/overview (60s refresh). KPI totals reflect
            authorized managed tenants only — zero tenants is a valid empty state, not an
            error. Aggregate XLSX export via GET /api/ha-mssp/reports/aggregate remains
            MSSP_ADMIN-gated.
          </p>
        </div>
      </div>
      <div className="mssp-overview-header__actions">
        <DownloadAggregateButton />
      </div>
    </header>
  );
}

function MsspOverviewMeta(): ReactElement {
  return (
    <p className="mssp-overview-page__meta">
      <Link to={MSSP_ROUTES.TENANTS}>Tenants</Link>
      <span aria-hidden="true">·</span>
      <Link to={MSSP_ROUTES.NEW_TENANT}>New tenant</Link>
      <span aria-hidden="true">·</span>
      <Link to={ROUTES.ADMIN_TENANTS}>Platform Tenants</Link>
      <span aria-hidden="true">·</span>
      <Link to={ROUTES.DASHBOARD}>Mission Control</Link>
      <span aria-hidden="true">·</span>
      <span className="mssp-overview-page__access">MSSP Administrator</span>
    </p>
  );
}

function MsspOverviewShell({
  testId,
  children,
  showEmptyHonesty = false,
}: {
  testId: string;
  children: ReactNode;
  showEmptyHonesty?: boolean;
}): ReactElement {
  return (
    <section
      className="mssp-overview-page"
      aria-label="MSSP Overview"
      data-mssp-overview-honesty="true"
      data-testid={testId}
    >
      <MsspOverviewHonestyHeader />
      <MsspOverviewMeta />
      {showEmptyHonesty && (
        <div
          className="mssp-overview-empty-honesty"
          role="status"
          data-testid="mssp-overview-empty-honesty"
        >
          <strong>No managed tenants in authorized inventory.</strong>
          <span>
            An empty overview does not imply platform failure — create a tenant on New tenant
            when ready, or open Platform Tenants for platform-scoped inventory. Mission Control
            remains available for triage widgets.
          </span>
          <span className="mssp-overview-empty-honesty__links">
            <Link to={MSSP_ROUTES.NEW_TENANT}>Create tenant</Link>
            <Link to={MSSP_ROUTES.TENANTS}>Open Tenants</Link>
          </span>
        </div>
      )}
      <div className="mssp-overview-page__body">{children}</div>
    </section>
  );
}

interface KpiCardProps {
  label: string;
  value: number;
}

function KpiCard({ label, value }: KpiCardProps): ReactElement {
  return (
    <div className="mssp-overview-kpi-card">
      <span className="mssp-overview-kpi-card__label">{label}</span>
      <span className="mssp-overview-kpi-card__value">{value.toLocaleString()}</span>
    </div>
  );
}

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

function KpiCardRow({ data }: { data: MsspOverviewDTO }): ReactElement {
  return (
    <div className="mssp-overview-kpi-row">
      <KpiCard label="Managed Tenants" value={data.tenantCount} />
      <KpiCard label="Active Users" value={data.activeUserCount} />
      <KpiCard label="Total EPS" value={data.totalEps} />
      <KpiCard label="Alerts Today" value={data.alertsToday} />
    </div>
  );
}

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

export function MsspOverviewPage(): ReactElement {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["mssp", "overview"] as const,
    queryFn: fetchMsspOverview,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <MsspOverviewShell testId="mssp-overview-loading">
        <LoadingState message="Loading MSSP overview…" />
      </MsspOverviewShell>
    );
  }

  if (isError || !data) {
    return (
      <MsspOverviewShell testId="mssp-overview-error">
        <ErrorState
          title="Could not load MSSP overview"
          message="An error occurred while fetching dashboard data from GET /api/ha-mssp/overview. This is a transport or authorization failure — not an empty tenant inventory."
          onRetry={() => void refetch()}
        />
      </MsspOverviewShell>
    );
  }

  const isEmpty = data.tenants.length === 0;

  if (isEmpty) {
    return (
      <MsspOverviewShell testId="mssp-overview-empty" showEmptyHonesty>
        <KpiCardRow data={data} />
      </MsspOverviewShell>
    );
  }

  return (
    <MsspOverviewShell testId="mssp-overview-populated">
      <KpiCardRow data={data} />

      <div className="mssp-overview-chart-panel">
        <h2>EPS by Tenant</h2>
        <HaChart
          option={buildBarChartOption(data)}
          height={260}
          ariaLabel="Bar chart showing events per second by managed tenant"
        />
      </div>

      <div className="mssp-overview-grid-panel">
        <SiemDataGrid
          columnDefs={TENANTS_COLUMN_DEFS}
          rowData={data.tenants as TenantHealthDTO[]}
          height="100%"
          defaultColDef={{ resizable: true, sortable: true }}
        />
      </div>
    </MsspOverviewShell>
  );
}
