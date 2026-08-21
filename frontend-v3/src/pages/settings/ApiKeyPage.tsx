/**
 * ApiKeyPage — /settings/api-keys
 *
 * Lists all API keys via SiemDataGrid, opens HaApiKeyCreateModal to create a
 * new key, and shows HaApiKeyTokenDialog for the one-time plaintext token
 * display immediately after creation.
 *
 * Token state invariants (Req 7.3, 7.4):
 *   - `pendingToken` lives only in local useState.
 *   - It is set to the plaintext string received from POST /api/ha-admin/api-keys.
 *   - It is cleared (set to null) when the user clicks "I have copied the key".
 *   - It NEVER enters Zustand or localStorage.
 *
 * Security invariants:
 *   - No `any` types (Req 13.8).
 *   - No hex color literals — all colors via `--ha-*` tokens (Req 13.9).
 *
 * Requirements: 7.2, 7.3, 7.4, 7.5, 13.5, 13.7, 13.8, 13.9
 */

import { useState, useMemo } from 'react';

import type { ColDef } from 'ag-grid-community';

import { HaApiKeyCreateModal } from '@/components/ha-api-key-create-modal/HaApiKeyCreateModal';
import { HaApiKeyTokenDialog } from '@/components/ha-api-key-token-dialog/HaApiKeyTokenDialog';
import { HaButton } from '@/components/ha-button/HaButton';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { useApiKeys } from '@/hooks/useApiKeys';
import { useRevokeApiKey } from '@/hooks/useRevokeApiKey';
import type { HaApiKeyRecord, HaApiKeyStatus } from '@/types/apiKey.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function statusColor(status: HaApiKeyStatus): string {
  if (status === 'active') return 'var(--ha-positive)';
  if (status === 'revoked') return 'var(--ha-critical)';
  return 'var(--ha-high)'; // expired
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApiKeyPage(): JSX.Element {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  /**
   * Plaintext token lives exclusively in this local state (Req 7.4).
   * null  → no dialog shown
   * string → HaApiKeyTokenDialog is rendered
   */
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  const { data: keys, isPending: loadingKeys } = useApiKeys();
  const { mutate: revoke, isPending: revoking } = useRevokeApiKey();

  // ── Column definitions ───────────────────────────────────────────────────

  const columnDefs: ColDef[] = useMemo(
    (): ColDef[] => [
      {
        headerName: 'Name',
        field: 'name',
        flex: 2,
        minWidth: 160,
        cellStyle: { color: 'var(--ha-text-primary)', fontFamily: 'Inter, sans-serif' } as Record<string, string>,
      },
      {
        headerName: 'Key Prefix',
        field: 'keyPrefix',
        flex: 1,
        minWidth: 120,
        cellStyle: {
          color: 'var(--ha-text-secondary)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.8125rem',
        } as Record<string, string>,
      },
      {
        headerName: 'Scopes',
        field: 'scopes',
        flex: 2,
        minWidth: 180,
        valueFormatter: (params: { value: string[] }) => params.value.join(', '),
        cellStyle: { color: 'var(--ha-text-secondary)', fontFamily: 'Inter, sans-serif' } as Record<string, string>,
      },
      {
        headerName: 'Status',
        field: 'status',
        flex: 1,
        minWidth: 100,
        cellRenderer: (params: { value: HaApiKeyStatus }) => (
          <span
            style={{
              color: statusColor(params.value),
              fontWeight: 600,
              textTransform: 'capitalize',
            }}
          >
            {params.value}
          </span>
        ),
      },
      {
        headerName: 'Created',
        field: 'createdAt',
        flex: 1,
        minWidth: 160,
        valueFormatter: (params: { value: string | null }) => formatDate(params.value),
        cellStyle: {
          color: 'var(--ha-text-secondary)',
          fontFamily: 'Inter, sans-serif',
          fontVariantNumeric: 'tabular-nums',
        } as Record<string, string>,
      },
      {
        headerName: 'Expires',
        field: 'expiresAt',
        flex: 1,
        minWidth: 160,
        valueFormatter: (params: { value: string | null }) => formatDate(params.value),
        cellStyle: {
          color: 'var(--ha-text-secondary)',
          fontFamily: 'Inter, sans-serif',
          fontVariantNumeric: 'tabular-nums',
        } as Record<string, string>,
      },
      {
        headerName: 'Actions',
        sortable: false,
        filter: false,
        flex: 1,
        minWidth: 110,
        cellRenderer: (params: { data: HaApiKeyRecord }) => {
          const row = params.data;
          const isRevoked = row.status === 'revoked';
          return (
            <HaButton
              variant="danger"
              isDisabled={isRevoked || revoking}
              onClick={() => revoke(row.id)}
              aria-label={`Revoke API key ${row.name}`}
            >
              {isRevoked ? 'Revoked' : 'Revoke'}
            </HaButton>
          );
        },
      },
    ],
    [revoke, revoking],
  );

  // ── Token handlers ───────────────────────────────────────────────────────

  const handleTokenReceived = (token: string): void => {
    // Store plaintext token only in local state — never Zustand / localStorage.
    setPendingToken(token);
  };

  const handleAcknowledge = (): void => {
    // Clear the plaintext token from state (Req 7.4).
    setPendingToken(null);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--ha-background)',
        color: 'var(--ha-text-primary)',
      }}
    >
      <SiemPageHeader
        title="API Keys"
        description="Manage API keys for automated access to HiveArmor."
        actions={
          <HaButton
            variant="primary"
            onClick={() => setIsCreateOpen(true)}
            aria-label="Open create API key form"
          >
            Create API Key
          </HaButton>
        }
      />

      <div style={{ flex: 1, padding: '0 24px 24px' }}>
        <SiemDataGrid
          columnDefs={columnDefs}
          rowData={keys ?? []}
          loading={loadingKeys}
          getRowId={(params) => (params.data as HaApiKeyRecord).id}
          height="100%"
          defaultColDef={{ sortable: true, filter: false, resizable: true }}
        />
      </div>

      {/* Create modal */}
      <HaApiKeyCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onTokenReceived={handleTokenReceived}
      />

      {/* One-time token dialog — only rendered while pendingToken is non-null */}
      {pendingToken !== null && (
        <HaApiKeyTokenDialog
          token={pendingToken}
          onAcknowledge={handleAcknowledge}
        />
      )}
    </div>
  );
}
