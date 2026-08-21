/**
 * AdminConnectionKeysPage — Admin: Connection Keys (ADM-06)
 */

import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import { Copy, Key, Plus, Trash2 } from 'lucide-react';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaButton } from '@/components/ha-button/HaButton';
import { HaConfirmationModal } from '@/components/ha-confirmation-modal/HaConfirmationModal';
import { HaModal } from '@/components/ha-modal/HaModal';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { HaTextInput } from '@/components/ha-text-input/HaTextInput';
import { LoadingState } from '@/components/loading-state/LoadingState';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import {
  createConnectionKey,
  deleteConnectionKey,
  getConnectionKeys,
} from '@/services/connection-keys.service';
import type {
  ConnectionKeyDTO,
  CreateConnectionKeyRequest,
  CreateConnectionKeyResponse,
} from '@/types/connection-key.types';

interface CreateKeyFormData {
  name: string;
  expiryDate?: string;
}

export function AdminConnectionKeysPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [keyDisplayModalOpen, setKeyDisplayModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);
  const [newKeyData, setNewKeyData] = useState<CreateConnectionKeyResponse | null>(null);
  const [formData, setFormData] = useState<CreateKeyFormData>({
    name: '',
    expiryDate: undefined,
  });
  const [copied, setCopied] = useState(false);

  const { data: keys, isLoading, isError, error } = useQuery({
    queryKey: ['connection-keys'],
    queryFn: getConnectionKeys,
  });

  const createMutation = useMutation({
    mutationFn: (req: CreateConnectionKeyRequest) => createConnectionKey(req),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['connection-keys'] });
      setCreateModalOpen(false);
      setNewKeyData(data);
      setKeyDisplayModalOpen(true);
      setFormData({ name: '', expiryDate: undefined });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteConnectionKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connection-keys'] });
      setDeleteConfirmOpen(false);
      setKeyToDelete(null);
    },
  });

  const handleCreate = () => {
    createMutation.mutate({
      name: formData.name,
      expiryDate: formData.expiryDate,
    });
  };

  const handleDeleteClick = (id: string) => {
    setKeyToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (keyToDelete) {
      deleteMutation.mutate(keyToDelete);
    }
  };

  const handleCopyKey = () => {
    if (newKeyData?.key) {
      navigator.clipboard.writeText(newKeyData.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCloseKeyModal = () => {
    setKeyDisplayModalOpen(false);
    // SECURITY: Clear the raw key from state when modal closes
    setNewKeyData(null);
  };

  const StatusCell = (params: { value: unknown }) => {
    const value = params.value as string;
    const statusColors: Record<string, string> = {
      active: 'var(--ha-positive)',
      revoked: 'var(--ha-text-secondary)',
      expired: 'var(--ha-high)',
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
    const data = params.data as ConnectionKeyDTO;
    return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        onClick={() => handleDeleteClick(data.id)}
        disabled={data.status === 'revoked'}
        style={{
          background: 'none',
          border: 'none',
          cursor: data.status === 'revoked' ? 'not-allowed' : 'pointer',
          color: data.status === 'revoked' ? 'var(--ha-text-secondary)' : 'var(--ha-critical)',
          opacity: data.status === 'revoked' ? 0.5 : 1,
        }}
        aria-label="Revoke key"
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
      field: 'createdDate',
      headerName: 'Created',
      width: 180,
      valueFormatter: (params) =>
        params.value ? new Date(params.value as string).toLocaleString() : '-',
    },
    {
      field: 'lastUsed',
      headerName: 'Last Used',
      width: 180,
      valueFormatter: (params) =>
        params.value ? new Date(params.value as string).toLocaleString() : 'Never',
    },
    {
      field: 'expiryDate',
      headerName: 'Expires',
      width: 180,
      valueFormatter: (params) =>
        params.value ? new Date(params.value as string).toLocaleString() : 'Never',
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      cellRenderer: StatusCell,
    },
    {
      headerName: 'Actions',
      colId: 'actions',
      width: 100,
      pinned: 'right',
      sortable: false,
      resizable: false,
      cellRenderer: ActionsCell,
    },
  ];

  if (isLoading) {
    return (
      <div>
        <SiemPageHeader title="Connection Keys" />
        <LoadingState rows={10} />
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <SiemPageHeader title="Connection Keys" />
        <ErrorState
          title="Failed to load connection keys"
          message={error instanceof Error ? error.message : 'Unknown error'}
        />
      </div>
    );
  }

  const isEmpty = !keys || keys.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SiemPageHeader
        title="Connection Keys"
        description="API keys and connection tokens for programmatic access"
        actions={
          <HaButton
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setCreateModalOpen(true)}
          >
            Create Key
          </HaButton>
        }
      />

      <div style={{ flex: 1, padding: 24 }}>
        {isEmpty ? (
          <EmptyState
            icon={<Key size={48} />}
            title="No connection keys configured"
            description="Create an API key to enable programmatic access to HiveArmor."
            action={
              <HaButton
                variant="primary"
                icon={<Plus size={16} />}
                onClick={() => setCreateModalOpen(true)}
              >
                Create Key
              </HaButton>
            }
          />
        ) : (
          <div style={{ height: '100%' }}>
            <SiemDataGrid
              columnDefs={columnDefs}
              rowData={keys}
              height="100%"
              getRowId={(params) => (params.data as ConnectionKeyDTO).id}
            />
          </div>
        )}
      </div>

      {/* Create Key Modal */}
      <HaModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create Connection Key"
        width={480}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
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
              Key Name
            </label>
            <HaTextInput
              value={formData.name}
              onChange={(value) => setFormData({ ...formData, name: value })}
              placeholder="e.g., CI/CD Pipeline Key"
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
              Expiry Date (optional)
            </label>
            <input
              type="datetime-local"
              value={formData.expiryDate ?? ''}
              onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: 'var(--ha-text-base)',
                color: 'var(--ha-text-primary)',
                backgroundColor: 'var(--ha-surface-raised)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
              }}
            />
          </div>

          <div
            style={{
              padding: 12,
              background: 'var(--ha-fill-high-subtle)',
              border: '1px solid var(--ha-high)',
              borderRadius: 'var(--ha-radius-base)',
              fontSize: 'var(--ha-text-xs)',
              color: 'var(--ha-text-primary)',
            }}
          >
            <strong>Warning:</strong> The key will be displayed only once. Copy it immediately and
            store it securely.
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <HaButton variant="secondary" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </HaButton>
            <HaButton
              variant="primary"
              onClick={handleCreate}
              isLoading={createMutation.isPending}
              disabled={!formData.name}
            >
              Create
            </HaButton>
          </div>
        </div>
      </HaModal>

      {/* Key Display Modal — SECURITY: Only shown once, key cleared on close */}
      <HaModal
        isOpen={keyDisplayModalOpen}
        onClose={handleCloseKeyModal}
        title="Connection Key Created"
        width={600}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
          <div
            style={{
              padding: 16,
              background: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
            }}
          >
            <div style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)', marginBottom: 8 }}>
              Key Name
            </div>
            <div style={{ fontSize: 'var(--ha-text-base)', color: 'var(--ha-text-primary)' }}>
              {newKeyData?.name}
            </div>
          </div>

          <div
            style={{
              padding: 16,
              background: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
            }}
          >
            <div style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)', marginBottom: 8 }}>
              API Key (copy this now — it will not be shown again)
            </div>
            <div
              style={{
                fontSize: 'var(--ha-text-sm)',
                fontFamily: 'var(--ha-font-mono)',
                color: 'var(--ha-text-primary)',
                wordBreak: 'break-all',
                padding: 12,
                background: 'var(--ha-background)',
                borderRadius: 'var(--ha-radius-sm)',
              }}
            >
              {newKeyData?.key}
            </div>
          </div>

          <div
            style={{
              padding: 12,
              background: 'var(--ha-fill-critical-subtle)',
              border: '1px solid var(--ha-critical)',
              borderRadius: 'var(--ha-radius-base)',
              fontSize: 'var(--ha-text-xs)',
              color: 'var(--ha-text-primary)',
            }}
          >
            <strong>Important:</strong> This key will never be displayed again. Copy it now and
            store it securely. If you lose this key, you must create a new one.
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <HaButton variant="secondary" icon={<Copy size={16} />} onClick={handleCopyKey}>
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </HaButton>
            <HaButton variant="primary" onClick={handleCloseKeyModal}>
              Done
            </HaButton>
          </div>
        </div>
      </HaModal>

      <HaConfirmationModal
        isOpen={deleteConfirmOpen}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Revoke Connection Key"
        message="Are you sure you want to revoke this key? Any services using this key will immediately lose access."
        confirmLabel="Revoke"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  );
}
