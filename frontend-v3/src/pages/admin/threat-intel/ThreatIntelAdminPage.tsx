/**
 * ThreatIntelAdminPage.tsx — Threat Intelligence Source Administration
 *
 * Route: /admin/threat-intel  (protected — ROLE_ADMIN only)
 *
 * Layout:
 *   1. IOC Stats panel — 5 KPI tiles from GET /api/ha-threat-intel/stats
 *   2. Two-tab layout: "TAXII Feeds" and "MISP Feeds"
 *      - Each tab: table with Name, URL, Enabled toggle, Last Sync, IOC Count,
 *        Last Status, and Actions (Sync Now / Delete)
 *      - "Add Feed" button opens a side drawer form
 *
 * Requirements: 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13
 *
 * Constraints:
 *   - No hard-coded hex values — all colours via var(--ha-*) tokens
 *   - No absolute backend URLs — all calls via threatIntelService
 *   - No `any` types
 *   - Component exported as `export function ThreatIntelAdminPage()`
 */

import { useEffect, useState } from 'react';

import {
  Alert,
  Button,
  FormGroup,
  HelperText,
  HelperTextItem,
  Skeleton,
  Spinner,
  Switch,
  Tab,
  Tabs,
  TabTitleText,
  TextInput,
  Tooltip,
} from '@patternfly/react-core';
import { LockIcon } from '@patternfly/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { HaModal } from '@/components/ha-modal/HaModal';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { useToastStore } from '@/components/toast-stack/toastStore';
import { threatIntelService } from '@/services/threatIntel.service';
import { useAuthStore } from '@/store/auth.store';
import type {
  IocStatsDTO,
  MispFeedDTO,
  MispFeedRequest,
  TaxiiFeedDTO,
  TaxiiFeedRequest,
} from '@/types/threatIntel.types';

// ─── Shared table styles ──────────────────────────────────────────────────────

const TH_STYLE: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: 'var(--ha-text-xs)',
  fontWeight: 600,
  color: 'var(--ha-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  borderBottom: '1px solid var(--ha-border)',
  background: 'var(--ha-surface-raised)',
  whiteSpace: 'nowrap',
};

const TD_STYLE: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 'var(--ha-text-sm)',
  color: 'var(--ha-text-primary)',
  borderBottom: '1px solid var(--ha-border)',
  verticalAlign: 'middle',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format an ISO 8601 timestamp as a relative "X ago" label, or "Never". */
function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Never';
  const delta = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Truncate a string to maxLen characters, appending '…' if cut. */
function truncate(value: string, maxLen: number): string {
  return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
}

// ─── IOC Stats Panel ──────────────────────────────────────────────────────────

interface StatsKpiTileProps {
  label: string;
  value: number | undefined;
  isLoading: boolean;
}

function StatsKpiTile({ label, value, isLoading }: StatsKpiTileProps): JSX.Element {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 120,
        background: 'var(--ha-surface-primary)',
        border: '1px solid var(--ha-border)',
        borderRadius: 'var(--ha-radius-md)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      {isLoading ? (
        <Skeleton width="60px" height="28px" />
      ) : (
        <span
          style={{
            fontSize: 'var(--ha-text-2xl)',
            fontWeight: 700,
            color: 'var(--ha-text-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value ?? '—'}
        </span>
      )}
    </div>
  );
}

interface IocStatsPanelProps {
  stats: IocStatsDTO | undefined;
  isLoading: boolean;
  isError: boolean;
}

function IocStatsPanel({ stats, isLoading, isError }: IocStatsPanelProps): JSX.Element {
  return (
    <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--ha-border)' }}>
      {isError && !isLoading && (
        <Alert variant="warning" isInline title="Failed to load IOC statistics." style={{ marginBottom: 12 }} />
      )}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatsKpiTile label="Total Active IOCs" value={stats?.totalActive} isLoading={isLoading} />
        <StatsKpiTile label="IPs" value={stats?.byType?.ip} isLoading={isLoading} />
        <StatsKpiTile label="Domains" value={stats?.byType?.domain} isLoading={isLoading} />
        <StatsKpiTile label="Hashes" value={stats?.byType?.hash} isLoading={isLoading} />
        <StatsKpiTile label="Expired Today" value={stats?.expiredToday} isLoading={isLoading} />
      </div>
    </div>
  );
}

// ─── Sync Status Label ────────────────────────────────────────────────────────

function SyncStatusLabel({ status }: { status: string | null }): JSX.Element {
  if (!status) {
    return <span style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-xs)' }}>—</span>;
  }
  if (status === 'OK') {
    return (
      <span style={{
        fontSize: 'var(--ha-text-xs)',
        fontWeight: 600,
        color: 'var(--ha-positive)',
        background: 'var(--ha-fill-low-subtle)',
        border: '1px solid var(--ha-positive)',
        borderRadius: 'var(--ha-radius-sm)',
        padding: '2px 6px',
      }}>
        OK
      </span>
    );
  }
  return (
    <span style={{
      fontSize: 'var(--ha-text-xs)',
      fontWeight: 600,
      color: 'var(--ha-critical)',
      background: 'var(--ha-fill-critical-subtle)',
      border: '1px solid var(--ha-critical)',
      borderRadius: 'var(--ha-radius-sm)',
      padding: '2px 6px',
    }}>
      ERROR
    </span>
  );
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────

interface DeleteFeedModalProps {
  feedName: string | null;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

function DeleteFeedModal({ feedName, onClose, onConfirm, isPending }: DeleteFeedModalProps): JSX.Element {
  return (
    <HaModal isOpen={feedName !== null} onClose={onClose} title="Delete Feed" width={480}>
      <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {feedName && (
          <Alert
            variant="warning"
            isInline
            title={`Delete feed '${feedName}'? Associated IOCs will remain but will no longer update.`}
          />
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="danger" isDanger onClick={onConfirm} isDisabled={isPending}>
            {isPending ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Spinner size="sm" aria-label="Deleting" />
                Deleting…
              </span>
            ) : 'Delete Feed'}
          </Button>
          <Button variant="link" onClick={onClose} isDisabled={isPending}>
            Cancel
          </Button>
        </div>
      </div>
    </HaModal>
  );
}

// ─── TAXII Feed Drawer ────────────────────────────────────────────────────────

interface TaxiiFeedDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const TAXII_FEED_DEFAULTS: TaxiiFeedRequest = {
  name: '',
  taxiiUrl: '',
  collectionId: '',
  apiKeyEncrypted: undefined,
  enabled: true,
};

function TaxiiFeedDrawer({ isOpen, onClose, onSaved }: TaxiiFeedDrawerProps): JSX.Element {
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  const [form, setForm] = useState<TaxiiFeedRequest>({ ...TAXII_FEED_DEFAULTS });
  const [apiKey, setApiKey] = useState('');

  // Reset form when drawer opens
  useEffect(() => {
    if (isOpen) {
      setForm({ ...TAXII_FEED_DEFAULTS });
      setApiKey('');
    }
  }, [isOpen]);

  const createMutation = useMutation({
    mutationFn: (req: TaxiiFeedRequest) => threatIntelService.createTaxiiFeed(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['taxii-feeds'] });
      addToast({ variant: 'success', title: 'TAXII feed created.' });
      onSaved();
    },
    onError: () => {
      addToast({ variant: 'danger', title: 'Failed to create TAXII feed.', description: 'Please try again.' });
    },
  });

  const handleSave = (): void => {
    if (!form.name.trim()) {
      addToast({ variant: 'danger', title: 'Name is required.' });
      return;
    }
    if (!form.taxiiUrl.trim()) {
      addToast({ variant: 'danger', title: 'TAXII Server URL is required.' });
      return;
    }
    if (!form.collectionId.trim()) {
      addToast({ variant: 'danger', title: 'Collection ID is required.' });
      return;
    }
    const payload: TaxiiFeedRequest = {
      ...form,
      apiKeyEncrypted: apiKey.trim() || undefined,
    };
    createMutation.mutate(payload);
  };

  return (
    <HaDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Add TAXII Feed"
      subtitle="Configure a TAXII 2.1 server to ingest STIX indicators."
      width={480}
      footer={
        <>
          <Button variant="primary" onClick={handleSave} isDisabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Spinner size="sm" aria-label="Saving" />
                Saving…
              </span>
            ) : 'Save'}
          </Button>
          <Button variant="link" onClick={onClose} isDisabled={createMutation.isPending}>Cancel</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FormGroup label="Name" isRequired fieldId="taxii-name">
          <TextInput
            id="taxii-name"
            value={form.name}
            onChange={(_e, val) => setForm((p) => ({ ...p, name: val }))}
            placeholder="e.g. MITRE ATT&CK"
            isRequired
          />
        </FormGroup>
        <FormGroup label="TAXII Server URL" isRequired fieldId="taxii-url">
          <TextInput
            id="taxii-url"
            value={form.taxiiUrl}
            onChange={(_e, val) => setForm((p) => ({ ...p, taxiiUrl: val }))}
            placeholder="https://cti-taxii.mitre.org/taxii/"
            isRequired
          />
        </FormGroup>
        <FormGroup label="Collection ID" isRequired fieldId="taxii-collection">
          <TextInput
            id="taxii-collection"
            value={form.collectionId}
            onChange={(_e, val) => setForm((p) => ({ ...p, collectionId: val }))}
            placeholder="enterprise-attack"
            isRequired
          />
        </FormGroup>
        <FormGroup label="API Key" fieldId="taxii-api-key">
          <TextInput
            id="taxii-api-key"
            type="password"
            value={apiKey}
            onChange={(_e, val) => setApiKey(val)}
            placeholder="Optional — leave blank if not required"
          />
          <HelperText><HelperTextItem>Stored encrypted. Never transmitted in URLs.</HelperTextItem></HelperText>
        </FormGroup>
        <FormGroup fieldId="taxii-enabled">
          <Switch
            id="taxii-enabled"
            label="Enable feed"
            isChecked={form.enabled}
            onChange={(_e, checked) => setForm((p) => ({ ...p, enabled: checked }))}
          />
        </FormGroup>
      </div>
    </HaDrawer>
  );
}

// ─── MISP Feed Drawer ─────────────────────────────────────────────────────────

interface MispFeedDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const MISP_FEED_DEFAULTS: MispFeedRequest = {
  name: '',
  mispUrl: '',
  apiKeyEncrypted: '',
  enabled: true,
  filterTags: undefined,
};

function MispFeedDrawer({ isOpen, onClose, onSaved }: MispFeedDrawerProps): JSX.Element {
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  const [form, setForm] = useState<MispFeedRequest>({ ...MISP_FEED_DEFAULTS });
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    if (isOpen) {
      setForm({ ...MISP_FEED_DEFAULTS });
      setApiKey('');
    }
  }, [isOpen]);

  const createMutation = useMutation({
    mutationFn: (req: MispFeedRequest) => threatIntelService.createMispFeed(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['misp-feeds'] });
      addToast({ variant: 'success', title: 'MISP feed created.' });
      onSaved();
    },
    onError: () => {
      addToast({ variant: 'danger', title: 'Failed to create MISP feed.', description: 'Please try again.' });
    },
  });

  const handleSave = (): void => {
    if (!form.name.trim()) {
      addToast({ variant: 'danger', title: 'Name is required.' });
      return;
    }
    if (!form.mispUrl.trim()) {
      addToast({ variant: 'danger', title: 'MISP URL is required.' });
      return;
    }
    if (!apiKey.trim()) {
      addToast({ variant: 'danger', title: 'API Key is required for MISP feeds.' });
      return;
    }
    const payload: MispFeedRequest = {
      ...form,
      apiKeyEncrypted: apiKey.trim(),
      filterTags: form.filterTags?.trim() || undefined,
    };
    createMutation.mutate(payload);
  };

  return (
    <HaDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Add MISP Feed"
      subtitle="Connect to a MISP instance to ingest shared threat attributes."
      width={480}
      footer={
        <>
          <Button variant="primary" onClick={handleSave} isDisabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Spinner size="sm" aria-label="Saving" />
                Saving…
              </span>
            ) : 'Save'}
          </Button>
          <Button variant="link" onClick={onClose} isDisabled={createMutation.isPending}>Cancel</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FormGroup label="Name" isRequired fieldId="misp-name">
          <TextInput
            id="misp-name"
            value={form.name}
            onChange={(_e, val) => setForm((p) => ({ ...p, name: val }))}
            placeholder="e.g. Internal MISP"
            isRequired
          />
        </FormGroup>
        <FormGroup label="MISP URL" isRequired fieldId="misp-url">
          <TextInput
            id="misp-url"
            value={form.mispUrl}
            onChange={(_e, val) => setForm((p) => ({ ...p, mispUrl: val }))}
            placeholder="https://misp.example.com"
            isRequired
          />
        </FormGroup>
        <FormGroup label="API Key" isRequired fieldId="misp-api-key">
          <TextInput
            id="misp-api-key"
            type="password"
            value={apiKey}
            onChange={(_e, val) => setApiKey(val)}
            placeholder="MISP auth key"
            isRequired
          />
          <HelperText><HelperTextItem>Stored encrypted. Never transmitted in URLs.</HelperTextItem></HelperText>
        </FormGroup>
        <FormGroup label="Filter Tags" fieldId="misp-filter-tags">
          <TextInput
            id="misp-filter-tags"
            value={form.filterTags ?? ''}
            onChange={(_e, val) => setForm((p) => ({ ...p, filterTags: val || undefined }))}
            placeholder="Optional — e.g. tlp:green,malware"
          />
          <HelperText><HelperTextItem>Comma-separated MISP tag filters.</HelperTextItem></HelperText>
        </FormGroup>
        <FormGroup fieldId="misp-enabled">
          <Switch
            id="misp-enabled"
            label="Enable feed"
            isChecked={form.enabled}
            onChange={(_e, checked) => setForm((p) => ({ ...p, enabled: checked }))}
          />
        </FormGroup>
      </div>
    </HaDrawer>
  );
}

// ─── TAXII Feeds Tab ──────────────────────────────────────────────────────────

/** Local per-row sync state */
interface SyncingState {
  feedId: number;
  startedAt: number; // ms epoch
}

function TaxiiFeedsTab(): JSX.Element {
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deletingFeed, setDeletingFeed] = useState<TaxiiFeedDTO | null>(null);
  const [syncingState, setSyncingState] = useState<SyncingState | null>(null);

  const {
    data: feeds,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['taxii-feeds'],
    queryFn: () => threatIntelService.listTaxiiFeeds(),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, req }: { id: number; req: TaxiiFeedRequest }) =>
      threatIntelService.updateTaxiiFeed(id, req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['taxii-feeds'] });
    },
    onError: () => {
      addToast({ variant: 'danger', title: 'Failed to update feed status.' });
      void queryClient.invalidateQueries({ queryKey: ['taxii-feeds'] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: (id: number) => threatIntelService.syncTaxiiFeed(id),
    onSuccess: (_data, id) => {
      addToast({ variant: 'success', title: 'Sync triggered successfully.' });
      setSyncingState({ feedId: id, startedAt: Date.now() });
    },
    onError: () => {
      addToast({ variant: 'danger', title: 'Failed to trigger sync.' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => threatIntelService.deleteTaxiiFeed(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['taxii-feeds'] });
      addToast({ variant: 'success', title: 'Feed deleted.' });
      setDeletingFeed(null);
    },
    onError: () => {
      addToast({ variant: 'danger', title: 'Failed to delete feed.' });
    },
  });

  // Poll every 3 seconds for up to 30 seconds after a sync is triggered
  useEffect(() => {
    if (!syncingState) return;
    const elapsed = Date.now() - syncingState.startedAt;
    if (elapsed >= 30_000) {
      setSyncingState(null);
      return;
    }
    const timer = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: ['taxii-feeds'] });
      // Check if lastSync advanced for the syncing feed
      const updated = (feeds ?? []).find((f) => f.id === syncingState.feedId);
      if (updated?.lastSyncAt) {
        const syncTime = new Date(updated.lastSyncAt).getTime();
        if (syncTime >= syncingState.startedAt) {
          setSyncingState(null);
          return;
        }
      }
      setSyncingState((prev) => (prev ? { ...prev } : null));
    }, 3_000);
    return () => clearTimeout(timer);
  }, [syncingState, feeds, queryClient]);

  const handleToggleEnabled = (feed: TaxiiFeedDTO): void => {
    const req: TaxiiFeedRequest = {
      name: feed.name,
      taxiiUrl: feed.taxiiUrl,
      collectionId: feed.collectionId,
      enabled: !feed.enabled,
    };
    toggleMutation.mutate({ id: feed.id, req });
  };

  if (isError) {
    return (
      <Alert variant="danger" isInline title="Failed to load TAXII feeds." style={{ margin: 24 }} />
    );
  }

  return (
    <div>
      <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={() => setDrawerOpen(true)}>
          Add TAXII Feed
        </Button>
      </div>

      <div style={{ padding: '0 24px 24px' }}>
        <div
          style={{
            background: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-md)',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="TAXII Feeds">
            <thead>
              <tr>
                <th style={TH_STYLE}>Name</th>
                <th style={{ ...TH_STYLE, maxWidth: 260 }}>TAXII URL</th>
                <th style={TH_STYLE}>Collection ID</th>
                <th style={TH_STYLE}>Enabled</th>
                <th style={TH_STYLE}>Last Sync</th>
                <th style={{ ...TH_STYLE, fontVariantNumeric: 'tabular-nums' }}>IOC Count</th>
                <th style={TH_STYLE}>Status</th>
                <th style={TH_STYLE}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <>
                  {[1, 2, 3].map((i) => (
                    <tr key={i}>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((j) => (
                        <td key={j} style={TD_STYLE}><Skeleton width="80px" /></td>
                      ))}
                    </tr>
                  ))}
                </>
              )}

              {!isLoading && (!feeds || feeds.length === 0) && (
                <tr>
                  <td colSpan={8} style={{ ...TD_STYLE, textAlign: 'center', padding: '40px 24px', borderBottom: 'none' }}>
                    <span style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)' }}>
                      No TAXII feeds configured. Click &ldquo;Add TAXII Feed&rdquo; to get started.
                    </span>
                  </td>
                </tr>
              )}

              {!isLoading && feeds?.map((feed) => {
                const isSyncing = syncingState?.feedId === feed.id;
                return (
                  <tr key={feed.id}>
                    <td style={{ ...TD_STYLE, fontWeight: 500 }}>{feed.name}</td>
                    <td style={{ ...TD_STYLE, maxWidth: 260 }}>
                      <Tooltip content={feed.taxiiUrl} position="top">
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ha-text-secondary)', fontFamily: 'var(--ha-font-mono)', fontSize: 'var(--ha-text-xs)', cursor: 'default' }}>
                          {truncate(feed.taxiiUrl, 40)}
                        </span>
                      </Tooltip>
                    </td>
                    <td style={{ ...TD_STYLE, color: 'var(--ha-text-secondary)', fontFamily: 'var(--ha-font-mono)', fontSize: 'var(--ha-text-xs)' }}>
                      {feed.collectionId}
                    </td>
                    <td style={TD_STYLE}>
                      <Switch
                        id={`taxii-enabled-${feed.id}`}
                        isChecked={feed.enabled}
                        onChange={() => handleToggleEnabled(feed)}
                        aria-label={`${feed.name} enabled`}
                      />
                    </td>
                    <td style={{ ...TD_STYLE, color: 'var(--ha-text-secondary)' }}>
                      {isSyncing ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ha-primary)' }}>
                          <Spinner size="sm" aria-label="Syncing" />
                          syncing…
                        </span>
                      ) : formatRelativeTime(feed.lastSyncAt)}
                    </td>
                    <td style={{ ...TD_STYLE, fontVariantNumeric: 'tabular-nums' }}>
                      {feed.lastSyncCount}
                    </td>
                    <td style={TD_STYLE}>
                      <SyncStatusLabel status={feed.lastSyncStatus} />
                    </td>
                    <td style={TD_STYLE}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => syncMutation.mutate(feed.id)}
                          isDisabled={isSyncing || syncMutation.isPending}
                        >
                          Sync Now
                        </Button>
                        <Button
                          variant="danger"
                          isDanger
                          size="sm"
                          onClick={() => setDeletingFeed(feed)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <TaxiiFeedDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => setDrawerOpen(false)}
      />

      <DeleteFeedModal
        feedName={deletingFeed?.name ?? null}
        onClose={() => setDeletingFeed(null)}
        onConfirm={() => deletingFeed && deleteMutation.mutate(deletingFeed.id)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

// ─── MISP Feeds Tab ───────────────────────────────────────────────────────────

function MispFeedsTab(): JSX.Element {
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deletingFeed, setDeletingFeed] = useState<MispFeedDTO | null>(null);
  const [syncingState, setSyncingState] = useState<SyncingState | null>(null);

  const {
    data: feeds,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['misp-feeds'],
    queryFn: () => threatIntelService.listMispFeeds(),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, req }: { id: number; req: MispFeedRequest }) =>
      threatIntelService.updateMispFeed(id, req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['misp-feeds'] });
    },
    onError: () => {
      addToast({ variant: 'danger', title: 'Failed to update feed status.' });
      void queryClient.invalidateQueries({ queryKey: ['misp-feeds'] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: (id: number) => threatIntelService.syncMispFeed(id),
    onSuccess: (_data, id) => {
      addToast({ variant: 'success', title: 'Sync triggered successfully.' });
      setSyncingState({ feedId: id, startedAt: Date.now() });
    },
    onError: () => {
      addToast({ variant: 'danger', title: 'Failed to trigger sync.' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => threatIntelService.deleteMispFeed(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['misp-feeds'] });
      addToast({ variant: 'success', title: 'Feed deleted.' });
      setDeletingFeed(null);
    },
    onError: () => {
      addToast({ variant: 'danger', title: 'Failed to delete feed.' });
    },
  });

  // Poll every 3 seconds for up to 30 seconds after sync triggered
  useEffect(() => {
    if (!syncingState) return;
    const elapsed = Date.now() - syncingState.startedAt;
    if (elapsed >= 30_000) {
      setSyncingState(null);
      return;
    }
    const timer = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: ['misp-feeds'] });
      const updated = (feeds ?? []).find((f) => f.id === syncingState.feedId);
      if (updated?.lastSyncAt) {
        const syncTime = new Date(updated.lastSyncAt).getTime();
        if (syncTime >= syncingState.startedAt) {
          setSyncingState(null);
          return;
        }
      }
      setSyncingState((prev) => (prev ? { ...prev } : null));
    }, 3_000);
    return () => clearTimeout(timer);
  }, [syncingState, feeds, queryClient]);

  const handleToggleEnabled = (feed: MispFeedDTO): void => {
    const req: MispFeedRequest = {
      name: feed.name,
      mispUrl: feed.mispUrl,
      enabled: !feed.enabled,
      filterTags: feed.filterTags ?? undefined,
    };
    toggleMutation.mutate({ id: feed.id, req });
  };

  if (isError) {
    return (
      <Alert variant="danger" isInline title="Failed to load MISP feeds." style={{ margin: 24 }} />
    );
  }

  return (
    <div>
      <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={() => setDrawerOpen(true)}>
          Add MISP Feed
        </Button>
      </div>

      <div style={{ padding: '0 24px 24px' }}>
        <div
          style={{
            background: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-md)',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="MISP Feeds">
            <thead>
              <tr>
                <th style={TH_STYLE}>Name</th>
                <th style={{ ...TH_STYLE, maxWidth: 260 }}>MISP URL</th>
                <th style={TH_STYLE}>Filter Tags</th>
                <th style={TH_STYLE}>Enabled</th>
                <th style={TH_STYLE}>Last Sync</th>
                <th style={{ ...TH_STYLE, fontVariantNumeric: 'tabular-nums' }}>IOC Count</th>
                <th style={TH_STYLE}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <>
                  {[1, 2, 3].map((i) => (
                    <tr key={i}>
                      {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                        <td key={j} style={TD_STYLE}><Skeleton width="80px" /></td>
                      ))}
                    </tr>
                  ))}
                </>
              )}

              {!isLoading && (!feeds || feeds.length === 0) && (
                <tr>
                  <td colSpan={7} style={{ ...TD_STYLE, textAlign: 'center', padding: '40px 24px', borderBottom: 'none' }}>
                    <span style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)' }}>
                      No MISP feeds configured. Click &ldquo;Add MISP Feed&rdquo; to get started.
                    </span>
                  </td>
                </tr>
              )}

              {!isLoading && feeds?.map((feed) => {
                const isSyncing = syncingState?.feedId === feed.id;
                return (
                  <tr key={feed.id}>
                    <td style={{ ...TD_STYLE, fontWeight: 500 }}>{feed.name}</td>
                    <td style={{ ...TD_STYLE, maxWidth: 260 }}>
                      <Tooltip content={feed.mispUrl} position="top">
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ha-text-secondary)', fontFamily: 'var(--ha-font-mono)', fontSize: 'var(--ha-text-xs)', cursor: 'default' }}>
                          {truncate(feed.mispUrl, 40)}
                        </span>
                      </Tooltip>
                    </td>
                    <td style={{ ...TD_STYLE, color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-xs)' }}>
                      {feed.filterTags ? truncate(feed.filterTags, 30) : <span style={{ color: 'var(--ha-text-secondary)' }}>—</span>}
                    </td>
                    <td style={TD_STYLE}>
                      <Switch
                        id={`misp-enabled-${feed.id}`}
                        isChecked={feed.enabled}
                        onChange={() => handleToggleEnabled(feed)}
                        aria-label={`${feed.name} enabled`}
                      />
                    </td>
                    <td style={{ ...TD_STYLE, color: 'var(--ha-text-secondary)' }}>
                      {isSyncing ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ha-primary)' }}>
                          <Spinner size="sm" aria-label="Syncing" />
                          syncing…
                        </span>
                      ) : formatRelativeTime(feed.lastSyncAt)}
                    </td>
                    <td style={{ ...TD_STYLE, fontVariantNumeric: 'tabular-nums' }}>
                      {feed.lastSyncCount}
                    </td>
                    <td style={TD_STYLE}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => syncMutation.mutate(feed.id)}
                          isDisabled={isSyncing || syncMutation.isPending}
                        >
                          Sync Now
                        </Button>
                        <Button
                          variant="danger"
                          isDanger
                          size="sm"
                          onClick={() => setDeletingFeed(feed)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <MispFeedDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => setDrawerOpen(false)}
      />

      <DeleteFeedModal
        feedName={deletingFeed?.name ?? null}
        onClose={() => setDeletingFeed(null)}
        onConfirm={() => deletingFeed && deleteMutation.mutate(deletingFeed.id)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

/**
 * ThreatIntelAdminPage — Admin page for managing TAXII and MISP threat intel feeds.
 *
 * Route: /admin/threat-intel
 * Access: ROLE_ADMIN only
 */
export function ThreatIntelAdminPage(): JSX.Element {
  const hasRole = useAuthStore((s) => s.hasRole);
  const [activeTab, setActiveTab] = useState<number>(0);

  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
  } = useQuery({
    queryKey: ['ioc-stats'],
    queryFn: () => threatIntelService.getIocStats(),
    // Refresh stats every 60 seconds
    refetchInterval: 60_000,
  });

  // Access denied state — rendered when user lacks ROLE_ADMIN
  if (!hasRole('ROLE_ADMIN')) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          background: 'var(--ha-background)',
        }}
      >
        <EmptyState
          icon={<LockIcon color="var(--ha-text-secondary)" />}
          title="Administrator access required"
          description="You need the ROLE_ADMIN authority to manage threat intelligence sources. Contact your platform administrator to request access."
        />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--ha-background)',
      }}
    >
      {/* Page Header */}
      <SiemPageHeader
        title="Threat Intelligence"
        description="Manage TAXII 2.1 and MISP feed sources. Configure, sync, and monitor IOC ingestion pipelines."
        breadcrumbs={[{ label: 'Admin' }, { label: 'Threat Intelligence' }]}
      />

      {/* IOC Stats Panel */}
      <IocStatsPanel stats={stats} isLoading={statsLoading} isError={statsError} />

      {/* Tab layout */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Tabs
          activeKey={activeTab}
          onSelect={(_e, key) => setActiveTab(key as number)}
          style={{
            background: 'var(--ha-surface-primary)',
            borderBottom: '1px solid var(--ha-border)',
            paddingLeft: 24,
          }}
        >
          <Tab
            eventKey={0}
            title={<TabTitleText>TAXII Feeds</TabTitleText>}
            aria-label="TAXII Feeds"
          >
            <TaxiiFeedsTab />
          </Tab>
          <Tab
            eventKey={1}
            title={<TabTitleText>MISP Feeds</TabTitleText>}
            aria-label="MISP Feeds"
          >
            <MispFeedsTab />
          </Tab>
        </Tabs>
      </div>
    </div>
  );
}
