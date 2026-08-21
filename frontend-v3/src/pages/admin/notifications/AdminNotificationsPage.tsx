/**
 * AdminNotificationsPage — Admin: Notification Rules (ADM-03)
 */

import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import { Bell, Plus, Trash2 } from 'lucide-react';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaButton } from '@/components/ha-button/HaButton';
import { HaConfirmationModal } from '@/components/ha-confirmation-modal/HaConfirmationModal';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { HaTextInput } from '@/components/ha-text-input/HaTextInput';
import { HaToggle } from '@/components/ha-toggle/HaToggle';
import { LoadingState } from '@/components/loading-state/LoadingState';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import {
  createNotificationRule,
  deleteNotificationRule,
  getNotificationRules,
  updateNotificationRule,
} from '@/services/notifications.service';
import type {
  CreateNotificationRuleRequest,
  NotificationRuleDTO,
  UpdateNotificationRuleRequest,
} from '@/types/notification.types';

interface NotificationFormData {
  name: string;
  severityThreshold: number;
  destinationType: 'email' | 'webhook' | 'slack' | 'teams' | 'pagerduty';
  destinationConfig: Record<string, string>;
  enabled: boolean;
}

export function AdminNotificationsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<NotificationRuleDTO | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState<NotificationFormData>({
    name: '',
    severityThreshold: 3,
    destinationType: 'email',
    destinationConfig: {},
    enabled: true,
  });

  const { data: rules, isLoading, isError, error } = useQuery({
    queryKey: ['notification-rules'],
    queryFn: getNotificationRules,
  });

  const createMutation = useMutation({
    mutationFn: (req: CreateNotificationRuleRequest) => createNotificationRule(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
      setDrawerOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (req: UpdateNotificationRuleRequest) => updateNotificationRule(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
      setDrawerOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteNotificationRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
      setDeleteConfirmOpen(false);
      setRuleToDelete(null);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      severityThreshold: 3,
      destinationType: 'email',
      destinationConfig: {},
      enabled: true,
    });
    setEditingRule(null);
  };

  const handleOpenDrawer = (rule?: NotificationRuleDTO) => {
    if (rule) {
      setEditingRule(rule);
      setFormData({
        name: rule.name,
        severityThreshold: rule.severityThreshold,
        destinationType: rule.destinationType,
        destinationConfig: rule.destinationConfig,
        enabled: rule.enabled,
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
    if (editingRule) {
      updateMutation.mutate({
        id: editingRule.id,
        ...formData,
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDeleteClick = (id: string) => {
    setRuleToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (ruleToDelete) {
      deleteMutation.mutate(ruleToDelete);
    }
  };

  const handleToggleEnabled = (rule: NotificationRuleDTO) => {
    updateMutation.mutate({
      ...rule,
      enabled: !rule.enabled,
    });
  };

  const SeverityCell = (params: { value: unknown }) => {
    const value = params.value as number;
    const severityLabels: Record<number, string> = {
      1: 'Low',
      2: 'Medium',
      3: 'High',
      4: 'Critical',
    };

    const severityColors: Record<number, string> = {
      1: 'var(--ha-positive)',
      2: 'var(--ha-medium)',
      3: 'var(--ha-high)',
      4: 'var(--ha-critical)',
    };

    return (
      <span style={{ color: severityColors[value] ?? 'var(--ha-text-secondary)' }}>
        {severityLabels[value] ?? value}+
      </span>
    );
  };

  const EnabledCell = (params: { data: unknown }) => {
    const data = params.data as NotificationRuleDTO;
    return (
    <HaToggle
      checked={data.enabled}
      onChange={() => handleToggleEnabled(data)}
      aria-label={`Toggle ${data.name}`}
    />
    );
  };

  const ActionsCell = (params: { data: unknown }) => {
    const data = params.data as NotificationRuleDTO;
    return (
    <div style={{ display: 'flex', gap: 8 }}>
      <HaButton variant="secondary" onClick={() => handleOpenDrawer(data)}>
        Edit
      </HaButton>
      <button
        onClick={() => handleDeleteClick(data.id)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--ha-critical)',
        }}
        aria-label="Delete rule"
      >
        <Trash2 size={16} />
      </button>
    </div>
    );
  };

  const columnDefs: ColDef[] = [
    {
      field: 'name',
      headerName: 'Rule Name',
      flex: 1,
      minWidth: 200,
    },
    {
      field: 'severityThreshold',
      headerName: 'Severity Threshold',
      width: 150,
      cellRenderer: SeverityCell,
    },
    {
      field: 'destinationType',
      headerName: 'Destination Type',
      width: 150,
      cellStyle: { textTransform: 'capitalize' },
    },
    {
      field: 'enabled',
      headerName: 'Enabled',
      width: 100,
      cellRenderer: EnabledCell,
    },
    {
      field: 'createdAt',
      headerName: 'Created',
      width: 150,
      valueFormatter: (params) =>
        params.value ? new Date(params.value as string).toLocaleString() : '-',
    },
    {
      headerName: 'Actions',
      colId: 'actions',
      width: 150,
      pinned: 'right',
      sortable: false,
      resizable: false,
      cellRenderer: ActionsCell,
    },
  ];

  if (isLoading) {
    return (
      <div>
        <SiemPageHeader title="Notification Rules" />
        <LoadingState rows={10} />
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <SiemPageHeader title="Notification Rules" />
        <ErrorState
          title="Failed to load notification rules"
          message={error instanceof Error ? error.message : 'Unknown error'}
        />
      </div>
    );
  }

  const isEmpty = !rules || rules.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SiemPageHeader
        title="Notification Rules"
        actions={
          <HaButton
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => handleOpenDrawer()}
          >
            Add Rule
          </HaButton>
        }
      />

      <div style={{ flex: 1, padding: 24 }}>
        {isEmpty ? (
          <EmptyState
            icon={<Bell size={48} />}
            title="No notification rules configured"
            description="Create rules to receive alerts via email, Slack, or webhooks."
            action={
              <HaButton
                variant="primary"
                icon={<Plus size={16} />}
                onClick={() => handleOpenDrawer()}
              >
                Add Rule
              </HaButton>
            }
          />
        ) : (
          <div style={{ height: '100%' }}>
            <SiemDataGrid
              columnDefs={columnDefs}
              rowData={rules}
              height="100%"
              getRowId={(params) => (params.data as NotificationRuleDTO).id}
            />
          </div>
        )}
      </div>

      <HaDrawer
        isOpen={drawerOpen}
        onClose={handleCloseDrawer}
        title={editingRule ? 'Edit Notification Rule' : 'Add Notification Rule'}
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
              {editingRule ? 'Save' : 'Create'}
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
              Rule Name
            </label>
            <HaTextInput
              value={formData.name}
              onChange={(value) => setFormData({ ...formData, name: value })}
              placeholder="Notification rule name"
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
              Severity Threshold
            </label>
            <select
              value={formData.severityThreshold}
              onChange={(e) =>
                setFormData({ ...formData, severityThreshold: Number(e.target.value) })
              }
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
              <option value={1}>Low and above</option>
              <option value={2}>Medium and above</option>
              <option value={3}>High and above</option>
              <option value={4}>Critical only</option>
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
              Destination Type
            </label>
            <select
              value={formData.destinationType}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  destinationType: e.target.value as NotificationFormData['destinationType'],
                })
              }
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
              <option value="email">Email</option>
              <option value="webhook">Webhook</option>
              <option value="slack">Slack</option>
              <option value="teams">Microsoft Teams</option>
              <option value="pagerduty">PagerDuty</option>
            </select>
          </div>

          <div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 'var(--ha-text-sm)',
                fontWeight: 500,
                color: 'var(--ha-text-primary)',
              }}
            >
              <HaToggle
                checked={formData.enabled}
                onChange={(checked) => setFormData({ ...formData, enabled: checked })}
              />
              Enabled
            </label>
          </div>

          <div>
            <div style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
              Destination-specific configuration fields (webhook URL, email addresses, etc.) will be
              provided in a future enhancement.
            </div>
          </div>
        </div>
      </HaDrawer>

      <HaConfirmationModal
        isOpen={deleteConfirmOpen}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Notification Rule"
        message="Are you sure you want to delete this notification rule? You will stop receiving alerts for this configuration."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  );
}
