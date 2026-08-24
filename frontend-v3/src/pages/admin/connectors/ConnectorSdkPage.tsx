import { useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Plus, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';

import {
  connectorService,
  type ConnectorCatalogEntry,
  type ConnectorInstance,
} from '@/services/connectorService';
import { useAuthStore } from '@/store/auth.store';

import './ConnectorSdkPage.css';

/**
 * Admin surface for the typed Connector SDK catalog + instances.
 * Schema-driven create form — no per-vendor hardcoded field lists.
 */
export function ConnectorSdkPage(): JSX.Element {
  const { hasRole } = useAuthStore();
  const canManage = hasRole('ROLE_ADMIN') || hasRole('ROLE_SOC_MANAGER');
  const queryClient = useQueryClient();
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
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

  const selected: ConnectorCatalogEntry | undefined = useMemo(
    () => catalogQuery.data?.find((c) => c.connectorId === selectedCatalogId),
    [catalogQuery.data, selectedCatalogId]
  );

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
            STAGING CANDIDATE — live vendor credentials not production-verified.
          </p>
        </div>
        <button
          type="button"
          className="ha-connector-btn"
          onClick={() => {
            void catalogQuery.refetch();
            void instancesQuery.refetch();
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
                <tr key={row.id}>
                  <td>
                    <strong>{row.name}</strong>
                    <div className="ha-connector-page__muted">
                      {row.enabled ? 'Enabled' : 'Disabled'}
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
                      onClick={() => testMutation.mutate(row.id)}
                    >
                      Test
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(instancesQuery.data ?? []).length === 0 && (
            <p className="ha-connector-page__muted">No instances yet.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function PackageIcon(): JSX.Element {
  return <Link2 size={16} />;
}
