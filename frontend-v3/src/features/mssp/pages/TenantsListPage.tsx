/**
 * TenantsListPage — MSSP tenant inventory honesty (Prompt 46 / Wave C3 slice 2).
 *
 * Production inventory: GET /api/ha-mssp/tenants (MSSP_ADMIN-gated, X-Total-Count).
 * Platform tenant boundaries on Identity & Tenancy; delegated membership and lifecycle
 * governance remain fail-closed (IAM-005).
 */

import { type ReactElement, useEffect, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import type { ColDef, RowClickedEvent } from "ag-grid-community";
import { Building2, CircleSlash2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { fetchTenants } from "../api/msspTenantApi";
import type { TenantHealthDTO } from "../api/msspTypes";

import { LoadingState } from "@/components/loading-state/LoadingState";
import { SiemDataGrid } from "@/components/siem-data-grid/SiemDataGrid";
import { ROUTES } from "@/constants/routes.constants";
import { useMsspNavStore } from "@/features/mssp/store/msspNavStore";
import { ROW_HEIGHTS, useRowDensity } from "@/hooks/useRowDensity";

import "./TenantsListPage.css";

/** Bundle-visible job sentence — MSSP delegated inventory, not platform tenants or overview KPIs. */
export const TENANTS_LIST_JOB_SENTENCE =
  "MSSP tenant inventory — search and open delegated customer tenants authorized for MSSP Administrators. Overview aggregates fleet KPIs; platform tenant boundaries live under Identity & Tenancy — provisioning creates MSSP-managed records via POST /api/ha-mssp/tenants; delegated membership, lifecycle governance, and immutable audit remain fail-closed until IAM contracts land.";

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

const PAGE_SIZE = 50;

function PageHeader({ onRefresh }: { onRefresh: () => void }): ReactElement {
  return (
    <header className="mssp-tenants-header">
      <div className="mssp-tenants-header__identity">
        <span className="mssp-tenants-header__mark">
          <Building2 size={18} aria-hidden="true" />
        </span>
        <div className="mssp-tenants-header__copy">
          <div className="mssp-tenants-header__eyebrow">
            <span>MSSP PORTAL · TENANTS</span>
            <span className="mssp-tenants-header__badge">STAGING CANDIDATE</span>
          </div>
          <h1>Tenants</h1>
          <p className="mssp-tenants-header__job">{TENANTS_LIST_JOB_SENTENCE}</p>
          <p className="mssp-tenants-page__projection-note" role="note">
            Inventory via GET /api/ha-mssp/tenants (X-Total-Count header, optional q filter).
            Health and EPS columns are observability projections — not SLO pass/fail. Member
            listing, delegation scope, and tenant lifecycle governance remain partial (IAM-005).
          </p>
        </div>
      </div>
      <div className="mssp-tenants-header__actions">
        <button
          className="mssp-tenants-icon-button"
          type="button"
          aria-label="Refresh tenant inventory"
          onClick={onRefresh}
        >
          <RefreshCw size={13} />
        </button>
      </div>
    </header>
  );
}

function MetaLinks(): ReactElement {
  return (
    <p className="mssp-tenants-page__meta">
      <Link to="/mssp/overview">Overview</Link>
      <span aria-hidden="true">·</span>
      <Link to="/mssp/tenants/new">New tenant</Link>
      <span aria-hidden="true">·</span>
      <Link to={ROUTES.ADMIN_TENANTS}>Platform tenants</Link>
      <span aria-hidden="true">·</span>
      <Link to={ROUTES.ADMIN_USERS}>Identity &amp; Tenancy</Link>
      <span aria-hidden="true">·</span>
      <span className="mssp-tenants-page__access">MSSP Administrator</span>
    </p>
  );
}

function TrustBanner(): ReactElement {
  return (
    <div className="mssp-tenants-trust" data-testid="tenants-list-trust-banner">
      <ShieldCheck size={13} aria-hidden="true" />
      <span>
        <strong>Inventory fail-closed:</strong> Only MSSP-managed tenants returned by authorized
        GET appear here. Masthead tenant switcher reads the same contract — no placeholder
        customers.
      </span>
    </div>
  );
}

function EmptyHonesty(): ReactElement {
  return (
    <div
      className="mssp-tenants-empty-honesty"
      role="status"
      data-testid="tenants-list-empty-honesty"
    >
      <strong>No MSSP-managed tenants in authorized inventory.</strong>
      <span>
        An empty list is not an error — provision a tenant or broaden search. Platform tenant
        records on Identity &amp; Tenancy are a separate inventory.
      </span>
      <div className="mssp-tenants-empty-honesty__links">
        <Link to="/mssp/tenants/new">Provision tenant</Link>
        <Link to={ROUTES.ADMIN_TENANTS}>Platform tenants</Link>
      </div>
    </div>
  );
}

export function TenantsListPage(): ReactElement {
  const [density] = useRowDensity();
  const navigate = useNavigate();
  const setLastTenantId = useMsspNavStore((s) => s.setLastTenantId);

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

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["mssp", "tenants", { q, page, size: PAGE_SIZE }] as const,
    queryFn: () => fetchTenants({ q: q || undefined, page, size: PAGE_SIZE }),
  });

  const handleRowClick = (event: RowClickedEvent<TenantHealthDTO>) => {
    if (!event.data) return;
    const id = String(event.data.id);
    setLastTenantId(id);
    navigate(`/mssp/tenants/${id}`);
  };

  const handleRefresh = (): void => {
    void refetch();
  };

  const status = error instanceof Error ? error.message : "";
  const isAuth = status === "401" || status === "403";
  const hasSearch = Boolean(q);
  const items = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  const showEmptyHonesty = !isLoading && !isError && data !== undefined && items.length === 0 && !hasSearch;
  const showFilterEmpty = !isLoading && !isError && data !== undefined && items.length === 0 && hasSearch;

  if (isLoading) {
    return (
      <section className="mssp-tenants-page" aria-label="MSSP tenants" data-testid="tenants-list-loading">
        <PageHeader onRefresh={handleRefresh} />
        <MetaLinks />
        <TrustBanner />
        <div className="mssp-tenants-loading">
          <LoadingState message="Loading tenant inventory…" />
        </div>
      </section>
    );
  }

  if (isAuth) {
    return (
      <section className="mssp-tenants-page" aria-label="MSSP tenants" data-testid="tenants-list-error">
        <PageHeader onRefresh={handleRefresh} />
        <MetaLinks />
        <div className="mssp-tenants-empty" role="status">
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
      <section className="mssp-tenants-page" aria-label="MSSP tenants" data-testid="tenants-list-error">
        <PageHeader onRefresh={handleRefresh} />
        <MetaLinks />
        <TrustBanner />
        <div className="mssp-tenants-empty mssp-tenants-empty--error" role="status">
          <strong>Could not load tenant inventory</strong>
          <span>An error occurred while fetching GET /api/ha-mssp/tenants. Retry or contact support.</span>
          <button className="mssp-tenants-button" type="button" onClick={handleRefresh}>
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="mssp-tenants-page"
      aria-label="MSSP tenants"
      data-testid={items.length === 0 ? "tenants-list-empty" : "tenants-list-populated"}
    >
      <PageHeader onRefresh={handleRefresh} />
      <MetaLinks />
      <TrustBanner />
      {showEmptyHonesty && <EmptyHonesty />}

      <div className="mssp-tenants-toolbar">
        <label className="mssp-tenants-search">
          <Search size={13} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search tenants"
            placeholder="Search tenants…"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
        </label>
        <button
          className="mssp-tenants-button"
          type="button"
          onClick={() => navigate("/mssp/tenants/new")}
        >
          New tenant
        </button>
      </div>

      <div className="mssp-tenants-inventory">
        <div className="mssp-tenants-results-head">
          <div>
            <strong>Authorized inventory</strong>
            <span>
              {totalCount.toLocaleString()} tenant{totalCount === 1 ? "" : "s"}
              {hasSearch ? ` matching “${q}”` : ""}
            </span>
          </div>
        </div>

        {showFilterEmpty ? (
          <div className="mssp-tenants-empty" role="status">
            <strong>No tenants match this search</strong>
            <span>Clear the filter or provision a new MSSP-managed tenant.</span>
            <button
              className="mssp-tenants-button"
              type="button"
              onClick={() => setInputValue("")}
            >
              Clear search
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="mssp-tenants-empty" role="status">
            <strong>No tenants in inventory</strong>
            <span>Use New tenant to provision the first MSSP-managed customer.</span>
          </div>
        ) : (
          <div className="mssp-tenants-grid-wrap">
            <SiemDataGrid
              columnDefs={TENANTS_COLUMN_DEFS}
              rowData={items as TenantHealthDTO[]}
              height="100%"
              rowHeight={ROW_HEIGHTS[density]}
              defaultColDef={{ resizable: true, sortable: true }}
              onRowClicked={handleRowClick}
            />
          </div>
        )}
      </div>
    </section>
  );
}
