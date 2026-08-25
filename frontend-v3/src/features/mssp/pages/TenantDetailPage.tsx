/**
 * TenantDetailPage — detail view for a single MSSP-managed tenant.
 *
 * Renders three mutually exclusive page-state branches:
 *   loading    — initial fetch in progress
 *   not-found  — backend returned 404 (or tenant is not mssp_managed)
 *   populated  — data arrived; shows sparkline chart, 7-day trend chart,
 *                read-only metadata, and an inline edit form
 *
 * Requirements: 13.1 – 13.9
 */

import type { ReactElement } from "react";
import { useState } from "react";


import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EChartsOption } from "echarts";
import { useParams } from "react-router-dom";

import { fetchTenantDetail, updateTenant } from "../api/msspTenantApi";
import type { UpdateTenantRequest } from "../api/msspTypes";
import { useMsspNavStore } from "../store/msspNavStore";

import { HaChart } from "@/components/ha-chart/HaChart";
import { LoadingState } from "@/components/loading-state/LoadingState";

// ---------------------------------------------------------------------------
// Chart option builders
// ---------------------------------------------------------------------------

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

/** Generate the last-7-day ISO date labels (ending yesterday UTC). */
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

// ---------------------------------------------------------------------------
// Inline edit form
// ---------------------------------------------------------------------------

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
      setFormError("Update failed. Please try again.");
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
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--ha-space-3)",
        background: "var(--ha-surface-primary)",
        border: "1px solid var(--ha-border)",
        borderRadius: "var(--ha-radius-base)",
        padding: "var(--ha-space-4)",
        marginTop: "var(--ha-space-4)",
      }}
    >
      <h3
        style={{
          fontSize: "var(--ha-text-base)",
          fontWeight: "var(--ha-weight-semibold)",
          color: "var(--ha-text-primary)",
          marginBottom: "var(--ha-space-2)",
        }}
      >
        Edit Tenant
      </h3>

      {formError && (
        <p style={{ color: "var(--ha-critical)", fontSize: "var(--ha-text-sm)" }}>
          {formError}
        </p>
      )}

      <label style={{ display: "flex", flexDirection: "column", gap: "var(--ha-space-1)" }}>
        <span style={{ fontSize: "var(--ha-text-sm)", color: "var(--ha-text-secondary)" }}>
          Name
        </span>
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          style={{
            background: "var(--ha-surface-raised)",
            border: "1px solid var(--ha-border)",
            borderRadius: "var(--ha-radius-base)",
            color: "var(--ha-text-primary)",
            padding: "var(--ha-space-2) var(--ha-space-3)",
            fontSize: "var(--ha-text-sm)",
          }}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: "var(--ha-space-1)" }}>
        <span style={{ fontSize: "var(--ha-text-sm)", color: "var(--ha-text-secondary)" }}>
          Max Users
        </span>
        <input
          type="number"
          value={form.maxUsers}
          onChange={(e) =>
            setForm((f) => ({ ...f, maxUsers: parseInt(e.target.value, 10) || 0 }))
          }
          style={{
            background: "var(--ha-surface-raised)",
            border: "1px solid var(--ha-border)",
            borderRadius: "var(--ha-radius-base)",
            color: "var(--ha-text-primary)",
            padding: "var(--ha-space-2) var(--ha-space-3)",
            fontSize: "var(--ha-text-sm)",
          }}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: "var(--ha-space-1)" }}>
        <span style={{ fontSize: "var(--ha-text-sm)", color: "var(--ha-text-secondary)" }}>
          Licence Type
        </span>
        <input
          value={form.licenceType}
          onChange={(e) => setForm((f) => ({ ...f, licenceType: e.target.value }))}
          style={{
            background: "var(--ha-surface-raised)",
            border: "1px solid var(--ha-border)",
            borderRadius: "var(--ha-radius-base)",
            color: "var(--ha-text-primary)",
            padding: "var(--ha-space-2) var(--ha-space-3)",
            fontSize: "var(--ha-text-sm)",
          }}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: "var(--ha-space-1)" }}>
        <span style={{ fontSize: "var(--ha-text-sm)", color: "var(--ha-text-secondary)" }}>
          Contact Email
        </span>
        <input
          type="email"
          value={form.contactEmail}
          onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
          style={{
            background: "var(--ha-surface-raised)",
            border: "1px solid var(--ha-border)",
            borderRadius: "var(--ha-radius-base)",
            color: "var(--ha-text-primary)",
            padding: "var(--ha-space-2) var(--ha-space-3)",
            fontSize: "var(--ha-text-sm)",
          }}
        />
      </label>

      <div style={{ display: "flex", gap: "var(--ha-space-3)", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "var(--ha-space-2) var(--ha-space-4)",
            fontSize: "var(--ha-text-sm)",
            borderRadius: "var(--ha-radius-base)",
            border: "1px solid var(--ha-border)",
            background: "var(--ha-surface-raised)",
            color: "var(--ha-text-primary)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          style={{
            padding: "var(--ha-space-2) var(--ha-space-4)",
            fontSize: "var(--ha-text-sm)",
            fontWeight: "var(--ha-weight-medium)",
            borderRadius: "var(--ha-radius-base)",
            border: "none",
            background: "var(--ha-primary)",
            color: "var(--ha-background)",
            cursor: mutation.isPending ? "not-allowed" : "pointer",
            opacity: mutation.isPending ? 0.7 : 1,
          }}
        >
          {mutation.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function TenantDetailPage(): ReactElement {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [editOpen, setEditOpen] = useState(false);

  const setLastTenantId = useMsspNavStore((s) => s.setLastTenantId);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["mssp", "tenant", tenantId ?? ""] as const,
    queryFn: () => fetchTenantDetail(tenantId ?? ""),
    enabled: Boolean(tenantId),
  });

  // Track the last-visited tenant id for sidebar dynamic links
  if (data && tenantId) {
    setLastTenantId(tenantId);
  }

  // ── Loading branch ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        data-testid="tenant-detail-loading"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: "var(--ha-space-6)",
        }}
      >
        <LoadingState message="Loading tenant details…" />
      </div>
    );
  }

  // ── Not-found branch (HTTP 404 only) ───────────────────────────────────────
  const is404 =
    isError &&
    error instanceof Error &&
    error.message === "404";

  if (is404) {
    return (
      <div
        data-testid="tenant-detail-notfound"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "var(--ha-space-6)",
        }}
      >
        <h2
          style={{
            fontSize: "var(--ha-text-xl)",
            fontWeight: "var(--ha-weight-semibold)",
            color: "var(--ha-text-primary)",
            marginBottom: "var(--ha-space-2)",
          }}
        >
          Tenant not found
        </h2>
        <p
          style={{
            fontSize: "var(--ha-text-sm)",
            color: "var(--ha-text-secondary)",
            textAlign: "center",
          }}
        >
          The requested tenant does not exist or is not MSSP-managed.
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          style={{
            marginTop: "var(--ha-space-4)",
            padding: "var(--ha-space-2) var(--ha-space-4)",
            fontSize: "var(--ha-text-sm)",
            borderRadius: "var(--ha-radius-base)",
            border: "1px solid var(--ha-border)",
            background: "var(--ha-surface-raised)",
            color: "var(--ha-text-primary)",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Auth / generic error branch ────────────────────────────────────────────
  if (isError || !data) {
    const status = error instanceof Error ? error.message : "";
    const isAuth = status === "401" || status === "403";
    return (
      <div
        data-testid="tenant-detail-error"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "var(--ha-space-6)",
        }}
      >
        <h2
          style={{
            fontSize: "var(--ha-text-xl)",
            fontWeight: "var(--ha-weight-semibold)",
            color: "var(--ha-text-primary)",
            marginBottom: "var(--ha-space-2)",
          }}
        >
          {isAuth ? "MSSP access restricted" : "Tenant details unavailable"}
        </h2>
        <p
          style={{
            fontSize: "var(--ha-text-sm)",
            color: "var(--ha-text-secondary)",
            textAlign: "center",
          }}
        >
          {isAuth
            ? "Required permission: MSSP Administrator. Sign in again or ask an administrator for access."
            : "The tenant could not be loaded. Retry or return to the tenants list."}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          style={{
            marginTop: "var(--ha-space-4)",
            padding: "var(--ha-space-2) var(--ha-space-4)",
            fontSize: "var(--ha-text-sm)",
            borderRadius: "var(--ha-radius-base)",
            border: "1px solid var(--ha-border)",
            background: "var(--ha-surface-raised)",
            color: "var(--ha-text-primary)",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Populated branch ───────────────────────────────────────────────────────
  const trendLabels = last7DayLabels();

  return (
    <div
      data-testid="tenant-detail-populated"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "var(--ha-space-6)",
      }}
    >
      {/* Header */}
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
          }}
        >
          {data.name}
        </h1>
        <button
          type="button"
          onClick={() => setEditOpen((open) => !open)}
          style={{
            padding: "var(--ha-space-2) var(--ha-space-4)",
            fontSize: "var(--ha-text-sm)",
            fontWeight: "var(--ha-weight-medium)",
            borderRadius: "var(--ha-radius-base)",
            border: "1px solid var(--ha-border)",
            background: "var(--ha-surface-raised)",
            color: "var(--ha-text-primary)",
            cursor: "pointer",
          }}
        >
          {editOpen ? "Close" : "Edit"}
        </button>
      </div>

      {/* Metadata row */}
      <div
        style={{
          display: "flex",
          gap: "var(--ha-space-6)",
          flexWrap: "wrap",
          marginBottom: "var(--ha-space-6)",
        }}
      >
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
          <div
            key={label}
            style={{
              minWidth: "120px",
              background: "var(--ha-surface-primary)",
              border: "1px solid var(--ha-border)",
              borderRadius: "var(--ha-radius-base)",
              padding: "var(--ha-space-3)",
            }}
          >
            <div
              style={{
                fontSize: "var(--ha-text-xs)",
                color: "var(--ha-text-secondary)",
                marginBottom: "var(--ha-space-1)",
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontSize: "var(--ha-text-base)",
                fontWeight: "var(--ha-weight-semibold)",
                color: "var(--ha-text-primary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Inline edit form */}
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

      {/* EPS sparkline (60 min) */}
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
          EPS — Last 60 Minutes
        </h2>
        <HaChart
          option={buildSparklineOption(data.epsSparkline)}
          height={200}
          ariaLabel="Line chart showing events per second over the last 60 minutes"
        />
      </div>

      {/* 7-day alert trend */}
      <div
        style={{
          background: "var(--ha-surface-primary)",
          border: "1px solid var(--ha-border)",
          borderRadius: "var(--ha-radius-base)",
          padding: "var(--ha-space-4)",
        }}
      >
        <h2
          style={{
            fontSize: "var(--ha-text-sm)",
            color: "var(--ha-text-secondary)",
            marginBottom: "var(--ha-space-3)",
          }}
        >
          Alerts — Last 7 Days
        </h2>
        <HaChart
          option={buildTrendOption(data.alertsTrend7d, trendLabels)}
          height={200}
          ariaLabel="Bar chart showing alert counts for the last 7 days"
        />
      </div>
    </div>
  );
}
