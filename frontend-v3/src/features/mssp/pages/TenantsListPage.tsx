/**
 * TenantsListPage — MSSP tenants list with search, pagination, and row navigation.
 *
 * Supports four mutually exclusive render states: loading, error, empty, populated.
 * Row click stores the tenant id in msspNavStore and navigates to the detail page.
 *
 * Requirements: 9.1 – 9.8
 */

import { type ReactElement, useEffect, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import type { ColDef, RowClickedEvent } from "ag-grid-community";
import { useNavigate } from "react-router-dom";

import { fetchTenants } from "../api/msspTenantApi";
import type { TenantHealthDTO } from "../api/msspTypes";


import { ErrorState } from "@/components/error-state/ErrorState";
import { LoadingState } from "@/components/loading-state/LoadingState";
import { SiemDataGrid } from "@/components/siem-data-grid/SiemDataGrid";
import { useMsspNavStore } from "@/features/mssp/store/msspNavStore";

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const TENANTS_COLUMN_DEFS: ColDef<TenantHealthDTO>[] = [
  { headerName: "Name", field: "name", flex: 2, sortable: true, filter: true },
  { headerName: "Client Prefix", field: "clientPrefix", flex: 1, sortable: true },
  { headerName: "Users", field: "userCount", flex: 1, type: "numericColumn" },
  { headerName: "EPS", field: "eps", flex: 1, type: "numericColumn" },
  { headerName: "Health", field: "healthStatus", flex: 1, filter: true },
  {
    headerName: "Last Event",
    field: "lastEventAt",
    flex: 2,
    valueFormatter: (params) => {
      if (!params.value) return "—";
      return new Date(params.value as string).toLocaleString();
    },
  },
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

export function TenantsListPage(): ReactElement {
  const navigate = useNavigate();
  const setLastTenantId = useMsspNavStore((s) => s.setLastTenantId);

  // ── Search state with debounced querystring update ────────────────────────
  const [inputValue, setInputValue] = useState("");
  const [q, setQ] = useState("");
  const [page] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setQ(inputValue.trim());
    }, 350);

    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [inputValue]);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["mssp", "tenants", { q, page, size: PAGE_SIZE }] as const,
    queryFn: () => fetchTenants({ q: q || undefined, page, size: PAGE_SIZE }),
  });

  // ── Row click handler ─────────────────────────────────────────────────────
  const handleRowClick = (event: RowClickedEvent<TenantHealthDTO>) => {
    if (!event.data) return;
    const id = String(event.data.id);
    setLastTenantId(id);
    navigate(`/mssp/tenants/${id}`);
  };

  // ── Loading branch ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        data-testid="tenants-list-loading"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: "var(--ha-space-6)",
        }}
      >
        <LoadingState message="Loading tenants…" />
      </div>
    );
  }

  // ── Error branch ──────────────────────────────────────────────────────────
  if (isError || !data) {
    return (
      <div
        data-testid="tenants-list-error"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: "var(--ha-space-6)",
        }}
      >
        <ErrorState
          title="Could not load tenants"
          message="An error occurred while fetching the tenants list."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const isEmpty = data.items.length === 0;

  // ── Shared toolbar ────────────────────────────────────────────────────────
  const toolbar = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--ha-space-3)",
        marginBottom: "var(--ha-space-4)",
      }}
    >
      <h1
        style={{
          fontSize: "var(--ha-text-xl)",
          fontWeight: "var(--ha-weight-semibold)",
          color: "var(--ha-text-primary)",
          margin: 0,
          flex: "0 0 auto",
        }}
      >
        Tenants
      </h1>

      <input
        type="search"
        aria-label="Search tenants"
        placeholder="Search tenants…"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        style={{
          flex: "1 1 0",
          minWidth: "160px",
          maxWidth: "400px",
          padding: "6px var(--ha-space-3)",
          fontSize: "var(--ha-text-sm)",
          color: "var(--ha-text-primary)",
          background: "var(--ha-surface-raised)",
          border: "1px solid var(--ha-border)",
          borderRadius: "var(--ha-radius-base)",
          outline: "none",
        }}
      />

      <button
        type="button"
        onClick={() => navigate("/mssp/tenants/new")}
        style={{
          flex: "0 0 auto",
          padding: "6px var(--ha-space-4)",
          fontSize: "var(--ha-text-sm)",
          fontWeight: "var(--ha-weight-medium)",
          color: "var(--ha-background)",
          background: "var(--ha-primary)",
          border: "none",
          borderRadius: "var(--ha-radius-base)",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        New tenant
      </button>
    </div>
  );

  // ── Empty branch ──────────────────────────────────────────────────────────
  if (isEmpty) {
    return (
      <div
        data-testid="tenants-list-empty"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: "var(--ha-space-6)",
        }}
      >
        {toolbar}

        <p
          style={{
            color: "var(--ha-text-secondary)",
            fontSize: "var(--ha-text-sm)",
            textAlign: "center",
            marginTop: "var(--ha-space-6)",
          }}
        >
          No tenants found
        </p>
      </div>
    );
  }

  // ── Populated branch ──────────────────────────────────────────────────────
  return (
    <div
      data-testid="tenants-list-populated"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "var(--ha-space-6)",
      }}
    >
      {toolbar}

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
          rowData={data.items as TenantHealthDTO[]}
          height="100%"
          defaultColDef={{ resizable: true, sortable: true }}
          onRowClicked={handleRowClick}
        />
      </div>
    </div>
  );
}
