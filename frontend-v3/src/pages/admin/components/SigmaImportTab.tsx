/**
 * SigmaImportTab.tsx — Task 5.5
 *
 * Renders the "Sigma Import" tab inside RuleImportPage.
 *
 * Layout:
 *   • Status card — last sync time, total rule count, most recent sync mutation counts
 *   • Sync Now button (role / air-gap / pending truth table — Req 5.8/5.9/5.10/5.11)
 *   • SiemDataGrid — 25 rows/page, 32 px row height, columns per Req 5.6
 *   • PatternFly Drawer — opens on row click, shows detectionYaml in Monaco Editor
 *
 * Zero hard-coded hex colours — all colours via var(--ha-*) tokens only (Req 5.13, 8.5).
 * Zero `any` types (Req 5.2, 8.6).
 */

import { useCallback, useMemo, useState } from 'react';

import Editor from '@monaco-editor/react';
import { Spinner } from '@patternfly/react-core';
import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import { AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

import { HaButton } from '@/components/ha-button';
import { HaDrawer } from '@/components/ha-drawer';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useSigmaRules, useSigmaSync } from '@/hooks/useSigmaRules';
import { ROLES } from '@/lib/roles';
import { useAuthStore } from '@/store/auth.store';
import type { SigmaRuleDTO } from '@/types/sigma';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function severityLabel(level: number): string {
  switch (level) {
    case 5:
      return 'Critical';
    case 4:
      return 'High';
    case 3:
      return 'Medium';
    case 2:
      return 'Low';
    default:
      return 'Informational';
  }
}

function severityColor(level: number): string {
  switch (level) {
    case 5:
      return 'var(--ha-critical)';
    case 4:
      return 'var(--ha-high)';
    case 3:
      return 'var(--ha-medium)';
    case 2:
      return 'var(--ha-positive)';
    default:
      return 'var(--ha-text-secondary)';
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StatusCardProps {
  totalRules: number | undefined;
  lastSyncResult: {
    processed: number;
    inserted: number;
    updated: number;
    errors: number;
  } | null;
  lastSyncAt: string | null;
  isLoading: boolean;
}

function StatusCard({
  totalRules,
  lastSyncResult,
  lastSyncAt,
  isLoading,
}: StatusCardProps): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        padding: '16px 24px',
        background: 'var(--ha-surface-primary)',
        borderBottom: '1px solid var(--ha-border)',
        flexWrap: 'wrap',
      }}
    >
      {/* Total rules */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          minWidth: 120,
          padding: '12px 16px',
          background: 'var(--ha-surface-raised)',
          border: '1px solid var(--ha-border)',
          borderRadius: 6,
        }}
      >
        <span
          style={{
            fontSize: 'var(--ha-text-xs)',
            color: 'var(--ha-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Total Rules
        </span>
        <span
          style={{
            fontSize: 'var(--ha-text-2xl)',
            fontWeight: 700,
            color: 'var(--ha-text-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {isLoading ? '…' : (totalRules ?? 0).toLocaleString()}
        </span>
      </div>

      {/* Last sync time */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          minWidth: 180,
          padding: '12px 16px',
          background: 'var(--ha-surface-raised)',
          border: '1px solid var(--ha-border)',
          borderRadius: 6,
        }}
      >
        <span
          style={{
            fontSize: 'var(--ha-text-xs)',
            color: 'var(--ha-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Last Sync
        </span>
        <span
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-primary)',
            fontVariantNumeric: 'tabular-nums',
            fontFamily: 'var(--ha-font-mono)',
          }}
        >
          {formatTimestamp(lastSyncAt)}
        </span>
      </div>

      {/* Most recent sync mutation counts — only shown when data available */}
      {lastSyncResult && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'stretch',
          }}
        >
          {(
            [
              { label: 'Processed', value: lastSyncResult.processed, color: 'var(--ha-text-primary)' },
              { label: 'Inserted', value: lastSyncResult.inserted, color: 'var(--ha-positive)' },
              { label: 'Updated', value: lastSyncResult.updated, color: 'var(--ha-medium)' },
              { label: 'Errors', value: lastSyncResult.errors, color: lastSyncResult.errors > 0 ? 'var(--ha-critical)' : 'var(--ha-text-secondary)' },
            ] as const
          ).map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minWidth: 80,
                padding: '12px 16px',
                background: 'var(--ha-surface-raised)',
                border: '1px solid var(--ha-border)',
                borderRadius: 6,
              }}
            >
              <span
                style={{
                  fontSize: 'var(--ha-text-xs)',
                  color: 'var(--ha-text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontSize: 'var(--ha-text-xl)',
                  fontWeight: 600,
                  color,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sync Now button — honours the truth table (Req 5.8/5.9/5.10/5.11)
// ---------------------------------------------------------------------------

interface SyncNowButtonProps {
  isAdmin: boolean;
  airGap: boolean;
  isPending: boolean;
  onSync: () => void;
}

function SyncNowButton({
  isAdmin,
  airGap,
  isPending,
  onSync,
}: SyncNowButtonProps): JSX.Element | null {
  // Row: role != ADMIN → hidden (Req 5.9)
  if (!isAdmin) return null;

  // Row: ADMIN + airGap == true → disabled with tooltip (Req 5.10)
  if (airGap) {
    return (
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        title="Sigma sync unavailable in air-gap mode"
        data-testid="sync-now-airgap"
      >
        <HaButton
          variant="secondary"
          isDisabled
          icon={<RefreshCw size={16} />}
          aria-label="Sigma sync unavailable in air-gap mode"
        >
          Sync Now
        </HaButton>
      </div>
    );
  }

  // Row: ADMIN + !airGap + pending → disabled with PatternFly Spinner (Req 5.11)
  if (isPending) {
    return (
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        data-testid="sync-now-pending"
      >
        <HaButton
          variant="secondary"
          isDisabled
          icon={<RefreshCw size={16} />}
          aria-label="Sigma sync in progress"
        >
          Sync Now
        </HaButton>
        <Spinner size="md" aria-label="Sync in progress" />
      </div>
    );
  }

  // Row: ADMIN + !airGap + !pending → enabled (Req 5.8)
  return (
    <HaButton
      variant="primary"
      onClick={onSync}
      icon={<RefreshCw size={16} />}
      data-testid="sync-now-enabled"
      aria-label="Trigger Sigma rule sync from SigmaHQ"
    >
      Sync Now
    </HaButton>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SigmaImportTab(): JSX.Element {
  // Auth state
  const { hasRole } = useAuthStore();
  const isAdmin = hasRole(ROLES.ADMIN);

  // App config — reads airGap flag from the backend (Req 5.10)
  const { airGap } = useAppConfig();

  // Data hooks
  const { data: rules, isLoading, isError } = useSigmaRules({});
  const syncMutation = useSigmaSync();

  // Drawer state
  const [drawerRule, setDrawerRule] = useState<SigmaRuleDTO | null>(null);

  // ---------------------------------------------------------------------------
  // Column definitions — Req 5.6
  // ---------------------------------------------------------------------------
  const columnDefs: ColDef[] = useMemo(
    () => [
      {
        headerName: 'Title',
        field: 'ruleTitle',
        flex: 2,
        minWidth: 200,
        sortable: true,
        resizable: true,
        cellStyle: {
          color: 'var(--ha-text-primary)',
          fontWeight: '500',
        } as Record<string, string>,
      },
      {
        headerName: 'Product / Service',
        colId: 'productService',
        flex: 1,
        minWidth: 120,
        sortable: true,
        resizable: true,
        valueGetter: (params) => {
          const row = params.data as SigmaRuleDTO | undefined;
          if (!row) return '—';
          const parts = [row.logsourceProduct, row.logsourceService].filter(Boolean);
          return parts.length > 0 ? parts.join(' / ') : '—';
        },
        cellStyle: {
          color: 'var(--ha-text-secondary)',
          fontFamily: 'var(--ha-font-mono)',
          fontSize: 'var(--ha-text-xs)',
        } as Record<string, string>,
      },
      {
        headerName: 'Level / Severity',
        field: 'haSeverity',
        width: 140,
        sortable: true,
        resizable: true,
        cellRenderer: (params: { value: number }) => {
          const level = params.value ?? 1;
          return (
            <span
              style={{
                color: severityColor(level),
                fontWeight: 600,
                fontSize: 'var(--ha-text-xs)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {severityLabel(level)}
            </span>
          );
        },
      },
      {
        headerName: 'MITRE Tags',
        field: 'mitreTags',
        flex: 1,
        minWidth: 140,
        sortable: false,
        resizable: true,
        cellRenderer: (params: { value: string | null }) => {
          const tags = params.value;
          if (!tags) {
            return (
              <span style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-xs)' }}>
                —
              </span>
            );
          }
          const tagList = tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 3);
          return (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {tagList.map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: 'var(--ha-text-xs)',
                    padding: '1px 6px',
                    background: 'var(--ha-surface-primary)',
                    border: '1px solid var(--ha-border)',
                    borderRadius: 4,
                    color: 'var(--ha-intelligence)',
                    fontFamily: 'var(--ha-font-mono)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tag}
                </span>
              ))}
              {tags.split(',').length > 3 && (
                <span
                  style={{
                    fontSize: 'var(--ha-text-xs)',
                    color: 'var(--ha-text-secondary)',
                  }}
                >
                  +{tags.split(',').length - 3}
                </span>
              )}
            </div>
          );
        },
      },
      {
        headerName: 'Imported At',
        field: 'importedAt',
        width: 160,
        sortable: true,
        resizable: true,
        cellStyle: {
          fontFamily: 'var(--ha-font-mono)',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 'var(--ha-text-xs)',
          color: 'var(--ha-text-secondary)',
        } as Record<string, string>,
        valueFormatter: (params: { value: string }) => formatTimestamp(params.value),
      },
      {
        headerName: 'Active',
        field: 'active',
        width: 90,
        sortable: true,
        resizable: false,
        cellRenderer: (params: { value: boolean }) =>
          params.value ? (
            <CheckCircle
              size={16}
              style={{ color: 'var(--ha-positive)' }}
              aria-label="Active"
            />
          ) : (
            <AlertTriangle
              size={16}
              style={{ color: 'var(--ha-text-secondary)' }}
              aria-label="Inactive"
            />
          ),
      },
    ],
    []
  );

  // ---------------------------------------------------------------------------
  // Row click → open drawer
  // ---------------------------------------------------------------------------
  const handleRowClicked = useCallback((event: RowClickedEvent) => {
    const rule = event.data as SigmaRuleDTO;
    setDrawerRule(rule);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerRule(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Sync trigger
  // ---------------------------------------------------------------------------
  const handleSync = useCallback(() => {
    syncMutation.mutate();
  }, [syncMutation]);

  // Derive status card data
  const totalRules = rules?.length ?? 0;
  const lastSyncResult = syncMutation.data ?? null;
  // Infer lastSyncAt from the most recently imported rule (best available proxy
  // before a dedicated "lastSyncAt" field is added to the API response).
  const lastSyncAt = useMemo(() => {
    if (!rules || rules.length === 0) return null;
    return rules.reduce((latest, r) => {
      if (!latest) return r.importedAt;
      return r.importedAt > latest ? r.importedAt : latest;
    }, null as string | null);
  }, [rules]);

  // ---------------------------------------------------------------------------
  // Error / loading states
  // ---------------------------------------------------------------------------
  if (isError) {
    return (
      <div
        style={{
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--ha-critical)',
            fontSize: 'var(--ha-text-sm)',
          }}
        >
          <AlertTriangle size={18} />
          <span>Failed to load Sigma rules. The backend returned an error.</span>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--ha-background)',
      }}
    >
      {/* ── Status card + Sync Now ────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          padding: '16px 24px',
          borderBottom: '1px solid var(--ha-border)',
          background: 'var(--ha-surface-primary)',
          flexWrap: 'wrap',
        }}
      >
        <StatusCard
          totalRules={totalRules}
          lastSyncResult={lastSyncResult}
          lastSyncAt={lastSyncAt}
          isLoading={isLoading}
        />

        {/* Sync Now button — truth table per Req 5.8/5.9/5.10/5.11 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px 0',
            flexShrink: 0,
          }}
        >
          <SyncNowButton
            isAdmin={isAdmin}
            airGap={airGap}
            isPending={syncMutation.isPending}
            onSync={handleSync}
          />
        </div>
      </div>

      {/* ── AG Grid ──────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          padding: '0 24px 24px',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <SiemDataGrid
          columnDefs={columnDefs}
          rowData={rules ?? []}
          rowHeight={32}
          paginationPageSize={25}
          loading={isLoading}
          onRowClicked={handleRowClicked}
          height="100%"
          getRowId={(params) => String((params.data as SigmaRuleDTO).id)}
          defaultColDef={{
            sortable: true,
            resizable: true,
            filter: false,
          }}
        />
      </div>

      {/* ── Detail Drawer ─────────────────────────────────────────────────── */}
      <HaDrawer
        isOpen={drawerRule !== null}
        onClose={handleCloseDrawer}
        title={drawerRule?.ruleTitle ?? 'Detection YAML'}
        subtitle={
          drawerRule
            ? `${drawerRule.logsourceProduct ?? '—'}  ·  ${severityLabel(drawerRule.haSeverity)}`
            : undefined
        }
        width={600}
      >
        {drawerRule && (
          <div
            style={{
              height: '100%',
              minHeight: 400,
              border: '1px solid var(--ha-border)',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <Editor
              height="100%"
              language="yaml"
              value={drawerRule.detectionYaml}
              theme="vs-dark"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 13,
                lineNumbers: 'on',
                wordWrap: 'on',
                folding: true,
                renderLineHighlight: 'line',
                scrollbar: {
                  verticalScrollbarSize: 8,
                  horizontalScrollbarSize: 8,
                },
                padding: { top: 12, bottom: 12 },
              }}
            />
          </div>
        )}
      </HaDrawer>
    </div>
  );
}
