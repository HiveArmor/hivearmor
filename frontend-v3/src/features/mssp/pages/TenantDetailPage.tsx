/**
 * TenantDetailPage — MSSP tenant workspace honesty (Prompt 48 / Wave C3 slice 4).
 *
 * Production detail: GET /api/ha-mssp/tenants/{id}; metadata updates via PUT.
 * Membership and tenant-scoped roles live on Users; platform tenant boundaries on
 * Identity & Tenancy — lifecycle governance and delegated audit remain fail-closed (IAM-005).
 */

import type { ReactElement } from "react";
import { useState } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EChartsOption } from "echarts";
import { Building2, CircleSlash2, RefreshCw, ShieldCheck } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { fetchTenantDetail, updateTenant } from "../api/msspTenantApi";
import type { UpdateTenantRequest } from "../api/msspTypes";
import { useMsspNavStore } from "../store/msspNavStore";

import { HaChart } from "@/components/ha-chart/HaChart";
import { LoadingState } from "@/components/loading-state/LoadingState";
import { ROUTES } from "@/constants/routes.constants";

import "./TenantDetailPage.css";

/** Bundle-visible job sentence — delegated tenant workspace, not inventory list or membership admin. */
export const TENANT_DETAIL_JOB_SENTENCE =
  "MSSP tenant workspace — inspect observability and metadata for one delegated customer tenant authorized for MSSP Administrators. Tenant inventory stays on Tenants; membership and tenant-scoped roles live on Users; platform tenant boundaries on Identity & Tenancy — client prefix is immutable after provision; suspension, delegation scope, and immutable audit remain fail-closed until IAM contracts land.";

function buildSparklineOption(data: readonly number[]): EChartsOption {
  const style = window.getComputedStyle(document.documentElement);
  const primary = style.getPropertyValue("--ha-primary").trim();

  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    grid: { top: 8, right: 8, bottom: 24, left: 40, containLabel: true },
    xAxis: {
      type: "category",
      boundaryGap: false,
      axisLabel: { color: "var(--ha-text-secondary)", fontSize: 10 },
      axisLine: { lineStyle: { color: "var(--ha-border)" } },
      data: data.map((_, i) => `-${data.length - i}m`),
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "var(--ha-text-secondary)" },
      splitLine: { lineStyle: { color: "var(--ha-border)", opacity: 0.4 } },
    },
    series: [
      {
        name: "EPS",
        type: "line",
        data: data as number[],
        lineStyle: { color: primary || "var(--ha-primary)" },
        itemStyle: { color: primary || "var(--ha-primary)" },
        areaStyle: { opacity: 0.15 },
        smooth: true,
        showSymbol: false,
      },
    ],
  };
}

function buildTrendOption(
  data: readonly number[],
  labels: readonly string[],
): EChartsOption {
  const style = window.getComputedStyle(document.documentElement);
  const medium = style.getPropertyValue("--ha-medium").trim();

  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { top: 8, right: 8, bottom: 32, left: 40, containLabel: true },
    xAxis: {
      type: "category",
      data: labels as string[],
      axisLabel: { color: "var(--ha-text-secondary)", fontSize: 10, rotate: 30 },
      axisLine: { lineStyle: { color: "var(--ha-border)" } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "var(--ha-text-secondary)" },
      splitLine: { lineStyle: { color: "var(--ha-border)", opacity: 0.4 } },
    },
    series: [
      {
        name: "Alerts",
        type: "bar",
        data: data as number[],
        itemStyle: { color: medium || "var(--ha-medium)" },
      },
    ],
  };
}

function last7DayLabels(): string[] {
  const labels: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i - 1),
    );
    labels.push(d.toISOString().slice(0, 10));
  }
  return labels;
}

interface PageHeaderProps {
  title: string;
  onRefresh?: () => void;
}

function PageHeader({ title, onRefresh }: PageHeaderProps): ReactElement {
  return (
    <header className="mssp-tenant-detail-header">
      <div className="mssp-tenant-detail-header__identity">
        <span className="mssp-tenant-detail-header__mark">
          <Building2 size={18} aria-hidden="true" />
        </span>
        <div className="mssp-tenant-detail-header__copy">
          <div className="mssp-tenant-detail-header__eyebrow">
            <span>MSSP PORTAL · TENANT WORKSPACE</span>
            <span className="mssp-tenant-detail-header__badge">STAGING CANDIDATE</span>
          </div>
          <h1>{title}</h1>
          <p className="mssp-tenant-detail-header__job">{TENANT_DETAIL_JOB_SENTENCE}</p>
          <p className="mssp-tenant-detail-page__projection-note" role="note">
            Detail via GET /api/ha-mssp/tenants/&#123;id&#125;. EPS sparkline and 7-day alert trend
            are observability projections — not SLO pass/fail. Metadata edits use PUT (name, licence,
            contact, max users); client prefix is immutable. Membership and tenant-scoped roles are
            partial on Users (IAM-005).
          </p>
        </div>
      </div>
      {onRefresh && (
        <div className="mssp-tenant-detail-header__actions">
          <button
            className="mssp-tenant-detail-icon-button"
            type="button"
            aria-label="Refresh tenant workspace"
            onClick={onRefresh}
          >
            <RefreshCw size={13} />
          </button>
        </div>
      )}
    </header>
  );
}

function MetaLinks({ tenantId }: { tenantId?: string }): ReactElement {
  const usersPath = tenantId ? `/mssp/tenants/${tenantId}/users` : "/mssp/tenants";

  return (
    <p className="mssp-tenant-detail-page__meta">
      <Link to="/mssp/overview">Overview</Link>
      <span aria-hidden="true">·</span>
      <Link to="/mssp/tenants">Tenants</Link>
      <span aria-hidden="true">·</span>
      <Link to={usersPath}>Users</Link>
      <span aria-hidden="true">·</span>
      <Link to={ROUTES.ADMIN_TENANTS}>Platform tenants</Link>
      <span aria-hidden="true">·</span>
      <Link to={ROUTES.ADMIN_USERS}>Identity &amp; Tenancy</Link>
      <span aria-hidden="true">·</span>
      <span className="mssp-tenant-detail-page__access">MSSP Administrator</span>
    </p>
  );
}

function TrustBanner(): ReactElement {
  return (
    <div className="mssp-tenant-detail-trust" data-testid="tenant-detail-trust-banner">
      <ShieldCheck size={13} aria-hidden="true" />
      <span>
        <strong>Workspace fail-closed:</strong> HTTP 404 means the tenant is not MSSP-managed or
        missing; 401/403 means MSSP Administrator is required — never conflated. Charts reflect
        authorized projections only; they do not prove customer health or contractual uptime.
      </span>
    </div>
  );
}

interface EditFormState {
  name: string;
  maxUsers: number;
  licenceType: string;
  contactEmail: string;
}

interface EditFormProps {
  tenantId: string;
  initial: EditFormState;
  onClose: () => void;
}

function EditForm({ tenantId, initial, onClose }: EditFormProps): ReactElement {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EditFormState>(initial);
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: UpdateTenantRequest) => updateTenant(tenantId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["mssp", "tenant", tenantId],
      });
      onClose();
    },
    onError: () => {
      setFormError("Update failed. PUT /api/ha-mssp/tenants/{id} rejected the change.");
    },
  });

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setFormError(null);
    mutation.mutate({
      name: form.name,
      maxUsers: form.maxUsers,
      licenceType: form.licenceType,
      contactEmail: form.contactEmail,
    });
  }

  return (
    <form className="mssp-tenant-detail-edit" onSubmit={handleSubmit}>
      <h3>Edit tenant metadata</h3>
      <p className="mssp-tenant-detail-page__projection-note" role="note">
        Client prefix cannot be changed after provision. Membership and tenant roles are managed on
        Users — not here.
      </p>

      {formError && <p className="mssp-tenant-detail-edit__error">{formError}</p>}

      <label>
        <span>Name</span>
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </label>

      <label>
        <span>Max Users</span>
        <input
          type="number"
          value={form.maxUsers}
          onChange={(e) =>
            setForm((f) => ({ ...f, maxUsers: parseInt(e.target.value, 10) || 0 }))
          }
        />
      </label>

      <label>
        <span>Licence Type</span>
        <input
          value={form.licenceType}
          onChange={(e) => setForm((f) => ({ ...f, licenceType: e.target.value }))}
        />
      </label>

      <label>
        <span>Contact Email</span>
        <input
          type="email"
          value={form.contactEmail}
          onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
        />
      </label>

      <div className="mssp-tenant-detail-edit__actions">
        <button
          className="mssp-tenant-detail-button mssp-tenant-detail-button--secondary"
          type="button"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="mssp-tenant-detail-button mssp-tenant-detail-button--primary"
          type="submit"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

export function TenantDetailPage(): ReactElement {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [editOpen, setEditOpen] = useState(false);

  const setLastTenantId = useMsspNavStore((s) => s.setLastTenantId);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["mssp", "tenant", tenantId ?? ""] as const,
    queryFn: () => fetchTenantDetail(tenantId ?? ""),
    enabled: Boolean(tenantId),
  });

  if (data && tenantId) {
    setLastTenantId(tenantId);
  }

  const handleRefresh = (): void => {
    void refetch();
  };

  const status = error instanceof Error ? error.message : "";
  const isAuth = status === "401" || status === "403";
  const is404 = isError && status === "404";
  const headerTitle = data?.name ?? "Tenant workspace";

  if (isLoading) {
    return (
      <section
        className="mssp-tenant-detail-page"
        aria-label="MSSP tenant workspace"
        data-testid="tenant-detail-loading"
      >
        <PageHeader title="Tenant workspace" onRefresh={handleRefresh} />
        <MetaLinks tenantId={tenantId} />
        <TrustBanner />
        <div className="mssp-tenant-detail-loading">
          <LoadingState message="Loading tenant workspace…" />
        </div>
      </section>
    );
  }

  if (is404) {
    return (
      <section
        className="mssp-tenant-detail-page"
        aria-label="MSSP tenant workspace"
        data-testid="tenant-detail-notfound"
      >
        <PageHeader title="Tenant workspace" onRefresh={handleRefresh} />
        <MetaLinks tenantId={tenantId} />
        <div className="mssp-tenant-detail-empty" role="status">
          <strong>Tenant not found</strong>
          <span>
            The requested tenant does not exist or is not MSSP-managed. HTTP 404 is distinct from
            authorization failure.
          </span>
          <button
            className="mssp-tenant-detail-button mssp-tenant-detail-button--secondary"
            type="button"
            onClick={handleRefresh}
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (isAuth) {
    return (
      <section
        className="mssp-tenant-detail-page"
        aria-label="MSSP tenant workspace"
        data-testid="tenant-detail-error"
      >
        <PageHeader title="Tenant workspace" onRefresh={handleRefresh} />
        <MetaLinks tenantId={tenantId} />
        <div className="mssp-tenant-detail-empty" role="status">
          <CircleSlash2 size={30} />
          <strong>MSSP access restricted</strong>
          <span>
            Required permission: MSSP Administrator. Sign in again or ask an administrator for
            access.
          </span>
        </div>
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section
        className="mssp-tenant-detail-page"
        aria-label="MSSP tenant workspace"
        data-testid="tenant-detail-error"
      >
        <PageHeader title="Tenant workspace" onRefresh={handleRefresh} />
        <MetaLinks tenantId={tenantId} />
        <TrustBanner />
        <div className="mssp-tenant-detail-empty mssp-tenant-detail-empty--error" role="status">
          <strong>Tenant workspace unavailable</strong>
          <span>
            GET /api/ha-mssp/tenants/&#123;id&#125; failed. Retry or return to the tenants list.
          </span>
          <button
            className="mssp-tenant-detail-button mssp-tenant-detail-button--secondary"
            type="button"
            onClick={handleRefresh}
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  const trendLabels = last7DayLabels();

  return (
    <section
      className="mssp-tenant-detail-page"
      aria-label="MSSP tenant workspace"
      data-testid="tenant-detail-populated"
    >
      <PageHeader title={headerTitle} onRefresh={handleRefresh} />
      <MetaLinks tenantId={tenantId} />
      <TrustBanner />

      <div className="mssp-tenant-detail-workspace">
        <div className="mssp-tenant-detail-header__actions" style={{ justifyContent: "flex-end" }}>
          <button
            className="mssp-tenant-detail-button mssp-tenant-detail-button--secondary"
            type="button"
            onClick={() => setEditOpen((open) => !open)}
          >
            {editOpen ? "Close edit" : "Edit metadata"}
          </button>
          <Link
            className="mssp-tenant-detail-button mssp-tenant-detail-button--primary"
            to={`/mssp/tenants/${tenantId}/users`}
            style={{ textDecoration: "none" }}
          >
            Manage users
          </Link>
        </div>

        <div className="mssp-tenant-detail-meta-row">
          {(
            [
              ["Client Prefix", data.clientPrefix],
              ["Max Users", String(data.maxUsers)],
              ["Licence Type", data.licenceType],
              ["Contact Email", data.contactEmail ?? "—"],
              ["Active Users", String(data.userCount)],
              ["EPS", String(data.eps)],
            ] as [string, string][]
          ).map(([label, value]) => (
            <div key={label} className="mssp-tenant-detail-stat">
              <div className="mssp-tenant-detail-stat__label">{label}</div>
              <div className="mssp-tenant-detail-stat__value">{value}</div>
            </div>
          ))}
        </div>

        {editOpen && (
          <EditForm
            tenantId={tenantId ?? ""}
            initial={{
              name: data.name,
              maxUsers: data.maxUsers,
              licenceType: data.licenceType,
              contactEmail: data.contactEmail ?? "",
            }}
            onClose={() => setEditOpen(false)}
          />
        )}

        <div className="mssp-tenant-detail-chart">
          <h2>EPS — Last 60 Minutes</h2>
          <HaChart
            option={buildSparklineOption(data.epsSparkline)}
            height={200}
            ariaLabel="Line chart showing events per second over the last 60 minutes"
          />
        </div>

        <div className="mssp-tenant-detail-chart">
          <h2>Alerts — Last 7 Days</h2>
          <HaChart
            option={buildTrendOption(data.alertsTrend7d, trendLabels)}
            height={200}
            ariaLabel="Bar chart showing alert counts for the last 7 days"
          />
        </div>
      </div>
    </section>
  );
}
