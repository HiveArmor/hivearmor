/**
 * AdminUsersPage — Users & Roles Management
 * ADM-01 Users & Roles
 *
 * Platform-level user administration screen. Allows Platform Administrators
 * to create, activate, deactivate, and assign roles to users across the HiveArmor instance.
 *
 * GAP-SEC-01: The role management API (/api/authority) has no backend access controls.
 * Any authenticated user can enumerate all application roles. A backend fix is required
 * before production deployment. Role assignment through this screen is properly secured
 * via the UserResource (ROLE_ADMIN required).
 */

import { useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import { RefreshCw } from 'lucide-react';

import { getAuthorities, getUsers } from './adminUsers.service';
import type { UserDTO, UserFilterState } from './adminUsers.types';
import { ActivatedBadge } from './components/ActivatedBadge';
import { RoleBadge } from './components/RoleBadge';
import { UserDrawer } from './components/UserDrawer';

import { EmptyState } from '@/components/empty-state';
import { HaButton } from '@/components/ha-button';
import { HaInlineBanner } from '@/components/ha-inline-banner';
import { HaSelect } from '@/components/ha-select';
import { HaTextInput } from '@/components/ha-text-input';
import { SiemToolbar } from '@/components/ha-toolbar/SiemToolbar';
import { LoadingState } from '@/components/loading-state';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { ROLES } from '@/lib/roles';
import { useAuthStore } from '@/store/auth.store';

export function AdminUsersPage(): JSX.Element {
  const { hasRole } = useAuthStore();
  const [filters, setFilters] = useState<UserFilterState>({
    search: '',
    activated: 'all',
    roles: [],
  });

  const [drawerState, setDrawerState] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    user: UserDTO | null;
  }>({
    isOpen: false,
    mode: 'create',
    user: null,
  });

  const [page, setPage] = useState(0);
  const [gridData, setGridData] = useState<UserDTO[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // Check ROLE_ADMIN
  const isAdmin = hasRole(ROLES.ADMIN);

  // Fetch authorities (for role filter dropdown)
  const {
    data: authorities = [],
    isError: authoritiesError,
  } = useQuery({
    queryKey: ['authorities'],
    queryFn: getAuthorities,
    enabled: isAdmin,
  });

  // Fetch users with infinite scroll model
  const {
    data: usersData,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['users', filters, page],
    queryFn: () =>
      getUsers({
        login: filters.search || undefined,
        email: filters.search || undefined,
        activated:
          filters.activated === 'active'
            ? true
            : filters.activated === 'inactive'
            ? false
            : undefined,
        authorities: filters.roles.length > 0 ? filters.roles[0] : undefined,
        page,
        size: 50,
        sort: 'login,asc',
      }),
    enabled: isAdmin,
  });

  useEffect(() => {
    if (usersData) {
      setGridData(usersData.items);
      setTotalCount(usersData.total);
    }
  }, [usersData]);

  // Column definitions (must be before early return)
  const columnDefs: ColDef[] = useMemo(
    () => [
      {
        headerName: 'Login',
        field: 'login',
        width: 160,
        cellStyle: {
          fontFamily: 'var(--ha-font-mono)',
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        },
        sortable: true,
      },
      {
        headerName: 'Email',
        field: 'email',
        width: 220,
        sortable: true,
      },
      {
        headerName: 'First Name',
        field: 'firstName',
        width: 140,
        valueFormatter: (params) => params.value || '—',
      },
      {
        headerName: 'Last Name',
        field: 'lastName',
        width: 140,
        valueFormatter: (params) => params.value || '—',
      },
      {
        headerName: 'Role',
        field: 'authorities',
        width: 160,
        cellRenderer: (params: { value: string[] }) => {
          const role = params.value?.[0] ?? 'ROLE_USER';
          return <RoleBadge role={role} />;
        },
      },
      {
        headerName: 'Status',
        field: 'activated',
        width: 110,
        cellRenderer: (params: { value: boolean }) => <ActivatedBadge activated={params.value} />,
      },
      {
        headerName: 'Created',
        field: 'createdDate',
        width: 160,
        cellStyle: {
          fontFamily: 'var(--ha-font-mono)',
          fontVariantNumeric: 'tabular-nums',
        } as Record<string, string>,
        valueFormatter: (params: { value?: string }) => {
          if (!params.value) return '—';
          return new Date(params.value).toLocaleString();
        },
      },
    ],
    []
  );

  const handleRowClicked = (data: unknown) => {
    const user = data as UserDTO;
    setDrawerState({
      isOpen: true,
      mode: 'edit',
      user,
    });
  };

  const handleCreateUser = () => {
    setDrawerState({
      isOpen: true,
      mode: 'create',
      user: null,
    });
  };

  const handleCloseDrawer = () => {
    setDrawerState({ isOpen: false, mode: 'create', user: null });
  };

  const handleDrawerSuccess = () => {
    refetch();
    handleCloseDrawer();
  };

  const handleClearFilters = () => {
    setFilters({ search: '', activated: 'all', roles: [] });
    setPage(0);
  };

  const hasActiveFilters = filters.search !== '' || filters.activated !== 'all' || filters.roles.length > 0;

  // Access denied state
  if (!isAdmin) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100vh - 56px)',
          flexDirection: 'column',
          gap: 16,
          padding: 24,
        }}
      >
        <div style={{ fontSize: 'var(--ha-text-2xl)', color: 'var(--ha-text-primary)', fontWeight: 600 }}>
          Access Restricted
        </div>
        <div style={{ fontSize: 'var(--ha-text-base)', color: 'var(--ha-text-secondary)', textAlign: 'center' }}>
          You need the ROLE_ADMIN role to manage users.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 56px)',
        background: 'var(--ha-background)',
      }}
    >
      {/* GAP-SEC-01 Warning Banner */}
      <div style={{ padding: '0 24px', paddingTop: 16 }}>
        <HaInlineBanner
          variant="warning"
          title="Backend Security Gap — GAP-SEC-01"
          description="The role management API (/api/authority) has no access controls at the backend level. Any authenticated user can enumerate all application roles. A backend fix is required before production deployment. Role assignment through this screen is properly secured via the UserResource (ROLE_ADMIN required)."
          isDismissible={false}
        />
      </div>

      {/* Page Header */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--ha-border)',
          background: 'var(--ha-surface-primary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 'var(--ha-text-xl)', fontWeight: 600, color: 'var(--ha-text-primary)', margin: 0 }}>
              Users & Roles
            </h1>
            <p style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', margin: '4px 0 0' }}>
              Manage platform user accounts and role assignments.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div
              style={{
                fontSize: 'var(--ha-text-sm)',
                color: 'var(--ha-text-secondary)',
                padding: '4px 12px',
                background: 'var(--ha-surface-raised)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
              }}
            >
              {totalCount} {totalCount === 1 ? 'user' : 'users'}
            </div>
            <HaButton
              variant="secondary"
              onClick={() => refetch()}
              isDisabled={isFetching}
              icon={<RefreshCw size={16} />}
            >
              Refresh
            </HaButton>
            <HaButton variant="primary" onClick={handleCreateUser}>
              Add User
            </HaButton>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <SiemToolbar
        left={
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <HaTextInput
              id="admin-users-search"
              aria-label="Search users by login or email"
              placeholder="Search by login or email..."
              value={filters.search}
              onChange={(value: string) => {
                setFilters((prev) => ({ ...prev, search: value }));
                setPage(0);
              }}
              style={{ width: 280 }}
            />
            <HaSelect
              value={filters.activated}
              onChange={(value: string) => {
                setFilters((prev) => ({ ...prev, activated: value as 'all' | 'active' | 'inactive' }));
                setPage(0);
              }}
              ariaLabel="Filter by status"
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />
            {authoritiesError ? (
              <div
                style={{
                  fontSize: 'var(--ha-text-xs)',
                  color: 'var(--ha-critical)',
                  padding: '0 8px',
                }}
              >
                Role filter unavailable
              </div>
            ) : (
              <HaSelect
                value={filters.roles[0] ?? ''}
                onChange={(value: string) => {
                  setFilters((prev) => ({ ...prev, roles: value ? [value] : [] }));
                  setPage(0);
                }}
                ariaLabel="Filter by role"
                options={[
                  { value: '', label: 'All Roles' },
                  ...authorities.map((auth) => ({ value: auth.name, label: auth.name })),
                ]}
              />
            )}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--ha-primary)',
                  fontSize: 'var(--ha-text-sm)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Clear all filters
              </button>
            )}
          </div>
        }
      />

      {/* Grid Area */}
      <div style={{ flex: 1, padding: '0 24px 24px', minHeight: 0 }}>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <div style={{ padding: 16 }}>
            <HaInlineBanner
              variant="danger"
              description="Could not load users. The server returned an error."
              isDismissible={false}
            />
            <HaButton variant="secondary" onClick={() => refetch()} style={{ marginTop: 16 }}>
              Retry
            </HaButton>
          </div>
        ) : gridData.length === 0 ? (
          <EmptyState
            title={hasActiveFilters ? 'No users match your current filters' : 'No users found'}
            description={
              hasActiveFilters ? 'Try adjusting the search or role filter.' : 'Add the first user to get started.'
            }
            action={
              hasActiveFilters ? (
                <HaButton variant="secondary" onClick={handleClearFilters}>
                  Clear all filters
                </HaButton>
              ) : (
                <HaButton variant="primary" onClick={handleCreateUser}>
                  Add User
                </HaButton>
              )
            }
          />
        ) : (
          <SiemDataGrid
            columnDefs={columnDefs}
            rowData={gridData}
            rowSelection="single"
            suppressRowClickSelection={false}
            onRowClicked={handleRowClicked}
            height="100%"
            defaultColDef={{
              sortable: true,
              filter: false,
              resizable: true,
            }}
          />
        )}
      </div>

      {/* User Drawer */}
      {drawerState.isOpen && (
        <UserDrawer
          isOpen={drawerState.isOpen}
          mode={drawerState.mode}
          user={drawerState.user}
          authorities={authorities}
          onClose={handleCloseDrawer}
          onSuccess={handleDrawerSuccess}
        />
      )}
    </div>
  );
}
