/**
 * DashboardGalleryPage — Saved Dashboards (DSH-01)
 * Card grid gallery + search for viewing all dashboards.
 *
 * SECURITY GAPS:
 * - GAP-SEC-12: No @PreAuthorize on dashboard CRUD endpoints
 * - GAP-MT-05: No tenant_id on UtmDashboard — all users see all dashboards
 */

import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { deleteDashboard, getDashboards } from './dashboards.service';
import type { DashboardDTO } from './dashboards.types';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { HaButton } from '@/components/ha-button/HaButton';
import { HaConfirmationModal } from '@/components/ha-confirmation-modal/HaConfirmationModal';
import { HaInlineBanner } from '@/components/ha-inline-banner/HaInlineBanner';
import { HaTextInput } from '@/components/ha-text-input/HaTextInput';
import { HaToggleGroup } from '@/components/ha-toggle-group/HaToggleGroup';
import { useAuthStore } from '@/store/auth.store';

type SystemFilter = 'all' | 'system' | 'custom';
type SortOption = 'modified' | 'name-asc' | 'name-desc' | 'owner';

export function DashboardGalleryPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasAnyRole } = useAuthStore();

  const [searchText, setSearchText] = useState('');
  const [systemFilter, setSystemFilter] = useState<SystemFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('modified');
  const [deleteTarget, setDeleteTarget] = useState<DashboardDTO | null>(null);

  const canCreate = hasAnyRole(['ROLE_ADMIN', 'ROLE_SOC_MANAGER', 'ROLE_ANALYST']);
  const canDelete = hasAnyRole(['ROLE_ADMIN', 'ROLE_SOC_MANAGER']);

  // Fetch dashboards
  // GAP-SEC-12: No @PreAuthorize on GET /api/ha-dashboards
  // GAP-MT-05: No tenant_id — all users see all dashboards
  const { data: dashboards = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboards', systemFilter, searchText],
    queryFn: () =>
      getDashboards({
        isSystem: systemFilter === 'all' ? undefined : systemFilter === 'system',
        q: searchText || undefined,
      }),
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  // Delete mutation
  // GAP-SEC-12: No @PreAuthorize — should require ROLE_ADMIN or ROLE_SOC_MANAGER
  const deleteMutation = useMutation({
    mutationFn: deleteDashboard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      setDeleteTarget(null);
    },
  });

  // Client-side sort
  const sortedDashboards = [...dashboards].sort((a, b) => {
    switch (sortOption) {
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      case 'owner':
        return a.owner.localeCompare(b.owner);
      case 'modified':
      default:
        // Assuming backend returns newest first — no lastModified field in DTO, keep original order
        return 0;
    }
  });

  const handleCardClick = (id: number) => {
    navigate(`/dashboards/${id}`);
  };

  const handleEdit = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/dashboards/${id}/edit`);
  };

  const handleDeleteRequest = (dashboard: DashboardDTO, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(dashboard);
  };

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.id);
    }
  };

  const handleNewDashboard = () => {
    navigate('/dashboards/studio');
  };

  const handleClearSearch = () => {
    setSearchText('');
  };

  // State 01 — Initial Loading
  if (isLoading) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 'var(--ha-text-xl)', color: 'var(--ha-text-primary)', margin: 0 }}>
              Dashboards
            </h1>
            <span
              style={{
                background: 'var(--ha-surface-raised)',
                padding: '2px 8px',
                borderRadius: 'var(--ha-radius-sm)',
                fontSize: 'var(--ha-text-xs)',
                color: 'var(--ha-text-secondary)',
              }}
            >
              —
            </span>
          </div>
          <HaButton variant="primary" onClick={handleNewDashboard} disabled>
            New Dashboard
          </HaButton>
        </div>

        {/* Skeleton toolbar */}
        <div style={{ marginBottom: 20, opacity: 0.5 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 240, height: 36, background: 'var(--ha-surface-primary)', borderRadius: 4 }} />
            <div style={{ width: 180, height: 36, background: 'var(--ha-surface-primary)', borderRadius: 4 }} />
          </div>
        </div>

        {/* Skeleton cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 20,
          }}
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 220,
                background: 'var(--ha-surface-primary)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                animation: 'shimmer 2s infinite',
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  // State 05 — Error
  if (isError) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ fontSize: 'var(--ha-text-xl)', color: 'var(--ha-text-primary)', margin: 0 }}>Dashboards</h1>
        </div>
        <HaInlineBanner
          variant="danger"
          title="Could not load dashboards"
          description="The server returned an error."
          isDismissible={false}
        />
        <HaButton variant="secondary" onClick={() => refetch()}>
          Retry
        </HaButton>
      </div>
    );
  }

  // State 04 — Empty
  const isEmpty = sortedDashboards.length === 0;

  return (
    <div style={{ padding: 24 }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 'var(--ha-text-xl)', color: 'var(--ha-text-primary)', margin: 0 }}>Dashboards</h1>
          <span
            style={{
              background: 'var(--ha-surface-raised)',
              padding: '2px 8px',
              borderRadius: 'var(--ha-radius-sm)',
              fontSize: 'var(--ha-text-xs)',
              color: 'var(--ha-text-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {dashboards.length}
          </span>
        </div>
        <HaButton
          variant="primary"
          onClick={handleNewDashboard}
          disabled={!canCreate}
          title={canCreate ? undefined : 'Requires Analyst role or higher'}
        >
          New Dashboard
        </HaButton>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
        <HaTextInput
          value={searchText}
          onChange={(value) => setSearchText(value)}
          placeholder="Search dashboards…"
          aria-label="Search dashboards"
          style={{ width: 240 }}
        />
        <HaToggleGroup
          value={systemFilter}
          onChange={(value) => setSystemFilter(value as SystemFilter)}
          options={[
            { label: 'All', value: 'all' },
            { label: 'System', value: 'system' },
            { label: 'Custom', value: 'custom' },
          ]}
          aria-label="Filter by type"
        />
        <div style={{ marginLeft: 'auto' }}>
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            style={{
              background: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
              color: 'var(--ha-text-primary)',
              padding: '6px 12px',
              fontSize: 'var(--ha-text-sm)',
            }}
            aria-label="Sort dashboards"
          >
            <option value="modified">Last Modified</option>
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="owner">Owner</option>
          </select>
        </div>
      </div>

      {isEmpty ? (
        <EmptyState
          icon="grid"
          title="No dashboards found"
          description={
            searchText
              ? `No dashboards match "${searchText}". Clear your search to see all dashboards.`
              : systemFilter === 'custom'
                ? 'No custom dashboards yet. Create your first dashboard to get started.'
                : 'No system dashboards available.'
          }
          action={
            searchText ? (
              <HaButton variant="secondary" onClick={handleClearSearch}>
                Clear search
              </HaButton>
            ) : systemFilter === 'custom' && canCreate ? (
              <HaButton variant="primary" onClick={handleNewDashboard}>
                New Dashboard
              </HaButton>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Card Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 20,
            }}
          >
            {sortedDashboards.map((dashboard) => (
              <DashboardCard
                key={dashboard.id}
                dashboard={dashboard}
                onClick={() => handleCardClick(dashboard.id)}
                onEdit={(e) => handleEdit(dashboard.id, e)}
                onDelete={(e) => handleDeleteRequest(dashboard, e)}
                canEdit={canCreate && !dashboard.isSystem}
                canDelete={canDelete && !dashboard.isSystem}
                isDeleting={deleteMutation.isPending && deleteTarget?.id === dashboard.id}
              />
            ))}
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <HaConfirmationModal
          isOpen={true}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
          title="Delete dashboard?"
          message={`Permanently delete "${deleteTarget.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
        />
      )}
    </div>
  );
}

interface DashboardCardProps {
  dashboard: DashboardDTO;
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  canEdit: boolean;
  canDelete: boolean;
  isDeleting: boolean;
}

function DashboardCard({
  dashboard,
  onClick,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
  isDeleting,
}: DashboardCardProps): JSX.Element {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        height: 220,
        background: 'var(--ha-surface-primary)',
        border: '1px solid var(--ha-border)',
        borderRadius: 'var(--ha-radius-base)',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 0.2s',
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = 'var(--ha-primary)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = 'var(--ha-border)';
      }}
    >
      {/* Thumbnail */}
      <div
        style={{
          height: 120,
          background: 'var(--ha-surface-raised)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Placeholder icon */}
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--ha-text-secondary)" strokeWidth="1">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>

        {/* System badge */}
        {dashboard.isSystem && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              background: 'var(--ha-fill-intelligence-muted)',
              color: 'var(--ha-intelligence)',
              padding: '2px 8px',
              borderRadius: 'var(--ha-radius-sm)',
              fontSize: 'var(--ha-text-xs)',
              fontWeight: 500,
            }}
          >
            System
          </div>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: 12 }}>
        <div
          style={{
            fontSize: 'var(--ha-text-md)',
            color: 'var(--ha-text-primary)',
            fontWeight: 500,
            marginBottom: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={dashboard.name}
        >
          {dashboard.name}
        </div>
        <div
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-secondary)',
            marginBottom: 8,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.4,
          }}
        >
          {dashboard.description || 'No description'}
        </div>
        <div
          style={{
            fontSize: 'var(--ha-text-xs)',
            color: 'var(--ha-text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {dashboard.owner} · Modified recently
        </div>
      </div>

      {/* Action overlay */}
      {isHovered && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 32,
            background: 'var(--ha-surface-raised)',
            opacity: 0.95,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            animation: 'slideUp 0.2s ease-out',
          }}
        >
          <HaButton variant="secondary" size="sm" onClick={onClick}>
            View
          </HaButton>
          {canEdit && (
            <HaButton variant="secondary" size="sm" onClick={onEdit}>
              Edit
            </HaButton>
          )}
          {canDelete && (
            <HaButton variant="danger" size="sm" onClick={onDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting…' : 'Delete'}
            </HaButton>
          )}
        </div>
      )}

      {/* Deleting spinner overlay */}
      {isDeleting && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--ha-scrim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ color: 'var(--ha-text-primary)', fontSize: 'var(--ha-text-sm)' }}>Deleting…</div>
        </div>
      )}
    </div>
  );
}
