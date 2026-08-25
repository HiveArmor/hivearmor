/**
 * TenantUsersPage — manage users (members) of a single MSSP-managed tenant.
 *
 * Render states: loading, error, empty, populated.
 * Features:
 *   - SiemDataGrid with columns: login, email, tenantRole (select cell), userActivated
 *   - tenantRole cell renders a <select> with TENANT_ADMIN | TENANT_ANALYST | TENANT_VIEWER;
 *     on change fires PATCH via patchTenantUserRole
 *   - Row-level "Remove" button opens a HaModal confirmation before firing DELETE
 *   - "Add member" form (userId + tenantRole) above the grid; 409 → inline error, values preserved
 *   - On mount: stores tenantId in msspNavStore so the sidebar link stays active
 *
 * Requirements: 15.1 – 15.7, 17.4 – 17.7
 */

import { type ReactElement, useState } from "react";


import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { useParams } from "react-router-dom";

import {
  addTenantUser,
  fetchTenantUsers,
  patchTenantUserRole,
  removeTenantUser,
} from "../api/msspMembershipApi";
import { MsspConflictError } from "../api/msspTypes";
import type { TenantMemberDTO, TenantRole } from "../api/msspTypes";
import { useMsspNavStore } from "../store/msspNavStore";

import { ErrorState } from "@/components/error-state/ErrorState";
import { HaConfirmationModal } from "@/components/ha-confirmation-modal/HaConfirmationModal";
import { LoadingState } from "@/components/loading-state/LoadingState";
import { SiemDataGrid } from "@/components/siem-data-grid/SiemDataGrid";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REMOVE_CONFIRM_TEXT =
  "Remove this user's tenant membership? This does not delete the user.";

const TENANT_ROLE_OPTIONS: Array<{ value: TenantRole; label: string }> = [
  { value: "TENANT_ADMIN", label: "Tenant Admin" },
  { value: "TENANT_ANALYST", label: "Tenant Analyst" },
  { value: "TENANT_VIEWER", label: "Tenant Viewer" },
];

// ---------------------------------------------------------------------------
// Shared input/select style helper (no hex literals)
// ---------------------------------------------------------------------------

const fieldStyle: React.CSSProperties = {
  background: "var(--ha-surface-raised)",
  border: "1px solid var(--ha-border)",
  borderRadius: "var(--ha-radius-base)",
  color: "var(--ha-text-primary)",
  fontSize: "var(--ha-text-sm)",
  padding: "var(--ha-space-2) var(--ha-space-3)",
  width: "100%",
};

// ---------------------------------------------------------------------------
// Inline cell renderer for the tenantRole column
// ---------------------------------------------------------------------------

interface RoleCellProps {
  params: ICellRendererParams<TenantMemberDTO>;
  onMutate: (userId: number, newRole: TenantRole) => void;
}

function RoleCellRenderer({ params, onMutate }: RoleCellProps): ReactElement {
  const value = params.data?.tenantRole ?? "TENANT_VIEWER";

  return (
    <select
      value={value}
      aria-label="Tenant role"
      onChange={(e) => {
        if (params.data) {
          onMutate(params.data.userId, e.target.value as TenantRole);
        }
      }}
      style={{
        ...fieldStyle,
        padding: "2px var(--ha-space-2)",
        cursor: "pointer",
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

// ---------------------------------------------------------------------------
// "Add member" form
// ---------------------------------------------------------------------------

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
      // Preserve form values — do not reset userId / tenantRole here.
    },
  });

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setConflictError(null);
    mutation.mutate();
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="add-member-form"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        gap: "var(--ha-space-3)",
        background: "var(--ha-surface-primary)",
        border: "1px solid var(--ha-border)",
        borderRadius: "var(--ha-radius-base)",
        padding: "var(--ha-space-4)",
        marginBottom: "var(--ha-space-4)",
      }}
    >
      <div
        style={{
          flex: "1 1 140px",
          display: "flex",
          flexDirection: "column",
          gap: "var(--ha-space-1)",
        }}
      >
        <label
          htmlFor="add-member-userid"
          style={{ fontSize: "var(--ha-text-sm)", color: "var(--ha-text-secondary)" }}
        >
          User ID
        </label>
        <input
          id="add-member-userid"
          type="number"
          min={1}
          required
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="e.g. 42"
          style={fieldStyle}
        />
      </div>

      <div
        style={{
          flex: "1 1 160px",
          display: "flex",
          flexDirection: "column",
          gap: "var(--ha-space-1)",
        }}
      >
        <label
          htmlFor="add-member-role"
          style={{ fontSize: "var(--ha-text-sm)", color: "var(--ha-text-secondary)" }}
        >
          Tenant Role
        </label>
        <select
          id="add-member-role"
          value={tenantRole}
          onChange={(e) => setTenantRole(e.target.value as TenantRole)}
          style={{ ...fieldStyle, cursor: "pointer" }}
        >
          {TENANT_ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: "var(--ha-space-1)" }}>
        {/* Spacer to align button with inputs */}
        <span style={{ fontSize: "var(--ha-text-sm)", visibility: "hidden" }}>_</span>
        <button
          type="submit"
          disabled={mutation.isPending || !userId}
          style={{
            padding: "var(--ha-space-2) var(--ha-space-5)",
            fontSize: "var(--ha-text-sm)",
            fontWeight: "var(--ha-weight-medium)",
            borderRadius: "var(--ha-radius-base)",
            border: "none",
            background: "var(--ha-primary)",
            color: "var(--ha-background)",
            cursor: mutation.isPending || !userId ? "not-allowed" : "pointer",
            opacity: mutation.isPending || !userId ? 0.7 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {mutation.isPending ? "Adding…" : "Add member"}
        </button>
      </div>

      {conflictError && (
        <p
          data-testid="add-member-error"
          style={{
            flex: "1 0 100%",
            color: "var(--ha-critical)",
            fontSize: "var(--ha-text-sm)",
            margin: 0,
          }}
        >
          {conflictError}
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function TenantUsersPage(): ReactElement {
  const { tenantId } = useParams<{ tenantId: string }>();
  const safeId = tenantId ?? "";

  const setLastTenantId = useMsspNavStore((s) => s.setLastTenantId);
  const queryClient = useQueryClient();

  // State for the remove-confirmation modal
  const [pendingRemove, setPendingRemove] = useState<TenantMemberDTO | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["mssp", "tenant", safeId, "users"] as const,
    queryFn: () => fetchTenantUsers(safeId),
    enabled: Boolean(safeId),
  });

  // Update sidebar with current tenant id whenever data arrives
  if (data && safeId) {
    setLastTenantId(safeId);
  }

  // PATCH role mutation
  const patchRoleMutation = useMutation({
    mutationFn: ({ userId, tenantRole }: { userId: number; tenantRole: TenantRole }) =>
      patchTenantUserRole(safeId, userId, { tenantRole }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["mssp", "tenant", safeId, "users"],
      });
    },
  });

  // DELETE membership mutation
  const removeMutation = useMutation({
    mutationFn: (userId: number) => removeTenantUser(safeId, userId),
    onSuccess: () => {
      setPendingRemove(null);
      void queryClient.invalidateQueries({
        queryKey: ["mssp", "tenant", safeId, "users"],
      });
    },
  });

  // ── Column definitions ──────────────────────────────────────────────────────
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
          aria-label={`Remove ${params.data?.login ?? "user"}`}
          onClick={() => {
            if (params.data) setPendingRemove(params.data);
          }}
          style={{
            padding: "2px var(--ha-space-3)",
            fontSize: "var(--ha-text-xs)",
            fontWeight: "var(--ha-weight-medium)",
            borderRadius: "var(--ha-radius-base)",
            border: "1px solid var(--ha-critical)",
            background: "transparent",
            color: "var(--ha-critical)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Remove
        </button>
      ),
    },
  ];

  // ── Loading branch ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        data-testid="tenant-users-loading"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: "var(--ha-space-6)",
        }}
      >
        <LoadingState message="Loading tenant users…" />
      </div>
    );
  }

  // ── Error branch ────────────────────────────────────────────────────────────
  if (isError || !data) {
    return (
      <div
        data-testid="tenant-users-error"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: "var(--ha-space-6)",
        }}
      >
        <ErrorState
          title="Could not load tenant users"
          message="An error occurred while fetching the tenant user list."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const isEmpty = data.length === 0;

  // ── Shared header ───────────────────────────────────────────────────────────
  const pageHeader = (
    <h1
      style={{
        fontSize: "var(--ha-text-xl)",
        fontWeight: "var(--ha-weight-semibold)",
        color: "var(--ha-text-primary)",
        marginBottom: "var(--ha-space-4)",
      }}
    >
      Tenant Users
    </h1>
  );

  // ── Empty branch ────────────────────────────────────────────────────────────
  if (isEmpty) {
    return (
      <div
        data-testid="tenant-users-empty"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: "var(--ha-space-6)",
        }}
      >
        {pageHeader}
        <AddMemberForm tenantId={safeId} />
        <p
          style={{
            color: "var(--ha-text-secondary)",
            fontSize: "var(--ha-text-sm)",
            textAlign: "center",
            marginTop: "var(--ha-space-6)",
          }}
        >
          No users in this tenant yet
        </p>
      </div>
    );
  }

  // ── Populated branch ────────────────────────────────────────────────────────
  return (
    <div
      data-testid="tenant-users-populated"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "var(--ha-space-6)",
      }}
    >
      {pageHeader}

      {/* Add member form */}
      <AddMemberForm tenantId={safeId} />

      {/* Users grid */}
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
          columnDefs={columnDefs}
          rowData={data as TenantMemberDTO[]}
          height="100%"
          defaultColDef={{ resizable: true }}
        />
      </div>

      {/* Remove confirmation modal */}
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
    </div>
  );
}
