/**
 * AdminIntegrationsPage — Admin: Integrations & Data Sources (ADM-02)
 */

import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import { Plug, Plus, RefreshCw, Settings, Trash2 } from 'lucide-react';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaButton } from '@/components/ha-button/HaButton';
import { HaConfirmationModal } from '@/components/ha-confirmation-modal/HaConfirmationModal';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { HaTextInput } from '@/components/ha-text-input/HaTextInput';
import { LoadingState } from '@/components/loading-state/LoadingState';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import {
  createIntegration,
  deleteIntegration,
  getIntegrations,
  testIntegration,
  updateIntegration,
} from '@/services/integrations.service';
import type {
  CreateIntegrationRequest,
  IntegrationDTO,
  UpdateIntegrationRequest,
} from '@/types/integration.types';

interface IntegrationFormData {
  name: string;
  type: string;
  config: Record<string, string>;
}

export function AdminIntegrationsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<IntegrationDTO | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [integrationToDelete, setIntegrationToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState<IntegrationFormData>({
    name: '',
    type: 'syslog',
    config: {},
  });

  const { data: integrations, isLoading, isError, error } = useQuery({
    queryKey: ['integrations'],
    queryFn: getIntegrations,
  });

  const createMutation = useMutation({
    mutationFn: (req: CreateIntegrationRequest) => createIntegration(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setDrawerOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (req: UpdateIntegrationRequest) => updateIntegration(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setDrawerOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteIntegration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setDeleteConfirmOpen(false);
      setIntegrationToDelete(null);
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => testIntegration(id),
  });

  const resetForm = () => {
    setFormData({ name: '', type: 'syslog', config: {} });
    setEditingIntegration(null);
  };

  const handleOpenDrawer = (integration?: IntegrationDTO) => {
    if (integration) {
      setEditingIntegration(integration);
      setFormData({
        name: integration.name,
        type: integration.type,
        config: integration.config ?? {},
      });
    } else {
      resetForm();
    }
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    resetForm();
  };

  const handleSave = () => {
    if (editingIntegration) {
      updateMutation.mutate({
        id: editingIntegration.id,
        ...formData,
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDeleteClick = (id: string) => {
    setIntegrationToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (integrationToDelete) {
      deleteMutation.mutate(integrationToDelete);
    }
  };

  const handleTestConnection = (id: string) => {
    testMutation.mutate(id);
  };

  const StatusCell = (params: { value: unknown }) => {
    const value = params.value as string;
    const statusColors: Record<string, string> = {
      connected: 'var(--ha-positive)',
      degraded: 'var(--ha-high)',
      disconnected: 'var(--ha-critical)',
      pending: 'var(--ha-text-secondary)',
    };

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: statusColors[value] ?? 'var(--ha-text-secondary)',
          }}
        />
        <span style={{ textTransform: 'capitalize' }}>{value}</span>
      </div>
    );
  };

  const ActionsCell = (params: { data: unknown }) => {
    const data = params.data as IntegrationDTO;
    return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        onClick={() => handleOpenDrawer(data)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--ha-text-secondary)',
        }}
        aria-label="Edit integration"
      >
        <Settings size={16} />
      </button>
      <button
        onClick={() => handleTestConnection(data.id)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--ha-text-secondary)',
        }}
        aria-label="Test connection"
      >
        <RefreshCw size={16} />
      </button>
      <button
        onClick={() => handleDeleteClick(data.id)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--ha-critical)',
        }}
        aria-label="Delete integration"
      >
        <Trash2 size={16} />
      </button>
    </div>
    );
  };

  const columnDefs: ColDef[] = [
    {
      field: 'name',
      headerName: 'Name',
      flex: 1,
      minWidth: 200,
    },
    {
      field: 'type',
      headerName: 'Type',
      width: 150,
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      cellRenderer: StatusCell,
    },
    {
      field: 'eventsPerSecond',
      headerName: 'Events/s',
      width: 100,
      cellStyle: { fontFamily: 'var(--ha-font-mono)', textAlign: 'right' },
      valueFormatter: (params) => (params.value !== undefined ? params.value.toString() : '-'),
    },
    {
      field: 'lastSeen',
      headerName: 'Last Seen',
      width: 150,
      valueFormatter: (params) =>
        params.value ? new Date(params.value as string).toLocaleString() : 'Never',
    },
    {
      headerName: 'Actions',
      colId: 'actions',
      width: 120,
      pinned: 'right',
      sortable: false,
      resizable: false,
      cellRenderer: ActionsCell,
    },
  ];

  if (isLoading) {
    return (
      <div>
        <SiemPageHeader title="Integrations & Data Sources" />
        <LoadingState rows={10} />
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <SiemPageHeader title="Integrations & Data Sources" />
        <ErrorState
          title="Failed to load integrations"
          message={error instanceof Error ? error.message : 'Unknown error'}
        />
      </div>
    );
  }

  const isEmpty = !integrations || integrations.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SiemPageHeader
        title="Integrations & Data Sources"
        actions={
          <HaButton
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => handleOpenDrawer()}
          >
            Add Integration
          </HaButton>
        }
      />

      <div style={{ flex: 1, padding: 24 }}>
        {isEmpty ? (
          <EmptyState
            icon={<Plug size={48} />}
            title="No integrations configured"
            description="Add a data source to start collecting events."
            action={
              <HaButton
                variant="primary"
                icon={<Plus size={16} />}
                onClick={() => handleOpenDrawer()}
              >
                Add Integration
              </HaButton>
            }
          />
        ) : (
          <div style={{ height: '100%' }}>
            <SiemDataGrid
              columnDefs={columnDefs}
              rowData={integrations}
              height="100%"
              getRowId={(params) => (params.data as IntegrationDTO).id}
            />
          </div>
        )}
      </div>

      <HaDrawer
        isOpen={drawerOpen}
        onClose={handleCloseDrawer}
        title={editingIntegration ? 'Edit Integration' : 'Add Integration'}
        width={480}
        footer={
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <HaButton variant="secondary" onClick={handleCloseDrawer}>
              Cancel
            </HaButton>
            <HaButton
              variant="primary"
              onClick={handleSave}
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editingIntegration ? 'Save' : 'Create'}
            </HaButton>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--ha-text-sm)',
                fontWeight: 500,
                color: 'var(--ha-text-primary)',
                marginBottom: 8,
              }}
            >
              Name
            </label>
            <HaTextInput
              value={formData.name}
              onChange={(value) => setFormData({ ...formData, name: value })}
              placeholder="Integration name"
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--ha-text-sm)',
                fontWeight: 500,
                color: 'var(--ha-text-primary)',
                marginBottom: 8,
              }}
            >
              Type
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: 'var(--ha-text-base)',
                color: 'var(--ha-text-primary)',
                backgroundColor: 'var(--ha-surface-raised)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
              }}
            >
              <option value="syslog">Syslog</option>
              <option value="windows-agent">Windows Agent</option>
              <option value="linux-agent">Linux Agent</option>
              <option value="firewall">Firewall</option>
              <option value="cloud-trail">AWS CloudTrail</option>
              <option value="azure-ad">Azure AD</option>
              <option value="office365">Office 365</option>
            </select>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--ha-text-sm)',
                fontWeight: 500,
                color: 'var(--ha-text-primary)',
                marginBottom: 8,
              }}
            >
              Configuration
            </label>
            <div style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
              Configuration fields will vary by integration type. For this session, a simplified
              form is provided.
            </div>
          </div>
        </div>
      </HaDrawer>

      <HaConfirmationModal
        isOpen={deleteConfirmOpen}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Integration"
        message="Are you sure you want to delete this integration? Event collection from this source will stop immediately."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  );
}
