/**
 * RetentionPage.tsx — Data Retention policy management (ADM-04)
 * Editable retention policies per data type with inline number inputs
 */

import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import { Database, Save } from 'lucide-react';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaButton } from '@/components/ha-button/HaButton';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { LoadingState } from '@/components/loading-state/LoadingState';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { apiClient } from '@/lib/apiClient';

interface RetentionPolicyDTO {
  dataType: string;
  retentionDays: number;
  lastModified?: string;
  modifiedBy?: string;
}

async function getRetentionPolicies(): Promise<RetentionPolicyDTO[]> {
  return apiClient.get<RetentionPolicyDTO[]>('/ha-retention-policies');
}

async function updateRetentionPolicy(
  dataType: string,
  retentionDays: number
): Promise<RetentionPolicyDTO> {
  return apiClient.put<RetentionPolicyDTO>(`/ha-retention-policies/${dataType}`, { retentionDays });
}

export function RetentionPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [editingRows, setEditingRows] = useState<Map<string, number>>(new Map());
  const [defaultRetention, setDefaultRetention] = useState<number>(30);

  const { data: policies, isLoading, isError, error } = useQuery({
    queryKey: ['retention-policies'],
    queryFn: getRetentionPolicies,
  });

  const updateMutation = useMutation({
    mutationFn: ({ dataType, retentionDays }: { dataType: string; retentionDays: number }) =>
      updateRetentionPolicy(dataType, retentionDays),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['retention-policies'] });
      setEditingRows((prev) => {
        const next = new Map(prev);
        next.delete(variables.dataType);
        return next;
      });
    },
  });

  const handleEdit = (dataType: string, currentValue: number): void => {
    setEditingRows((prev) => new Map(prev).set(dataType, currentValue));
  };

  const handleSave = (dataType: string): void => {
    const newValue = editingRows.get(dataType);
    if (newValue !== undefined && newValue > 0) {
      updateMutation.mutate({ dataType, retentionDays: newValue });
    }
  };

  const handleCancel = (dataType: string): void => {
    setEditingRows((prev) => {
      const next = new Map(prev);
      next.delete(dataType);
      return next;
    });
  };

  const handleValueChange = (dataType: string, value: string): void => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue)) {
      setEditingRows((prev) => new Map(prev).set(dataType, numValue));
    }
  };

  const handleSaveDefault = (): void => {
    if (defaultRetention > 0) {
      updateMutation.mutate({ dataType: 'default', retentionDays: defaultRetention });
    }
  };

  const RetentionDaysCell = (params: { data: unknown }): JSX.Element => {
    const data = params.data as RetentionPolicyDTO;
    const isEditing = editingRows.has(data.dataType);
    const editValue = editingRows.get(data.dataType) ?? data.retentionDays;

    if (isEditing) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="number"
            value={editValue}
            onChange={(e) => handleValueChange(data.dataType, e.target.value)}
            min={1}
            max={3650}
            style={{
              width: '80px',
              padding: '4px 8px',
              background: 'var(--ha-surface-raised)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
              color: 'var(--ha-text-primary)',
              fontSize: 'var(--ha-text-sm)',
            }}
            autoFocus
          />
          <span style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)' }}>days</span>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{data.retentionDays}</span>
        <span style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)' }}>days</span>
      </div>
    );
  };

  const ActionsCell = (params: { data: unknown }): JSX.Element => {
    const data = params.data as RetentionPolicyDTO;
    const isEditing = editingRows.has(data.dataType);
    const isSaving = updateMutation.isPending;

    if (isEditing) {
      return (
        <div style={{ display: 'flex', gap: 8 }}>
          <HaButton variant="primary" size="sm" onClick={() => handleSave(data.dataType)} isLoading={isSaving}>
            <Save size={14} />
            Save
          </HaButton>
          <HaButton variant="secondary" size="sm" onClick={() => handleCancel(data.dataType)} disabled={isSaving}>
            Cancel
          </HaButton>
        </div>
      );
    }

    return (
      <HaButton variant="secondary" size="sm" onClick={() => handleEdit(data.dataType, data.retentionDays)}>
        Edit
      </HaButton>
    );
  };

  const columnDefs: ColDef[] = [
    {
      field: 'dataType',
      headerName: 'Data Type',
      flex: 1,
      minWidth: 150,
      cellStyle: { textTransform: 'capitalize' },
    },
    {
      field: 'retentionDays',
      headerName: 'Retention Period',
      width: 200,
      cellRenderer: RetentionDaysCell,
    },
    {
      field: 'lastModified',
      headerName: 'Last Modified',
      width: 180,
      valueFormatter: (params) =>
        params.value ? new Date(params.value as string).toLocaleString() : '—',
    },
    {
      field: 'modifiedBy',
      headerName: 'Modified By',
      width: 150,
    },
    {
      headerName: 'Actions',
      colId: 'actions',
      width: 180,
      pinned: 'right',
      sortable: false,
      resizable: false,
      cellRenderer: ActionsCell,
    },
  ];

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <SiemPageHeader title="Data Retention" />
        <LoadingState rows={8} />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <SiemPageHeader title="Data Retention" />
        <div style={{ padding: 24 }}>
          <ErrorState
            title="Failed to load retention policies"
            message={error instanceof Error ? error.message : 'Unknown error'}
          />
        </div>
      </div>
    );
  }

  const isEmpty = !policies || policies.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SiemPageHeader title="Data Retention" />

      <div style={{ padding: 24 }}>
        {/* Global default retention */}
        <div
          style={{
            background: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            padding: '16px',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div
                style={{
                  fontSize: 'var(--ha-text-sm)',
                  fontWeight: 500,
                  color: 'var(--ha-text-primary)',
                  marginBottom: '4px',
                }}
              >
                Default Retention Policy
              </div>
              <div style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
                Applied to data types without a specific policy
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="number"
                value={defaultRetention}
                onChange={(e) => setDefaultRetention(parseInt(e.target.value, 10) || 30)}
                min={1}
                max={3650}
                style={{
                  width: '80px',
                  padding: '6px 8px',
                  background: 'var(--ha-surface-raised)',
                  border: '1px solid var(--ha-border)',
                  borderRadius: 'var(--ha-radius-base)',
                  color: 'var(--ha-text-primary)',
                  fontSize: 'var(--ha-text-sm)',
                }}
              />
              <span style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)' }}>days</span>
              <HaButton variant="primary" size="sm" onClick={handleSaveDefault} isLoading={updateMutation.isPending}>
                Save Default
              </HaButton>
            </div>
          </div>
        </div>

        {isEmpty ? (
          <EmptyState
            icon={<Database size={48} />}
            title="No retention policies configured"
            description="Data retention policies control how long data is kept before automatic deletion."
          />
        ) : (
          <div style={{ height: 'calc(100vh - 280px)' }}>
            <SiemDataGrid
              columnDefs={columnDefs}
              rowData={policies}
              height="100%"
              getRowId={(params) => (params.data as RetentionPolicyDTO).dataType}
            />
          </div>
        )}
      </div>
    </div>
  );
}
