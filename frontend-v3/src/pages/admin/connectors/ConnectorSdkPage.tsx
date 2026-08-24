import { useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Plus, RefreshCw, ShieldCheck, Unplug, Upload } from 'lucide-react';

import {
  connectorService,
  type ConnectorCatalogEntry,
  type ConnectorInstance,
  type ConnectorPromoteResult,
  type ConnectorStagedAlert,
} from '@/services/connectorService';
import { useAuthStore } from '@/store/auth.store';

import './ConnectorSdkPage.css';

/**
 * Admin surface for the typed Connector SDK catalog + instances + staged promote.
 * Schema-driven create form — no per-vendor hardcoded field lists.
 * Promote writes labeled connector-promoted docs only (never v3-hive-alert-*).
 */
export function ConnectorSdkPage(): JSX.Element {
  const { hasRole } = useAuthStore();
  const canManage = hasRole('ROLE_ADMIN') || hasRole('ROLE_SOC_MANAGER');
  /** Backend promote endpoints require ROLE_ADMIN only. */
  const canPromote = hasRole('ROLE_ADMIN');
  const queryClient = useQueryClient();
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<number | null>(null);
  const [selectedStagingIds, setSelectedStagingIds] = useState<Set<number>>(new Set());
  const [name, setName] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: ['ha-connectors-catalog'],
    queryFn: ({ signal }) => connectorService.listCatalog(signal),
    enabled: canManage,
  });
  const instancesQuery = useQuery({
    queryKey: ['ha-connectors-instances'],
    queryFn: ({ signal }) => connectorService.listInstances(signal),
    enabled: canManage,
  });

  const stagedQuery = useQuery({
    queryKey: ['ha-connectors-staged-alerts', selectedInstanceId],
    queryFn: ({ signal }) => {
      if (selectedInstanceId === null) {
        return Promise.reject(new Error('No instance selected'));
      }
      return connectorService.listStagedAlerts(selectedInstanceId, { signal, limit: 50 });
    },
    enabled: canManage && selectedInstanceId !== null,
  });

  const selected: ConnectorCatalogEntry | undefined = useMemo(
    () => catalogQuery.data?.find((c) => c.connectorId === selectedCatalogId),
    [catalogQuery.data, selectedCatalogId]
  );

  const selectedInstance: ConnectorInstance | undefined = useMemo(
    () => instancesQuery.data?.find((i) => i.id === selectedInstanceId),
    [instancesQuery.data, selectedInstanceId]
  );

  const pendingSelectedIds = useMemo(() => {
    const alerts = stagedQuery.data?.alerts ?? [];
    return [...selectedStagingIds].filter((id) => {
      const row = alerts.find((a) => a.id === id);
      return row?.status === 'PENDING';
    });
  }, [selectedStagingIds, stagedQuery.data?.alerts]);

  const createMutation = useMutation({
    mutationFn: () =>
      connectorService.create({
        connectorId: selectedCatalogId ?? undefined,
        name: name.trim(),
        enabled: true,
        config,
      }),
    onSuccess: () => {
      setMessage('Instance created (secrets stored encrypted; never returned).');
      setName('');
      setConfig({});
      void queryClient.invalidateQueries({ queryKey: ['ha-connectors-instances'] });
    },
    onError: (err: unknown) => {
      setMessage(err instanceof Error ? err.message : 'Create failed');
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: number) => connectorService.test(id),
    onSuccess: (result) => {
      setMessage(result.ok ? `Test OK: ${result.message}` : `Test failed: ${result.message}`);
      void queryClient.invalidateQueries({ queryKey: ['ha-connectors-instances'] });
    },
    onError: (err: unknown) => {
      setMessage(err instanceof Error ? err.message : 'Test failed');
    },
  });

  const promoteOneMutation = useMutation({
    mutationFn: (id: number) => connectorService.promoteStagedAlert(id),
    onSuccess: (result) => {
      setMessage(formatPromoteMessage(result));
      setSelectedStagingIds(new Set());
      void queryClient.invalidateQueries({
        queryKey: ['ha-connectors-staged-alerts', selectedInstanceId],
      });
    },
    onError: (err: unknown) => {
      setMessage(err instanceof Error ? err.message : 'Promote failed');
    },
  });

  const promoteBatchMutation = useMutation({
    mutationFn: (ids: number[]) => connectorService.promoteStagedAlerts(ids),
    onSuccess: (result) => {
      setMessage(formatPromoteMessage(result));
      setSelectedStagingIds(new Set());
      void queryClient.invalidateQueries({
        queryKey: ['ha-connectors-staged-alerts', selectedInstanceId],
      });
    },
    onError: (err: unknown) => {
      setMessage(err instanceof Error ? err.message : 'Batch promote failed');
    },
  });

  const promotePending = promoteOneMutation.isPending || promoteBatchMutation.isPending;

  if (!canManage) {
    return (
      <section className="ha-connector-page">
        <header className="ha-connector-page__header">
          <h1>Connectors</h1>
        </header>
        <p className="ha-connector-page__muted">
          Required permission: Platform Administrator or SOC Manager.
        </p>
      </section>
    );
  }

  return (
    <section className="ha-connector-page">
      <header className="ha-connector-page__header">
        <div>
          <span className="ha-connector-page__eyebrow">ADMINISTRATION · CONNECTOR SDK</span>
          <h1>Typed connectors</h1>
          <p className="ha-connector-page__muted">
            Catalog-driven vendor connectors (schema / test / fetch / normalize / capabilities).
            Staged alerts promote to labeled connector-promoted docs only — not SIEM alert indices.
            STAGING CANDIDATE — live vendor credentials not production-verified.
          </p>
        </div>
        <button
          type="button"
          className="ha-connector-btn"
          onClick={() => {
            void catalogQuery.refetch();
            void instancesQuery.refetch();
            if (selectedInstanceId !== null) void stagedQuery.refetch();
          }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </header>

      {message && <div className="ha-connector-banner">{message}</div>}

      <div className="ha-connector-grid">
        <section className="ha-connector-panel" aria-label="Connector catalog">
          <h2>
            <PackageIcon /> Catalog ({catalogQuery.data?.length ?? 0})
          </h2>
          {catalogQuery.isLoading && <p className="ha-connector-page__muted">Loading catalog…</p>}
          {catalogQuery.isError && (
            <p className="ha-connector-page__error">
              {catalogQuery.error instanceof Error
                ? catalogQuery.error.message
                : 'Catalog unavailable'}
            </p>
          )}
          <ul className="ha-connector-list">
            {(catalogQuery.data ?? []).map((entry) => (
              <li key={entry.connectorId}>
                <button
                  type="button"
                  className="ha-connector-card"
                  data-selected={selectedCatalogId === entry.connectorId}
                  onClick={() => {
                    setSelectedCatalogId(entry.connectorId);
                    const defaults: Record<string, string> = {};
                    entry.fields.forEach((f) => {
                      if (f.defaultValue) defaults[f.name] = f.defaultValue;
                    });
                    setConfig(defaults);
                    setName(`${entry.connectorName} · prod`);
                  }}
                >
                  <strong>{entry.connectorName}</strong>
                  <span>
                    {entry.connectorId} · {entry.category}
                  </span>
                  <small>{entry.capabilities.join(' · ')}</small>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="ha-connector-panel" aria-label="Create instance">
          <h2>
            <Plus size={16} /> Configure instance
          </h2>
          {!selected && (
            <p className="ha-connector-page__muted">Select a catalog entry to configure.</p>
          )}
          {selected && (
            <form
              className="ha-connector-form"
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
            >
              <p className="ha-connector-page__muted">{selected.description}</p>
              <label>
                Instance name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Display name"
                />
              </label>
              {selected.fields.map((field) => (
                <label key={field.name}>
                  {field.label}
                  {field.required ? ' *' : ''}
                  <input
                    type={field.secret ? 'password' : 'text'}
                    required={field.required}
                    autoComplete="off"
                    value={config[field.name] ?? ''}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                    placeholder={field.helpText ?? (field.secret ? '••••••••' : undefined)}
                  />
                </label>
              ))}
              <button
                type="submit"
                className="ha-connector-btn ha-connector-btn--primary"
                disabled={createMutation.isPending}
              >
                <ShieldCheck size={14} /> Save instance
              </button>
            </form>
          )}
        </section>

        <section className="ha-connector-panel ha-connector-panel--wide" aria-label="Instances">
          <h2>
            <Unplug size={16} /> Instances ({instancesQuery.data?.length ?? 0})
          </h2>
          {instancesQuery.isLoading && <p className="ha-connector-page__muted">Loading…</p>}
          {instancesQuery.isError && (
            <p className="ha-connector-page__error">
              {instancesQuery.error instanceof Error
                ? instancesQuery.error.message
                : 'Instances unavailable'}
            </p>
          )}
          <table className="ha-connector-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Connector</th>
                <th>Secrets</th>
                <th>Last test</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(instancesQuery.data ?? []).map((row: ConnectorInstance) => (
                <tr
                  key={row.id}
                  data-selected={selectedInstanceId === row.id}
                  className="ha-connector-table__row--selectable"
                  onClick={() => {
                    setSelectedInstanceId(row.id);
                    setSelectedStagingIds(new Set());
                  }}
                >
                  <td>
                    <strong>{row.name}</strong>
                    <div className="ha-connector-page__muted">
                      {row.enabled ? 'Enabled' : 'Disabled'}
                      {selectedInstanceId === row.id ? ' · Selected' : ''}
                    </div>
                  </td>
                  <td>
                    {row.connectorName}
                    <div className="ha-connector-page__muted">{row.connectorId}</div>
                  </td>
                  <td className="ha-connector-mono">
                    {row.secretFieldsConfigured.length
                      ? row.secretFieldsConfigured.join(', ')
                      : 'None'}
                  </td>
                  <td>
                    {row.lastTestOk === null
                      ? 'Not tested'
                      : row.lastTestOk
                        ? 'OK'
                        : 'Failed'}
                    <div className="ha-connector-page__muted">{row.lastTestMessage ?? '—'}</div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ha-connector-btn"
                      disabled={testMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        testMutation.mutate(row.id);
                      }}
                    >
                      Test
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(instancesQuery.data ?? []).length === 0 && !instancesQuery.isLoading && (
            <p className="ha-connector-page__muted">No instances yet.</p>
          )}
        </section>

        <section
          className="ha-connector-panel ha-connector-panel--wide"
          aria-label="Staged connector alerts"
        >
          <div className="ha-connector-panel__toolbar">
            <h2>
              <Upload size={16} /> Staged alerts
              {selectedInstance
                ? ` · ${selectedInstance.name}`
                : ''}{' '}
              ({stagedQuery.data?.count ?? 0})
            </h2>
            {canPromote && pendingSelectedIds.length > 0 && (
              <button
                type="button"
                className="ha-connector-btn ha-connector-btn--primary"
                disabled={promotePending}
                onClick={() => promoteBatchMutation.mutate(pendingSelectedIds)}
              >
                Promote selected ({pendingSelectedIds.length})
              </button>
            )}
          </div>

          <p className="ha-connector-page__muted">
            PostgreSQL staging queue ({stagedQuery.data?.destination ?? 'ha_connector_alert_staging'}
            ). Promote writes labeled connector-promoted documents — not correlated SIEM alerts.
          </p>

          {selectedInstanceId === null && (
            <p className="ha-connector-page__muted">Select an instance to list staged alerts.</p>
          )}

          {selectedInstanceId !== null && stagedQuery.isLoading && (
            <p className="ha-connector-page__muted">Loading staged alerts…</p>
          )}

          {selectedInstanceId !== null && stagedQuery.isError && (
            <p className="ha-connector-page__error">
              {stagedQuery.error instanceof Error
                ? stagedQuery.error.message
                : 'Staged alerts unavailable'}
            </p>
          )}

          {selectedInstanceId !== null &&
            stagedQuery.isSuccess &&
            (stagedQuery.data.alerts.length === 0 ? (
              <p className="ha-connector-page__muted">
                No staged alerts for this instance. Ingest must land in the staging queue first.
              </p>
            ) : (
              <table className="ha-connector-table">
                <thead>
                  <tr>
                    {canPromote && <th aria-label="Select" />}
                    <th>Status</th>
                    <th>Title / external id</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {stagedQuery.data.alerts.map((row: ConnectorStagedAlert) => {
                    const isPending = row.status === 'PENDING';
                    const checked = selectedStagingIds.has(row.id);
                    return (
                      <tr key={row.id}>
                        {canPromote && (
                          <td>
                            <input
                              type="checkbox"
                              disabled={!isPending || promotePending}
                              checked={checked}
                              aria-label={`Select staged alert ${row.id}`}
                              onChange={() => {
                                setSelectedStagingIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(row.id)) next.delete(row.id);
                                  else next.add(row.id);
                                  return next;
                                });
                              }}
                            />
                          </td>
                        )}
                        <td>
                          <span
                            className="ha-connector-status"
                            data-status={row.status.toLowerCase()}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td>
                          <strong>{row.title?.trim() || 'Untitled'}</strong>
                          <div className="ha-connector-mono">{row.externalId}</div>
                        </td>
                        <td>
                          <span className="ha-connector-page__muted">
                            {formatTimestamp(row.alertCreatedAt ?? row.ingestedAt)}
                          </span>
                        </td>
                        <td>
                          {canPromote && isPending ? (
                            <button
                              type="button"
                              className="ha-connector-btn"
                              disabled={promotePending}
                              onClick={() => promoteOneMutation.mutate(row.id)}
                            >
                              Promote
                            </button>
                          ) : (
                            <span className="ha-connector-page__muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}

          {!canPromote && selectedInstanceId !== null && (
            <p className="ha-connector-page__muted">
              Promote requires Platform Administrator. SOC Manager can view the staging queue.
            </p>
          )}
        </section>
      </div>
    </section>
  );
}

function formatPromoteMessage(result: ConnectorPromoteResult): string {
  const parts = [
    `Promote batch ${result.promoteBatchId}: ${result.promoted} promoted`,
    `${result.failed} failed`,
    `${result.skipped} skipped`,
    `of ${result.requested} requested`,
  ];
  const dest = result.destinationIndex || result.indexType || 'connector-promoted';
  return `${parts.join(', ')} → ${dest}`;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function PackageIcon(): JSX.Element {
  return <Link2 size={16} />;
}
