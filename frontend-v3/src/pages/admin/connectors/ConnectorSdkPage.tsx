import { useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CircleSlash2,
  Link2,
  LockKeyhole,
  Plug,
  Plus,
  RefreshCw,
  ShieldCheck,
  Unplug,
  Upload,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { StatusDock } from '@/components/status-dock';
import { ROUTES } from '@/constants/routes.constants';
import { useEpsStream } from '@/hooks/useEpsStream';
import {
  CONNECTOR_FETCH_ALERTS_DRY_RUN_ONLY,
  CONNECTOR_PROMOTE_ADMIN_ONLY,
  CONNECTOR_PROMOTE_DENIED_TITLE,
  CONNECTOR_VENDOR_LIVE_VERIFIED,
} from '@/services/connector.capabilities';
import {
  connectorService,
  type ConnectorCatalogEntry,
  type ConnectorInstance,
  type ConnectorPromoteResult,
  type ConnectorStagedAlert,
} from '@/services/connectorService';
import { useAuthStore } from '@/store/auth.store';

import './ConnectorSdkPage.css';

/** Bundle-visible job sentence — typed SDK admin, not legacy integrations or SOAR catalog. */
export const CONNECTOR_SDK_JOB_SENTENCE =
  'Typed connector SDK — configure schema-driven vendor instances, bounded connection tests, staging ingest, and admin-governed promote to labeled connector-promoted docs. Legacy integration inventory lives on Integrations; SOAR action readiness lives on Response Library — vendor live credentials are not production-verified.';

const CONNECTOR_PROJECTION_NOTE =
  'Catalog and instances via GET /api/ha-connectors/*. Secrets are write-only and never returned. Staging queue is PostgreSQL (ha_connector_alert_staging); promote writes v3-hive-connector-promoted-* only — not correlated SIEM alert indices. Vendor isolate mesh stays feature-flagged off until live proofs land.';

export function ConnectorSdkPage(): JSX.Element {
  const eps = useEpsStream();
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

  const catalogCount = catalogQuery.data?.length ?? 0;
  const instanceCount = instancesQuery.data?.length ?? 0;
  const testedCount =
    instancesQuery.data?.filter((row) => row.lastTestOk !== null).length ?? 0;
  const stagedCount = stagedQuery.data?.count ?? 0;
  const pendingStaged =
    stagedQuery.data?.alerts.filter((row) => row.status === 'PENDING').length ?? 0;

  const refreshAll = (): void => {
    void catalogQuery.refetch();
    void instancesQuery.refetch();
    if (selectedInstanceId !== null) void stagedQuery.refetch();
  };

  if (!canManage) {
    return (
      <section className="cnx-page" aria-label="Connector SDK">
        <header className="cnx-header">
          <div className="cnx-header__identity">
            <span className="cnx-header__mark">
              <Plug size={18} aria-hidden="true" />
            </span>
            <div className="cnx-header__copy">
              <div className="cnx-header__eyebrow">
                <span>ADMINISTRATION · CONNECTOR SDK</span>
                <span className="cnx-header__badge">STAGING CANDIDATE</span>
              </div>
              <h1>Typed Connectors</h1>
              <p className="cnx-header__job">{CONNECTOR_SDK_JOB_SENTENCE}</p>
            </div>
          </div>
        </header>
        <div className="cnx-empty" role="status">
          <CircleSlash2 size={30} />
          <strong>Connector SDK access restricted</strong>
          <span>Required permission: Platform Administrator or SOC Manager.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="cnx-page" aria-label="Connector SDK">
      <header className="cnx-header">
        <div className="cnx-header__identity">
          <span className="cnx-header__mark">
            <Plug size={18} aria-hidden="true" />
          </span>
          <div className="cnx-header__copy">
            <div className="cnx-header__eyebrow">
              <span>ADMINISTRATION · CONNECTOR SDK</span>
              <span className="cnx-header__badge">STAGING CANDIDATE</span>
            </div>
            <h1>Typed Connectors</h1>
            <p className="cnx-header__job">{CONNECTOR_SDK_JOB_SENTENCE}</p>
            <p className="cnx-page__projection-note" role="note">
              {CONNECTOR_PROJECTION_NOTE}
              {!CONNECTOR_VENDOR_LIVE_VERIFIED &&
                ' Vendor live credentials are not production-verified.'}
              {CONNECTOR_FETCH_ALERTS_DRY_RUN_ONLY &&
                ' fetch-alerts without persist remains dry-run preview only.'}
            </p>
          </div>
        </div>
        <div className="cnx-header__actions">
          <button type="button" className="cnx-button" onClick={refreshAll}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </header>

      <p className="cnx-page__meta">
        <Link to={ROUTES.ADMIN_INTEGRATIONS}>Integrations</Link>
        <span aria-hidden="true">·</span>
        <Link to={`${ROUTES.ADMIN_INTEGRATIONS}?view=connectors`}>Connections</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.RESPONSE_LIBRARY}>Response Library</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.RESPONSE_PLAYBOOKS}>Playbooks</Link>
        <span aria-hidden="true">·</span>
        <Link to="/settings/api-keys">Service access</Link>
        <span aria-hidden="true">·</span>
        <span className="cnx-page__access">SOC Manager · Platform Administrator</span>
      </p>

      <section className="cnx-summary" aria-label="Connector SDK summary">
        <div>
          <span>Catalog vendors</span>
          <strong>{catalogCount}</strong>
          <small>typed registry</small>
        </div>
        <div>
          <span>Instances</span>
          <strong>{instanceCount}</strong>
          <small>saved configurations</small>
        </div>
        <div data-tone={testedCount < instanceCount && instanceCount > 0 ? 'warning' : undefined}>
          <span>Tested</span>
          <strong>{testedCount}</strong>
          <small>bounded dry tests</small>
        </div>
        <div>
          <span>Staged · selected</span>
          <strong>{selectedInstanceId === null ? '—' : stagedCount}</strong>
          <small>{pendingStaged} pending promote</small>
        </div>
        <div>
          <span>Vendor live</span>
          <strong>{CONNECTOR_VENDOR_LIVE_VERIFIED ? 'Verified' : 'Deferred'}</strong>
          <small>credentials not proven</small>
        </div>
      </section>

      {message && <div className="cnx-banner">{message}</div>}

      <div className="cnx-grid">
        <section className="cnx-panel" aria-label="Connector catalog">
          <h2>
            <PackageIcon /> Catalog ({catalogCount})
          </h2>
          {catalogQuery.isLoading && <p className="cnx-muted">Loading catalog…</p>}
          {catalogQuery.isError && (
            <p className="cnx-error">
              {catalogQuery.error instanceof Error
                ? catalogQuery.error.message
                : 'Catalog unavailable'}
            </p>
          )}
          {!catalogQuery.isLoading && !catalogQuery.isError && catalogCount === 0 && (
            <div className="connectors-empty-honesty" role="status">
              <AlertTriangle size={22} />
              <strong>No catalog vendors returned</strong>
              <span>
                The typed connector registry is empty — this is not proof that vendor
                integrations are unavailable.
              </span>
            </div>
          )}
          <ul className="cnx-list">
            {(catalogQuery.data ?? []).map((entry) => (
              <li key={entry.connectorId}>
                <button
                  type="button"
                  className="cnx-card"
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

        <section className="cnx-panel" aria-label="Create instance">
          <h2>
            <Plus size={16} /> Configure instance
          </h2>
          {!selected && (
            <p className="cnx-muted">Select a catalog entry to configure.</p>
          )}
          {selected && (
            <form
              className="cnx-form"
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
            >
              <p className="cnx-muted">{selected.description}</p>
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
                className="cnx-button cnx-button--primary"
                disabled={createMutation.isPending}
              >
                <ShieldCheck size={14} /> Save instance
              </button>
              <p className="cnx-notice">
                <LockKeyhole size={12} />
                Secret fields are encrypted at rest and never returned by list or get.
              </p>
            </form>
          )}
        </section>

        <section className="cnx-panel cnx-panel--wide" aria-label="Instances">
          <h2>
            <Unplug size={16} /> Instances ({instanceCount})
          </h2>
          {instancesQuery.isLoading && <p className="cnx-muted">Loading…</p>}
          {instancesQuery.isError && (
            <p className="cnx-error">
              {instancesQuery.error instanceof Error
                ? instancesQuery.error.message
                : 'Instances unavailable'}
            </p>
          )}
          <table className="cnx-table">
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
                  className="cnx-table__row--selectable"
                  onClick={() => {
                    setSelectedInstanceId(row.id);
                    setSelectedStagingIds(new Set());
                  }}
                >
                  <td>
                    <strong>{row.name}</strong>
                    <div className="cnx-muted">
                      {row.enabled ? 'Enabled' : 'Disabled'}
                      {selectedInstanceId === row.id ? ' · Selected' : ''}
                    </div>
                  </td>
                  <td>
                    {row.connectorName}
                    <div className="cnx-muted">{row.connectorId}</div>
                  </td>
                  <td className="cnx-mono">
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
                    <div className="cnx-muted">{row.lastTestMessage ?? '—'}</div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="cnx-button"
                      disabled={testMutation.isPending}
                      title={
                        CONNECTOR_VENDOR_LIVE_VERIFIED
                          ? undefined
                          : 'Bounded dry test — vendor live credentials not production-verified'
                      }
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
            <div className="connectors-empty-honesty" role="status">
              <Unplug size={22} />
              <strong>No connector instances yet</strong>
              <span>
                Select a catalog vendor and save a configuration. Empty inventory is not proof of
                vendor readiness.
              </span>
            </div>
          )}
        </section>

        <section
          className="cnx-panel cnx-panel--wide"
          aria-label="Staged connector alerts"
        >
          <div className="cnx-panel__toolbar">
            <h2>
              <Upload size={16} /> Staged alerts
              {selectedInstance
                ? ` · ${selectedInstance.name}`
                : ''}{' '}
              ({stagedCount})
            </h2>
            {canPromote && pendingSelectedIds.length > 0 && (
              <button
                type="button"
                className="cnx-button cnx-button--primary"
                disabled={promotePending}
                onClick={() => promoteBatchMutation.mutate(pendingSelectedIds)}
              >
                Promote selected ({pendingSelectedIds.length})
              </button>
            )}
          </div>

          <p className="cnx-muted">
            PostgreSQL staging queue ({stagedQuery.data?.destination ?? 'ha_connector_alert_staging'}
            ). Promote writes labeled connector-promoted documents — not correlated SIEM alerts.
            {CONNECTOR_PROMOTE_ADMIN_ONLY &&
              ' Promote requires Platform Administrator; SOC Manager may view the queue.'}
          </p>

          {selectedInstanceId === null && (
            <p className="cnx-muted">Select an instance to list staged alerts.</p>
          )}

          {selectedInstanceId !== null && stagedQuery.isLoading && (
            <p className="cnx-muted">Loading staged alerts…</p>
          )}

          {selectedInstanceId !== null && stagedQuery.isError && (
            <p className="cnx-error">
              {stagedQuery.error instanceof Error
                ? stagedQuery.error.message
                : 'Staged alerts unavailable'}
            </p>
          )}

          {selectedInstanceId !== null &&
            stagedQuery.isSuccess &&
            (stagedQuery.data.alerts.length === 0 ? (
              <div className="connectors-empty-honesty" role="status">
                <Upload size={22} />
                <strong>No staged alerts for this instance</strong>
                <span>
                  Ingest must land in the staging queue first — empty queue is not proof that
                  vendor fetch succeeded.
                </span>
              </div>
            ) : (
              <table className="cnx-table">
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
                            className="cnx-status"
                            data-status={row.status.toLowerCase()}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td>
                          <strong>{row.title?.trim() || 'Untitled'}</strong>
                          <div className="cnx-mono">{row.externalId}</div>
                        </td>
                        <td>
                          <span className="cnx-muted">
                            {formatTimestamp(row.alertCreatedAt ?? row.ingestedAt)}
                          </span>
                        </td>
                        <td>
                          {canPromote && isPending ? (
                            <button
                              type="button"
                              className="cnx-button"
                              disabled={promotePending}
                              onClick={() => promoteOneMutation.mutate(row.id)}
                            >
                              Promote
                            </button>
                          ) : (
                            <span className="cnx-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}

          {!canPromote && selectedInstanceId !== null && (
            <p className="cnx-muted" title={CONNECTOR_PROMOTE_DENIED_TITLE}>
              Promote requires Platform Administrator. SOC Manager can view the staging queue.
            </p>
          )}
        </section>
      </div>

      <div className="cnx-trust">
        <span>
          <LockKeyhole size={11} />
          Secrets never render after write; promote never targets v3-hive-alert-* indices
        </span>
        <strong>
          {CONNECTOR_VENDOR_LIVE_VERIFIED
            ? 'Vendor live projection current'
            : 'Vendor live credentials deferred — bounded tests and staging only'}
        </strong>
        <span>
          {CONNECTOR_PROMOTE_ADMIN_ONLY
            ? 'Promote · Platform Administrator only'
            : 'Promote authority not proven'}
        </span>
      </div>

      <StatusDock
        className="cnx-status-dock"
        sseConnected={eps.connected}
        eps={eps.eps}
        mode="historical"
        lastUpdated={
          instancesQuery.dataUpdatedAt ? new Date(instancesQuery.dataUpdatedAt) : undefined
        }
      />
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
