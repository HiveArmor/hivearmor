import { RefreshCw, Edit, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface DashboardToolbarProps {
  dashboardName: string;
  dashboardId: number;
  isSystem: boolean;
  isFavourited: boolean;
  isRefreshing: boolean;
  canEdit: boolean;
  refreshTime: number | null;
  onToggleFavourite: () => void;
  onRefresh: () => void;
}

export function DashboardToolbar({
  dashboardName,
  dashboardId,
  isSystem,
  isFavourited,
  isRefreshing,
  canEdit,
  onToggleFavourite,
  onRefresh,
}: DashboardToolbarProps): JSX.Element {
  const navigate = useNavigate();

  const handleEdit = (): void => {
    if (!canEdit || isSystem) return;
    navigate(`/dashboards/${dashboardId}/edit`);
  };

  const editDisabled = !canEdit || isSystem;
  const editTooltip = isSystem
    ? 'System dashboards cannot be edited'
    : !canEdit
      ? 'Requires Analyst role or higher'
      : undefined;

  return (
    <div
      style={{
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        background: 'var(--ha-surface-raised)',
        borderBottom: '1px solid var(--ha-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <h1
          style={{
            fontSize: 'var(--ha-text-lg)',
            fontWeight: 600,
            color: 'var(--ha-text-primary)',
            margin: 0,
          }}
        >
          {dashboardName}
        </h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          type="button"
          onClick={onToggleFavourite}
          aria-label={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: isFavourited ? 'var(--ha-primary)' : 'var(--ha-text-secondary)',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--ha-radius-base)',
          }}
        >
          <Star size={20} fill={isFavourited ? 'currentColor' : 'none'} />
        </button>

        <button
          type="button"
          onClick={handleEdit}
          disabled={editDisabled}
          title={editTooltip}
          aria-label="Edit dashboard"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: editDisabled ? 'not-allowed' : 'pointer',
            color: editDisabled ? 'var(--ha-text-secondary)' : 'var(--ha-text-primary)',
            opacity: editDisabled ? 0.5 : 1,
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--ha-radius-base)',
          }}
        >
          <Edit size={20} />
        </button>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Refresh all widgets"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: isRefreshing ? 'not-allowed' : 'pointer',
            color: 'var(--ha-text-primary)',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--ha-radius-base)',
          }}
        >
          <RefreshCw
            size={20}
            style={{
              animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
            }}
          />
        </button>
      </div>
    </div>
  );
}
