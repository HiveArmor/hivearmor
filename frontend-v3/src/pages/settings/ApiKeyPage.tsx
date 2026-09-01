/**
 * API Keys — service access honesty (Prompt 39 / Wave C2 slice 4).
 *
 * Production inventory: GET /api/ha-admin/api-keys; POST create; DELETE revoke.
 * Rotation, scoped delegation, and immutable issuance audit remain fail-closed (AKM-001–AKM-003).
 */

import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CircleSlash2,
  KeyRound,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  API_KEYS_JOB_SENTENCE,
  API_KEYS_PROJECTION_NOTE,
  API_KEYS_ROTATION_FAIL_CLOSED_TITLE,
} from './apiKeys.honesty';
import './ApiKeyPage.css';

import { HaApiKeyCreateModal } from '@/components/ha-api-key-create-modal/HaApiKeyCreateModal';
import { HaApiKeyTokenDialog } from '@/components/ha-api-key-token-dialog/HaApiKeyTokenDialog';
import { HaConfirmationModal } from '@/components/ha-confirmation-modal/HaConfirmationModal';
import { StatusDock } from '@/components/status-dock';
import { ROUTES } from '@/constants/routes.constants';
import { API_KEYS_QUERY_KEY } from '@/hooks/useApiKeys';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useRevokeApiKey } from '@/hooks/useRevokeApiKey';
import {
  API_KEY_ACCESS_DENIED_TITLE,
  API_KEY_DELEGATION_LIVE,
  API_KEY_ISSUANCE_AUDIT_LIVE,
  API_KEY_ROTATION_POLICY_LIVE,
} from '@/services/apiKeys.capabilities';
import { apiKeysService } from '@/services/apiKeys.service';
import { useAuthStore } from '@/store/auth.store';
import type { HaApiKeyRecord } from '@/types/apiKey.types';

const fmtDate = (value: string | null | undefined): string =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : 'Not reported';

export function ApiKeyPage(): JSX.Element {
  const eps = useEpsStream();
  const { hasRole } = useAuthStore();
  const canAdminister = hasRole('ROLE_ADMIN');

  const keysQuery = useQuery({
    queryKey: API_KEYS_QUERY_KEY,
    queryFn: apiKeysService.list,
    enabled: canAdminister,
  });
  const revokeMutation = useRevokeApiKey();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<HaApiKeyRecord | null>(null);

  const keys = useMemo(() => keysQuery.data ?? [], [keysQuery.data]);

  const filteredKeys = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return keys.filter((key) => {
      const statusMatch = statusFilter === 'all' || key.status === statusFilter;
      const textMatch =
        !needle ||
        key.name.toLowerCase().includes(needle) ||
        key.keyPrefix.toLowerCase().includes(needle) ||
        key.scopes.some((scope) => scope.toLowerCase().includes(needle));
      return statusMatch && textMatch;
    });
  }, [keys, query, statusFilter]);

  const activeCount = keys.filter((key) => key.status === 'active').length;
  const expiredCount = keys.filter((key) => key.status === 'expired').length;
  const revokedCount = keys.filter((key) => key.status === 'revoked').length;

  const hasFilters = Boolean(query.trim()) || statusFilter !== 'all';
  const showEmptyHonesty =
    canAdminister &&
    !keysQuery.isLoading &&
    !keysQuery.isError &&
    keys.length === 0 &&
    !hasFilters;

  const lifecycleFailClosed =
    !API_KEY_ROTATION_POLICY_LIVE ||
    !API_KEY_DELEGATION_LIVE ||
    !API_KEY_ISSUANCE_AUDIT_LIVE;

  if (!canAdminister) {
    return (
      <section className="apk-page" aria-label="API Keys">
        <Header
          onRefresh={() => undefined}
          onCreate={() => undefined}
          createDisabled
          createTitle={API_KEY_ACCESS_DENIED_TITLE}
        />
        <MetaLinks />
        <div className="apk-empty" role="status">
          <CircleSlash2 size={30} aria-hidden="true" />
          <strong>Service access restricted</strong>
          <span>
            API Keys requires Platform Administrator. {API_KEY_ACCESS_DENIED_TITLE}.
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="apk-page" aria-label="API Keys" data-api-keys-honesty="true">
      <Header
        onRefresh={() => void keysQuery.refetch()}
        onCreate={() => setCreateOpen(true)}
        createDisabled={false}
      />
      <MetaLinks />

      {lifecycleFailClosed && (
        <div className="apk-trust" data-testid="api-keys-lifecycle-fail-closed">
          <ShieldCheck size={13} aria-hidden="true" />
          <strong>Lifecycle fail-closed:</strong>
          <span>{API_KEYS_ROTATION_FAIL_CLOSED_TITLE}</span>
        </div>
      )}

      {showEmptyHonesty && (
        <div
          className="api-keys-empty-honesty"
          role="status"
          data-testid="api-keys-empty-honesty"
        >
          <strong>No service access keys in authorized inventory.</strong>
          <span>
            An empty key list is not an error — it means no automation credentials have been
            issued yet. Legacy connector secret aliases may still exist on Integrations; enrollment
            tokens on Enrollment audit. Rotation and delegation remain fail-closed.
          </span>
          <span className="api-keys-empty-honesty__links">
            <Link to={ROUTES.ADMIN_INTEGRATIONS}>Open Integrations</Link>
            <Link to={ROUTES.ADMIN_CONNECTORS}>Open Connectors</Link>
          </span>
        </div>
      )}

      <section className="apk-summary" aria-label="API key summary">
        <div>
          <span>Total keys</span>
          <strong>{keys.length}</strong>
          <small>authorized inventory</small>
        </div>
        <div>
          <span>Active</span>
          <strong>{activeCount}</strong>
          <small>accepting requests</small>
        </div>
        <div data-tone={expiredCount > 0 ? 'warning' : undefined}>
          <span>Expired</span>
          <strong>{expiredCount}</strong>
          <small>past expiry</small>
        </div>
        <div data-tone={revokedCount > 0 ? 'danger' : undefined}>
          <span>Revoked</span>
          <strong>{revokedCount}</strong>
          <small>rejected immediately</small>
        </div>
        <div>
          <span>Key material</span>
          <strong>Hidden</strong>
          <small>shown once at create</small>
        </div>
      </section>

      <div className="apk-toolbar">
        <label className="apk-search">
          <Search size={13} aria-hidden="true" />
          <input
            aria-label="Search API keys"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search keys by name, prefix, or scope…"
          />
        </label>
        <select
          className="apk-select"
          aria-label="Filter API key status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="revoked">Revoked</option>
        </select>
        <button
          className="apk-button"
          type="button"
          aria-label="Refresh API key inventory"
          onClick={() => void keysQuery.refetch()}
        >
          <RefreshCw size={13} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <main className="apk-workspace">
        {keysQuery.isLoading ? (
          <div className="apk-empty" role="status">
            <RefreshCw size={28} aria-hidden="true" />
            <strong>Loading service access keys</strong>
            <span>Retrieving the authorized API key inventory.</span>
          </div>
        ) : keysQuery.isError ? (
          <div className="apk-empty" data-error="true" role="alert">
            <AlertTriangle size={28} aria-hidden="true" />
            <strong>API key inventory unavailable</strong>
            <span>
              {keysQuery.error instanceof Error
                ? keysQuery.error.message
                : 'The authorized key projection could not be loaded.'}
            </span>
            <button className="apk-button" type="button" onClick={() => void keysQuery.refetch()}>
              Try again
            </button>
          </div>
        ) : filteredKeys.length === 0 ? (
          <div className="apk-empty" role="status">
            <Search size={27} aria-hidden="true" />
            <strong>
              {hasFilters ? 'No keys match the current filters' : 'No keys in this view'}
            </strong>
            <span>
              {hasFilters
                ? 'Clear the search or status filter to see the full authorized inventory.'
                : 'Create a key to issue least-privileged automation credentials.'}
            </span>
          </div>
        ) : (
          <div className="apk-table-wrap">
            <table className="apk-table">
              <thead>
                <tr>
                  <th>Service key</th>
                  <th>Prefix</th>
                  <th>Scopes</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Expires</th>
                  <th>Last used</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filteredKeys.map((key) => (
                  <tr key={key.id}>
                    <td>
                      <strong>{key.name}</strong>
                    </td>
                    <td className="apk-mono">{key.keyPrefix}••••</td>
                    <td>
                      <div className="apk-tags">
                        {key.scopes.slice(0, 3).map((scope) => (
                          <span key={scope}>{scope}</span>
                        ))}
                        {key.scopes.length > 3 && <span>+{key.scopes.length - 3}</span>}
                      </div>
                    </td>
                    <td>
                      <span className="apk-key-state" data-state={key.status}>
                        {key.status}
                      </span>
                    </td>
                    <td className="apk-mono">{fmtDate(key.createdAt)}</td>
                    <td className="apk-mono">
                      {key.expiresAt ? fmtDate(key.expiresAt) : 'No expiry'}
                    </td>
                    <td className="apk-mono">
                      {key.lastUsedAt ? fmtDate(key.lastUsedAt) : 'Never'}
                    </td>
                    <td>
                      <button
                        className="apk-button apk-button--danger"
                        type="button"
                        disabled={key.status !== 'active' || revokeMutation.isPending}
                        onClick={() => setRevokeTarget(key)}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <footer className="apk-footer">
        <span>
          <LockKeyhole size={11} aria-hidden="true" /> Plaintext tokens never render in inventory
        </span>
        <strong>Authorized key projection</strong>
        <span>Immutable issuance audit not surfaced until AKM contracts land</span>
      </footer>

      <StatusDock
        className="apk-status-dock"
        sseConnected={eps.connected}
        eps={eps.eps}
        mode="historical"
        lastUpdated={
          keysQuery.dataUpdatedAt ? new Date(keysQuery.dataUpdatedAt) : undefined
        }
      />

      {createOpen && (
        <HaApiKeyCreateModal
          isOpen
          onClose={() => setCreateOpen(false)}
          onTokenReceived={(token) => {
            setPendingToken(token);
            setCreateOpen(false);
          }}
        />
      )}

      {pendingToken && (
        <HaApiKeyTokenDialog token={pendingToken} onAcknowledge={() => setPendingToken(null)} />
      )}

      <HaConfirmationModal
        isOpen={revokeTarget !== null}
        title="Revoke service key"
        message={
          revokeTarget
            ? `Revoke ${revokeTarget.name} (${revokeTarget.keyPrefix}••••)? Requests using this key will be rejected immediately.`
            : ''
        }
        confirmLabel="Revoke key"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          if (!revokeTarget) return;
          revokeMutation.mutate(revokeTarget.id, {
            onSuccess: () => setRevokeTarget(null),
          });
        }}
        onCancel={() => setRevokeTarget(null)}
      />
    </section>
  );
}

function Header({
  onRefresh,
  onCreate,
  createDisabled,
  createTitle,
}: {
  onRefresh: () => void;
  onCreate: () => void;
  createDisabled: boolean;
  createTitle?: string;
}): JSX.Element {
  return (
    <header className="apk-header">
      <div className="apk-header__identity">
        <span className="apk-header__mark">
          <KeyRound size={18} aria-hidden="true" />
        </span>
        <div className="apk-header__copy">
          <div className="apk-header__eyebrow">
            <span>ADMINISTRATION · SERVICE ACCESS</span>
            <span className="apk-header__badge">STAGING CANDIDATE</span>
          </div>
          <h1>API Keys</h1>
          <p className="apk-header__job">{API_KEYS_JOB_SENTENCE}</p>
          <p className="apk-page__projection-note" role="note">
            {API_KEYS_PROJECTION_NOTE}
          </p>
        </div>
      </div>
      <div className="apk-header__actions">
        <button className="apk-button" type="button" onClick={onRefresh}>
          <RefreshCw size={13} aria-hidden="true" />
          Refresh
        </button>
        <button
          className="apk-button apk-button--primary"
          type="button"
          onClick={onCreate}
          disabled={createDisabled}
          title={createTitle}
        >
          <Plus size={14} aria-hidden="true" />
          Create key
        </button>
      </div>
    </header>
  );
}

function MetaLinks(): JSX.Element {
  return (
    <p className="apk-page__meta">
      <Link to={ROUTES.ADMIN_INTEGRATIONS}>Integrations</Link>
      <span aria-hidden="true">·</span>
      <Link to={ROUTES.ADMIN_CONNECTORS}>Connectors</Link>
      <span aria-hidden="true">·</span>
      <Link to={ROUTES.ADMIN_NOTIFICATIONS}>Notifications</Link>
      <span aria-hidden="true">·</span>
      <Link to={ROUTES.ADMIN_PIPELINE_SIGNALS}>Pipeline Signals</Link>
      <span aria-hidden="true">·</span>
      <Link to={ROUTES.ADMIN_ENROLLMENT_AUDIT}>Enrollment audit</Link>
      <span aria-hidden="true">·</span>
      <span className="apk-page__access">Platform Administrator</span>
    </p>
  );
}

