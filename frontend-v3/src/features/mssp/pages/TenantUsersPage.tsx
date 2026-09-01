/**
 * TenantUsersPage — MSSP tenant membership honesty (Prompt 49 / Wave C3 slice 5).
 *
 * Production membership: GET /api/ha-mssp/tenants/{id}/users (MSSP_ADMIN-gated).
 * Tenant-scoped roles use human labels; platform identity records live on Identity
 * & Tenancy — delegation scope and immutable audit remain fail-closed (IAM-005).
 */

import { type ReactElement, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { CircleSlash2, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import {
  addTenantUser,
  fetchTenantUsers,
  patchTenantUserRole,
  removeTenantUser,
} from "../api/msspMembershipApi";
import { MsspConflictError } from "../api/msspTypes";
import type { TenantMemberDTO, TenantRole } from "../api/msspTypes";
import { useMsspNavStore } from "../store/msspNavStore";

import { HaConfirmationModal } from "@/components/ha-confirmation-modal/HaConfirmationModal";
import { LoadingState } from "@/components/loading-state/LoadingState";
import { SiemDataGrid } from "@/components/siem-data-grid/SiemDataGrid";
import { ROUTES } from "@/constants/routes.constants";
import { ROW_HEIGHTS, useRowDensity } from "@/hooks/useRowDensity";

import "./TenantUsersPage.css";

/** Bundle-visible job sentence — delegated membership, not inventory or tenant workspace. */
export const TENANT_USERS_JOB_SENTENCE =
  "MSSP tenant membership — manage delegated users and tenant-scoped roles (Tenant Admin, Tenant Analyst, Tenant Viewer) for one MSSP-managed customer authorized for MSSP Administrators. Tenant inventory stays on Tenants; observability and metadata on the tenant workspace; platform user records on Identity & Tenancy — add/remove membership, delegation scope, and immutable audit remain fail-closed until IAM contracts land.";

const REMOVE_CONFIRM_TEXT =
  "Remove this user's tenant membership? This does not delete the user.";

const TENANT_ROLE_OPTIONS: Array<{ value: TenantRole; label: string }> = [
  { value: "TENANT_ADMIN", label: "Tenant Admin" },
  { value: "TENANT_ANALYST", label: "Tenant Analyst" },
  { value: "TENANT_VIEWER", label: "Tenant Viewer" },
];

interface PageHeaderProps {
  onRefresh?: () => void;
}

function PageHeader({ onRefresh }: PageHeaderProps): ReactElement {
  return (
    <header className="mssp-tenant-users-header">
      <div className="mssp-tenant-users-header__identity">
        <span className="mssp-tenant-users-header__mark">
          <Users size={18} aria-hidden="true" />
        </span>
        <div className="mssp-tenant-users-header__copy">
          <div className="mssp-tenant-users-header__eyebrow">
            <span>MSSP PORTAL · TENANT MEMBERSHIP</span>
            <span className="mssp-tenant-users-header__badge">STAGING CANDIDATE</span>
          </div>
          <h1>Tenant Users</h1>
          <p className="mssp-tenant-users-header__job">{TENANT_USERS_JOB_SENTENCE}</p>
          <p className="mssp-tenant-users-page__projection-note" role="note">
            Membership via GET /api/ha-mssp/tenants/&#123;id&#125;/users. Role labels are
            tenant-scoped — not MSSP Administrator or platform roles. POST, PATCH, and DELETE mutate
            authorized membership only; delegation scope and audit export remain partial (IAM-005).
          </p>
        </div>
      </div>
      {onRefresh && (
        <div className="mssp-tenant-users-header__actions">
          <button
            className="mssp-tenant-users-icon-button"
            type="button"
            aria-label="Refresh tenant membership"
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
  const workspacePath = tenantId ? `/mssp/tenants/${tenantId}` : "/mssp/tenants";

  return (
    <p className="mssp-tenant-users-page__meta">
      <Link to="/mssp/overview">Overview</Link>
      <span aria-hidden="true">·</span>
      <Link to="/mssp/tenants">Tenants</Link>
      <span aria-hidden="true">·</span>
      <Link to={workspacePath}>Workspace</Link>
      <span aria-hidden="true">·</span>
      <Link to={ROUTES.ADMIN_TENANTS}>Platform tenants</Link>
      <span aria-hidden="true">·</span>
      <Link to={ROUTES.ADMIN_USERS}>Identity &amp; Tenancy</Link>
      <span aria-hidden="true">·</span>
      <span className="mssp-tenant-users-page__access">MSSP Administrator</span>
    </p>
  );
}

function TrustBanner(): ReactElement {
  return (
    <div className="mssp-tenant-users-trust" data-testid="tenant-users-trust-banner">
      <ShieldCheck size={13} aria-hidden="true" />
      <span>
        <strong>Membership fail-closed:</strong> HTTP 404 means the tenant is not MSSP-managed or
        missing; 401/403 means MSSP Administrator is required — never conflated. An empty member
        list is valid — not an error. User IDs reference platform identity records on Identity
        &amp; Tenancy.
      </span>
    </div>
  );
}

function EmptyHonesty({ tenantId }: { tenantId: string }): ReactElement {
  return (
    <div
      className="mssp-tenant-users-empty-honesty"
      role="status"
      data-testid="tenant-users-empty-honesty"
    >
      <strong>No members in this tenant yet.</strong>
      <span>
        An empty list is not an error — add a member by user ID below or create platform users on
        Identity &amp; Tenancy first.
      </span>
      <div className="mssp-tenant-users-empty-honesty__links">
        <Link to={ROUTES.ADMIN_USERS}>Identity &amp; Tenancy</Link>
        <Link to={`/mssp/tenants/${tenantId}`}>Tenant workspace</Link>
      </div>
    </div>
  );
}

interface RoleCellProps {
  params: ICellRendererParams<TenantMemberDTO>;
  onMutate: (userId: number, newRole: TenantRole) => void;
}

function RoleCellRenderer({ params, onMutate }: RoleCellProps): ReactElement {
  const value = params.data?.tenantRole ?? "TENANT_VIEWER";

  return (
    <select
      className="mssp-tenant-users-add-form__select mssp-tenant-users-add-form__select--inline"
      value={value}
      aria-label="Tenant role"
      onChange={(e) => {
        if (params.data) {
          onMutate(params.data.userId, e.target.value as TenantRole);
        }
      }}
    >
      {TENANT_ROLE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

interface AddMemberFormProps {
  tenantId: string;
}

function AddMemberForm({ tenantId }: AddMemberFormProps): ReactElement {
  const queryClient = useQueryClient();

  const [userId, setUserId] = useState<string>("");
  const [tenantRole, setTenantRole] = useState<TenantRole>("TENANT_VIEWER");
  const [conflictError, setConflictError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      addTenantUser(tenantId, {
        userId: parseInt(userId, 10),
        tenantRole,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["mssp", "tenant", tenantId, "users"],
      });
      setUserId("");
      setTenantRole("TENANT_VIEWER");
      setConflictError(null);
    },
    onError: (err: unknown) => {
      if (err instanceof MsspConflictError) {
        setConflictError("This user is already a member of this tenant.");
      } else {
        setConflictError("Failed to add member. Please try again.");
      }
    },
  });

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setConflictError(null);
    mutation.mutate();
  }

  return (
    <form
      className="mssp-tenant-users-add-form"
      onSubmit={handleSubmit}
      data-testid="add-member-form"
    >
      <div className="mssp-tenant-users-add-form__field">
        <label htmlFor="add-member-userid">User ID</label>
        <input
          id="add-member-userid"
          className="mssp-tenant-users-add-form__input"
          type="number"
          min={1}
          required
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="e.g. 42"
        />
      </div>

      <div className="mssp-tenant-users-add-form__field mssp-tenant-users-add-form__field--role">
        <label htmlFor="add-member-role">Tenant Role</label>
        <select
          id="add-member-role"
          className="mssp-tenant-users-add-form__select"
          value={tenantRole}
          onChange={(e) => setTenantRole(e.target.value as TenantRole)}
        >
          {TENANT_ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mssp-tenant-users-add-form__actions">
        <span style={{ fontSize: "var(--ha-text-sm)", visibility: "hidden" }} aria-hidden="true">
          _
        </span>
        <button
          className="mssp-tenant-users-button"
          type="submit"
          disabled={mutation.isPending || !userId}
        >
          {mutation.isPending ? "Adding…" : "Add member"}
        </button>
      </div>

      {conflictError && (
        <p className="mssp-tenant-users-add-form__error" data-testid="add-member-error">
          {conflictError}
        </p>
      )}
    </form>
  );
}

export function TenantUsersPage(): ReactElement {
  const [density] = useRowDensity();
  const { tenantId } = useParams<{ tenantId: string }>();
  const safeId = tenantId ?? "";

  const setLastTenantId = useMsspNavStore((s) => s.setLastTenantId);
  const queryClient = useQueryClient();

  const [pendingRemove, setPendingRemove] = useState<TenantMemberDTO | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["mssp", "tenant", safeId, "users"] as const,
    queryFn: () => fetchTenantUsers(safeId),
    enabled: Boolean(safeId),
  });

  if (data && safeId) {
    setLastTenantId(safeId);
  }

  const patchRoleMutation = useMutation({
    mutationFn: ({ userId, tenantRole }: { userId: number; tenantRole: TenantRole }) =>
      patchTenantUserRole(safeId, userId, { tenantRole }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["mssp", "tenant", safeId, "users"],
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: number) => removeTenantUser(safeId, userId),
    onSuccess: () => {
      setPendingRemove(null);
      void queryClient.invalidateQueries({
        queryKey: ["mssp", "tenant", safeId, "users"],
      });
    },
  });

  const handleRefresh = (): void => {
    void refetch();
  };

  const status = error instanceof Error ? error.message : "";
  const isAuth = status === "401" || status === "403";
  const is404 = isError && status === "404";

  const columnDefs: ColDef<TenantMemberDTO>[] = [
    {
      headerName: "Login",
      field: "login",
      flex: 2,
      sortable: true,
      filter: true,
    },
    {
      headerName: "Email",
      field: "email",
      flex: 3,
      sortable: true,
      filter: true,
    },
    {
      headerName: "Role",
      field: "tenantRole",
      flex: 2,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<TenantMemberDTO>) => (
        <RoleCellRenderer
          params={params}
          onMutate={(userId, newRole) =>
            patchRoleMutation.mutate({ userId, tenantRole: newRole })
          }
        />
      ),
    },
    {
      headerName: "Activated",
      field: "userActivated",
      flex: 1,
      sortable: true,
      valueFormatter: (params) => (params.value === true ? "Yes" : "No"),
    },
    {
      headerName: "",
      field: "tenantUserId",
      flex: 1,
      sortable: false,
      filter: false,
      cellRenderer: (params: ICellRendererParams<TenantMemberDTO>) => (
        <button
          type="button"
          className="mssp-tenant-users-remove-button"
          aria-label={`Remove ${params.data?.login ?? "user"}`}
          onClick={() => {
            if (params.data) setPendingRemove(params.data);
          }}
        >
          Remove
        </button>
      ),
    },
  ];

  if (isLoading) {
    return (
      <section
        className="mssp-tenant-users-page"
        aria-label="MSSP tenant membership"
        data-testid="tenant-users-loading"
      >
        <PageHeader onRefresh={handleRefresh} />
        <MetaLinks tenantId={tenantId} />
        <TrustBanner />
        <div className="mssp-tenant-users-loading">
          <LoadingState message="Loading tenant membership…" />
        </div>
      </section>
    );
  }

  if (is404) {
    return (
      <section
        className="mssp-tenant-users-page"
        aria-label="MSSP tenant membership"
        data-testid="tenant-users-notfound"
      >
        <PageHeader onRefresh={handleRefresh} />
        <MetaLinks tenantId={tenantId} />
        <div className="mssp-tenant-users-empty" role="status">
          <strong>Tenant not found</strong>
          <span>
            The requested tenant does not exist or is not MSSP-managed. HTTP 404 is distinct from
            authorization failure.
          </span>
          <button
            className="mssp-tenant-users-button mssp-tenant-users-button--secondary"
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
        className="mssp-tenant-users-page"
        aria-label="MSSP tenant membership"
        data-testid="tenant-users-error"
      >
        <PageHeader onRefresh={handleRefresh} />
        <MetaLinks tenantId={tenantId} />
        <div className="mssp-tenant-users-empty" role="status">
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
        className="mssp-tenant-users-page"
        aria-label="MSSP tenant membership"
        data-testid="tenant-users-error"
      >
        <PageHeader onRefresh={handleRefresh} />
        <MetaLinks tenantId={tenantId} />
        <TrustBanner />
        <div className="mssp-tenant-users-empty mssp-tenant-users-empty--error" role="status">
          <strong>Could not load tenant membership</strong>
          <span>
            GET /api/ha-mssp/tenants/&#123;id&#125;/users failed. Retry or return to the tenant
            workspace.
          </span>
          <button
            className="mssp-tenant-users-button mssp-tenant-users-button--secondary"
            type="button"
            onClick={handleRefresh}
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  const members = data;
  const isEmpty = members.length === 0;

  if (isEmpty) {
    return (
      <section
        className="mssp-tenant-users-page"
        aria-label="MSSP tenant membership"
        data-testid="tenant-users-empty"
      >
        <PageHeader onRefresh={handleRefresh} />
        <MetaLinks tenantId={tenantId} />
        <TrustBanner />
        <EmptyHonesty tenantId={safeId} />
        <div className="mssp-tenant-users-workspace">
          <AddMemberForm tenantId={safeId} />
        </div>
      </section>
    );
  }

  return (
    <section
      className="mssp-tenant-users-page"
      aria-label="MSSP tenant membership"
      data-testid="tenant-users-populated"
    >
      <PageHeader onRefresh={handleRefresh} />
      <MetaLinks tenantId={tenantId} />
      <TrustBanner />

      <div className="mssp-tenant-users-workspace">
        <AddMemberForm tenantId={safeId} />

        <div className="mssp-tenant-users-results-head">
          <div>
            <strong>Authorized membership</strong>
            <span>
              {members.length.toLocaleString()} member{members.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="mssp-tenant-users-grid-wrap">
          <SiemDataGrid
            columnDefs={columnDefs}
            rowData={members as TenantMemberDTO[]}
            height="100%"
            rowHeight={ROW_HEIGHTS[density]}
            defaultColDef={{ resizable: true }}
          />
        </div>
      </div>

      <HaConfirmationModal
        isOpen={pendingRemove !== null}
        title="Remove Member"
        message={REMOVE_CONFIRM_TEXT}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          if (pendingRemove) {
            removeMutation.mutate(pendingRemove.userId);
          }
        }}
        onCancel={() => setPendingRemove(null)}
      />
    </section>
  );
}
