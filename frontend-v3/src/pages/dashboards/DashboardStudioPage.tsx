/**
 * DashboardStudioPage — Full-canvas dashboard editor
 * Session S32 — Dashboard Studio implementation
 * Security gaps: GAP-SEC-06, GAP-SEC-12, GAP-MT-05
 */

import { useEffect, useMemo, useState } from 'react';

import { useNavigate, useParams } from 'react-router-dom';

import { DashboardCanvas } from './studio/DashboardCanvas';
import { WidgetCatalogue } from './studio/WidgetCatalogue';
import { WidgetConfigPanel } from './studio/WidgetConfigPanel';
import type { WidgetConfig } from './studio/WidgetConfigPanel';
import { WidgetContainer } from './studio/WidgetContainer';
import type { WidgetType } from './studio/widgetTypes.constants';

import { AccessDeniedState } from '@/components/access-denied-state/AccessDeniedState';
import { FilterBar } from '@/components/filter-bar';
import type { FilterPill } from '@/components/filter-bar';
import { ConfirmationModal } from '@/components/ha-confirmation-modal/ConfirmationModal';
import { createDashboard, getDashboard, updateDashboard } from '@/services/dashboards.service';
import { useAuthStore } from '@/store/auth.store';
import type { DashboardDTO } from '@/types/api.types';

interface WidgetState extends WidgetConfig {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function DashboardStudioPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuthStore();

  const [dashboardName, setDashboardName] = useState('Untitled Dashboard');
  const [refreshTime, setRefreshTime] = useState<number | null>(null);
  const [widgets, setWidgets] = useState<WidgetState[]>([]);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [isLoading, setIsLoading] = useState(!!id);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterPill[]>([]);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Access control check
  const canEdit = hasRole('ROLE_ANALYST') || hasRole('ROLE_SOC_MANAGER') || hasRole('ROLE_ADMIN');

  useEffect(() => {
    if (!canEdit) {
      // State 07 — Access Denied
      return;
    }

    if (id) {
      // Edit mode — load existing dashboard
      // GAP-SEC-12: No @PreAuthorize on GET /api/ha-dashboards/:id
      getDashboard(Number(id))
        .then((data) => {
          setDashboardName(data.title);
          setRefreshTime(null); // DashboardDTO from api.types doesn't have refreshTime

          // Parse widgets from DashboardDTO.widgets (WidgetSpec[])
          if (data.widgets && Array.isArray(data.widgets)) {
            const parsedWidgets: WidgetState[] = data.widgets.map((spec) => ({
              id: spec.id,
              type: spec.type as WidgetType,
              name: spec.title,
              description: '',
              x: spec.position.x,
              y: spec.position.y,
              w: spec.position.w,
              h: spec.position.h,
            }));
            setWidgets(parsedWidgets);
          }

          setIsLoading(false);
        })
        .catch((err) => {
          // State 05 — Error or State 09 — Not Found
          setError(err.status === 404 ? 'Dashboard not found' : 'Could not load dashboard');
          setIsLoading(false);
        });
    }
  }, [id, canEdit]);

  // State 16 — Unsaved changes guard
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const selectedWidget = useMemo(
    () => widgets.find((w) => w.id === selectedWidgetId) ?? null,
    [widgets, selectedWidgetId]
  );

  const handleAddWidget = (type: WidgetType): void => {
    const newWidget: WidgetState = {
      id: `widget-${Date.now()}`,
      type,
      name: `New ${type}`,
      description: '',
      x: 0,
      y: 0,
      w: 4,
      h: 3,
    };
    setWidgets((prev) => [...prev, newWidget]);
    setSelectedWidgetId(newWidget.id);
    setHasUnsavedChanges(true);
  };

  const handleWidgetMoved = (id: string, x: number, y: number): void => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, x, y } : w)));
    setHasUnsavedChanges(true);
  };

  const handleWidgetResized = (id: string, w: number, h: number): void => {
    setWidgets((prev) => prev.map((widget) => (widget.id === id ? { ...widget, w, h } : widget)));
    setHasUnsavedChanges(true);
  };

  const handleWidgetRemoved = (id: string): void => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    if (selectedWidgetId === id) {
      setSelectedWidgetId(null);
    }
    setHasUnsavedChanges(true);
  };

  const handleWidgetConfigSave = (config: WidgetConfig): void => {
    setWidgets((prev) =>
      prev.map((w) =>
        w.id === config.id
          ? {
              ...config,
              x: w.x,
              y: w.y,
              w: w.w,
              h: w.h,
            }
          : w
      )
    );
    setHasUnsavedChanges(true);
  };

  const handleSave = (): void => {
    if (!dashboardName.trim()) {
      // State 13 — Validation failure
      setError('Dashboard name is required');
      return;
    }

    setIsSaving(true);
    setError(null);

    // Serialize widgets to WidgetSpec[] for DashboardDTO
    const widgetSpecs = widgets.map((w) => ({
      id: w.id,
      type: w.type,
      title: w.name,
      config: {}, // TODO: Serialize widget config
      position: { x: w.x, y: w.y, w: w.w, h: w.h },
    }));

    const payload: Omit<DashboardDTO, 'id' | 'createdAt' | 'updatedAt'> = {
      title: dashboardName,
      description: undefined,
      isPublic: false,
      ownerId: 0, // Backend sets from JWT
      tenantId: undefined,
      widgets: widgetSpecs,
      version: 1,
    };

    const savePromise = id
      ? updateDashboard({ ...payload, id: Number(id), createdAt: '', updatedAt: '' }) // GAP-SEC-12
      : createDashboard(payload); // GAP-SEC-12

    savePromise
      .then((saved: DashboardDTO) => {
        setHasUnsavedChanges(false);
        navigate(`/dashboards/${saved.id}`);
      })
      .catch((err: { status: number; message: string }) => {
        if (err.status === 409) {
          // State 15 — Conflict
          setError('Dashboard modified by another user. Your changes conflict with a newer version.');
        } else {
          setError(`Save failed: ${err.message}`);
        }
        setIsSaving(false);
      });
  };

  const handleDiscard = (): void => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
    } else {
      handleDiscardConfirmed();
    }
  };

  const handleDiscardConfirmed = (): void => {
    setShowDiscardConfirm(false);
    if (id) {
      navigate(`/dashboards/${id}`);
    } else {
      navigate('/dashboards');
    }
  };

  const handlePreview = (): void => {
    setPreviewMode(!previewMode);
    if (!previewMode) {
      setSelectedWidgetId(null);
    }
  };

  const handleFilterRemove = (id: string): void => {
    setActiveFilters((prev) => prev.filter((f) => f.id !== id));
  };

  const handleFilterToggleNegate = (id: string): void => {
    setActiveFilters((prev) =>
      prev.map((f) => (f.id === id ? { ...f, negate: !f.negate } : f))
    );
  };

  const handleFilterClearAll = (): void => {
    setActiveFilters([]);
  };

  if (!canEdit) {
    // State 07 — Access Denied
    return (
      <AccessDeniedState
        title="Access Restricted"
        message="Dashboard editing requires the Analyst role or higher."
      />
    );
  }

  if (isLoading) {
    // State 01 — Loading
    return (
      <div style={{ padding: 24, color: 'var(--ha-text-primary)' }}>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (error && !isSaving) {
    // State 05 — Error
    return (
      <div style={{ padding: 24, color: 'var(--ha-text-primary)' }}>
        <h1>Error</h1>
        <p>{error}</p>
        <button onClick={() => setError(null)}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Studio Toolbar */}
      <div
        style={{
          height: '44px',
          backgroundColor: 'var(--ha-surface-raised)',
          borderBottom: '1px solid var(--ha-border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: '16px',
        }}
      >
        {/* Dashboard name input */}
        <input
          type="text"
          value={dashboardName}
          onChange={(e) => {
            setDashboardName(e.target.value);
            setHasUnsavedChanges(true);
          }}
          placeholder="Untitled Dashboard"
          maxLength={100}
          style={{
            flex: 1,
            maxWidth: '300px',
            padding: '6px 8px',
            fontSize: 'var(--ha-text-lg)',
            backgroundColor: 'transparent',
            border: '1px solid transparent',
            borderRadius: '4px',
            color: 'var(--ha-text-primary)',
            outline: 'none',
          }}
          onFocus={(e) => {
            e.target.style.border = '1px solid var(--ha-primary)';
          }}
          onBlur={(e) => {
            e.target.style.border = '1px solid transparent';
          }}
        />

        {/* Refresh time selector */}
        <select
          value={refreshTime ?? ''}
          onChange={(e) => {
            setRefreshTime(e.target.value ? Number(e.target.value) : null);
            setHasUnsavedChanges(true);
          }}
          style={{
            padding: '6px 8px',
            fontSize: 'var(--ha-text-base)',
            backgroundColor: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: '4px',
            color: 'var(--ha-text-primary)',
          }}
        >
          <option value="">No Auto-Refresh</option>
          <option value="30">30 seconds</option>
          <option value="60">1 minute</option>
          <option value="300">5 minutes</option>
          <option value="600">10 minutes</option>
          <option value="1800">30 minutes</option>
        </select>

        <div style={{ flex: 1 }} />

        {/* Unsaved changes indicator */}
        {hasUnsavedChanges && (
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: 'var(--ha-high)',
            }}
            title="Unsaved changes"
          />
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!dashboardName.trim() || isSaving}
          style={{
            padding: '6px 16px',
            fontSize: 'var(--ha-text-base)',
            border: '1px solid var(--ha-primary)',
            borderRadius: '4px',
            backgroundColor: 'var(--ha-primary)',
            color: 'var(--ha-foreground-on-action)',
            cursor: dashboardName.trim() && !isSaving ? 'pointer' : 'not-allowed',
            opacity: dashboardName.trim() && !isSaving ? 1 : 0.5,
          }}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>

        {/* Preview button */}
        <button
          onClick={handlePreview}
          style={{
            padding: '6px 16px',
            fontSize: 'var(--ha-text-base)',
            border: '1px solid var(--ha-border)',
            borderRadius: '4px',
            backgroundColor: previewMode ? 'var(--ha-surface-primary)' : 'transparent',
            color: 'var(--ha-text-primary)',
            cursor: 'pointer',
          }}
        >
          {previewMode ? 'Back to Edit' : 'Preview'}
        </button>

        {/* Discard button */}
        <button
          onClick={handleDiscard}
          style={{
            padding: '6px 16px',
            fontSize: 'var(--ha-text-base)',
            border: '1px solid var(--ha-border)',
            borderRadius: '4px',
            backgroundColor: 'transparent',
            color: 'var(--ha-text-primary)',
            cursor: 'pointer',
          }}
        >
          Discard
        </button>
      </div>

      {/* Filter Bar (PD-11) */}
      {previewMode && (
        <FilterBar
          filters={activeFilters}
          onRemove={handleFilterRemove}
          onToggleNegate={handleFilterToggleNegate}
          onClearAll={handleFilterClearAll}
        />
      )}

      {/* Main content area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Widget Palette */}
        {!previewMode && <WidgetCatalogue onAddWidget={handleAddWidget} isCollapsed={false} />}

        {/* Canvas */}
        <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          {widgets.length === 0 && !previewMode ? (
            // State 04 — Empty Canvas
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--ha-text-secondary)',
              }}
            >
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
              <p style={{ marginTop: 16, fontSize: 'var(--ha-text-base)' }}>
                Drag a widget from the palette to get started.
              </p>
            </div>
          ) : (
            <DashboardCanvas
              widgets={widgets.map((w) => ({ id: w.id, x: w.x, y: w.y, w: w.w, h: w.h }))}
              staticGrid={previewMode}
              onWidgetMoved={handleWidgetMoved}
              onWidgetResized={handleWidgetResized}
              onWidgetRemoved={handleWidgetRemoved}
            >
              {widgets.map((widget) => (
                <WidgetContainer
                  key={widget.id}
                  id={widget.id}
                  name={widget.name}
                  type={widget.type}
                  isSelected={selectedWidgetId === widget.id}
                  isEditMode={!previewMode}
                  onClick={() => !previewMode && setSelectedWidgetId(widget.id)}
                  onRemove={() => handleWidgetRemoved(widget.id)}
                >
                  {/* Widget body placeholder */}
                  <div style={{ color: 'var(--ha-text-secondary)', textAlign: 'center' }}>
                    {widget.type} widget content
                  </div>
                </WidgetContainer>
              ))}
            </DashboardCanvas>
          )}
        </div>

        {/* Widget Config Panel */}
        {!previewMode && selectedWidget && (
          <WidgetConfigPanel
            widget={selectedWidget}
            onClose={() => setSelectedWidgetId(null)}
            onSave={handleWidgetConfigSave}
          />
        )}
      </div>

      {/* Discard Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={handleDiscardConfirmed}
        title="Discard Changes?"
        description="You have unsaved changes. Are you sure you want to discard them?"
        confirmLabel="Discard"
        isDanger={true}
      />
    </div>
  );
}
