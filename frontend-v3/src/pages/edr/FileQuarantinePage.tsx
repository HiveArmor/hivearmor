/**
 * Quarantine & Containment — Phase 7 response operations.
 *
 * The file tab is backed by /api/ha-edr/quarantine.
 * The Endpoint isolation tab is backed by secured GET /api/ha-edr/isolation
 * (STAGING CANDIDATE). Legacy /api/edr/* is not adopted for this inventory.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import { Alert } from '@patternfly/react-core';
import type { ColDef, ICellRendererParams, RowClickedEvent } from 'ag-grid-community';
import type { AgGridReact } from 'ag-grid-react';
import {
  Activity,
  AlignJustify,
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  FileArchive,
  FileClock,
  FileWarning,
  Filter,
  History,
  Laptop,
  List,
  LockKeyhole,
  Network,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Workflow,
} from 'lucide-react';

import { AccessDeniedState } from '@/components/access-denied-state/AccessDeniedState';
import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { HaConfirmationModal } from '@/components/ha-confirmation-modal/HaConfirmationModal';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useIsolatedHosts, useQuarantineBulkAction, useQuarantineAction, useQuarantinedFiles } from '@/hooks/useQuarantine';
import { useRowDensity, type RowDensity } from '@/hooks/useRowDensity';
import { RESPONSE_GRID_ROW_HEIGHTS } from '@/pages/response/response-grid-standard';
import { fixtureMode } from '@/pages/response/responsePlaybooks.service';
import { useAuthStore } from '@/store/auth.store';
import type { IsolatedHostDTO, QuarantinedFileDTO } from '@/types/edr';

import './FileQuarantinePage.css';
import '../response/response-grid-standard.css';

/** Matches nav + HaEdrResource quarantine PreAuthorize (not legacy /api/edr/*). */
const QUARANTINE_ACCESS_ROLES = ['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN'] as const;

const PAGE_SIZE = 25;
type WorkspaceView = 'files' | 'endpoints';
type FileStatus = 'all' | 'quarantined' | 'restored' | 'deleted';
type Verdict = 'all' | NonNullable<QuarantinedFileDTO['verdict']>;
type IsolationStatus = 'all' | 'ACTIVE' | 'LIFTED' | 'FAILED';
type FileDetailView = 'overview' | 'evidence' | 'history';
type QuarantineActionTarget =
  | { kind: 'single'; action: 'restore' | 'delete'; row: QuarantinedFileDTO }
  | { kind: 'bulk'; action: 'restore' | 'delete'; ids: number[]; count: number; excluded: number };

const STATUS_OPTIONS: Array<{ value: FileStatus; label: string }> = [
  { value: 'all', label: 'All states' },
  { value: 'quarantined', label: 'Quarantined' },
  { value: 'restored', label: 'Restored' },
  { value: 'deleted', label: 'Deleted' },
];

const VERDICT_OPTIONS: Array<{ value: Verdict; label: string }> = [
  { value: 'all', label: 'All verdicts' },
  { value: 'malicious', label: 'Malicious' },
  { value: 'suspicious', label: 'Suspicious' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'false_positive', label: 'False positive' },
];

const ISOLATION_STATUS_OPTIONS: Array<{ value: IsolationStatus; label: string }> = [
  { value: 'all', label: 'All states' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'LIFTED', label: 'Lifted' },
  { value: 'FAILED', label: 'Failed' },
];

function formatTimestamp(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value));
}

function formatBytes(value?: number): string {
  if (!value) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function shortenedHash(hash?: string): string {
  return hash ? `${hash.slice(0, 10)}…${hash.slice(-7)}` : '—';
}

function copyText(value?: string): void {
  if (value) void navigator.clipboard?.writeText(value);
}

function fileActionEligible(row: QuarantinedFileDTO): boolean {
  return row.status === 'quarantined' && row.actionState !== 'pending' && row.connectorState !== 'offline';
}

function FileState({ status }: { status: string }): JSX.Element {
  const Icon = status === 'quarantined' ? ShieldOff : status === 'restored' ? ArchiveRestore : Trash2;
  return <span className="qrn-state" data-state={status}><Icon size={12} />{status}</span>;
}

function VerdictState({ verdict }: { verdict?: QuarantinedFileDTO['verdict'] }): JSX.Element {
  const value = verdict ?? 'unknown';
  const Icon = value === 'malicious' ? ShieldAlert : value === 'false_positive' ? CheckCircle2 : AlertTriangle;
  return <span className="qrn-verdict" data-verdict={value}><Icon size={12} />{value.replace('_', ' ')}</span>;
}

interface RowActionsProps {
  row: QuarantinedFileDTO;
  onRestore: (row: QuarantinedFileDTO) => void;
  onDelete: (row: QuarantinedFileDTO) => void;
}

function RowActions({ row, onRestore, onDelete }: RowActionsProps): JSX.Element {
  const disabled = !fileActionEligible(row);
  return (
    <div className="qrn-row-actions" onClick={(event) => event.stopPropagation()}>
      <button type="button" onClick={() => onRestore(row)} disabled={disabled} aria-label={`Restore ${row.filename}`} title="Request governed restore"><ArchiveRestore size={13} /></button>
      <button type="button" onClick={() => onDelete(row)} disabled={disabled} aria-label={`Delete ${row.filename}`} title="Permanently delete"><Trash2 size={13} /></button>
    </div>
  );
}

function FileDrawer({ row, onClose, onRestore, onDelete }: {
  row: QuarantinedFileDTO;
  onClose: () => void;
  onRestore: (row: QuarantinedFileDTO) => void;
  onDelete: (row: QuarantinedFileDTO) => void;
}): JSX.Element {
  const [view, setView] = useState<FileDetailView>('overview');
  const eligible = fileActionEligible(row);
  const detailViews: FileDetailView[] = ['overview', 'evidence', 'history'];
  const handleTabKey = (event: ReactKeyboardEvent<HTMLButtonElement>, current: FileDetailView) => {
    const currentIndex = detailViews.indexOf(current);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % detailViews.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + detailViews.length) % detailViews.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = detailViews.length - 1;
    else return;
    event.preventDefault();
    setView(detailViews[nextIndex]);
    document.getElementById(`qrn-file-tab-${detailViews[nextIndex]}`)?.focus();
  };
  return (
    <HaDrawer isOpen onClose={onClose} title={row.filename} subtitle={`${row.agentName ?? row.agentId} · ${row.status}`} width={520}
      footer={<><button className="qrn-drawer-button" type="button" disabled={!eligible} onClick={() => onRestore(row)}><ArchiveRestore size={13} />Request restore</button><button className="qrn-drawer-button qrn-drawer-button--danger" type="button" disabled={!eligible} onClick={() => onDelete(row)}><Trash2 size={13} />Delete permanently</button></>}>
      <div className="qrn-drawer">
        <div className="qrn-drawer__status"><FileState status={row.status} /><VerdictState verdict={row.verdict} /><span data-state={row.connectorState ?? 'unknown'}>{row.connectorState ?? 'unknown'} connector</span></div>
        <nav className="qrn-drawer-tabs" aria-label="Quarantine record detail" role="tablist">
          {detailViews.map((detailView) => <button key={detailView} id={`qrn-file-tab-${detailView}`} type="button" role="tab" aria-selected={view === detailView} aria-controls={`qrn-file-panel-${detailView}`} tabIndex={view === detailView ? 0 : -1} data-active={view === detailView} onClick={() => setView(detailView)} onKeyDown={(event) => handleTabKey(event, detailView)}>{detailView}</button>)}
        </nav>

        {view === 'overview' && <div id="qrn-file-panel-overview" className="qrn-drawer-panel" role="tabpanel" aria-labelledby="qrn-file-tab-overview">
          <section className="qrn-drawer-card">
            <header><FileArchive size={14} /><div><strong>File identity</strong><span>Preserved quarantine projection</span></div></header>
            <dl className="qrn-detail-grid">
              <div><dt>File size</dt><dd>{formatBytes(row.fileSize)}</dd></div>
              <div><dt>Signer</dt><dd>{row.signer ?? 'Not reported'}</dd></div>
              <div><dt>Endpoint</dt><dd>{row.agentName ?? row.agentId}</dd></div>
              <div><dt>Tenant scope</dt><dd>{row.tenantName ?? 'Authorized scope'}</dd></div>
              <div><dt>Quarantined</dt><dd>{formatTimestamp(row.quarantineTime)}</dd></div>
              <div><dt>Initiated by</dt><dd>{row.quarantinedBy ?? 'System policy'}</dd></div>
            </dl>
          </section>
          <section className="qrn-drawer-card">
            <header><ShieldAlert size={14} /><div><strong>{row.threatName ?? 'Unclassified threat'}</strong><span>{row.detectionName ?? 'No detection rationale supplied'}</span></div></header>
            <p>{row.notes ?? 'The file remains unavailable on the endpoint until a governed restore or permanent disposition is completed.'}</p>
          </section>
          <section className="qrn-drawer-card qrn-drawer-card--warning">
            <header><LockKeyhole size={14} /><div><strong>Response safety</strong><span>Restore and delete change endpoint state</span></div></header>
            <p>Validate the linked alert, signer, prevalence, endpoint health, and business owner before release. Permanent delete has no automatic rollback.</p>
          </section>
        </div>}

        {view === 'evidence' && <div id="qrn-file-panel-evidence" className="qrn-drawer-panel" role="tabpanel" aria-labelledby="qrn-file-tab-evidence">
          <section className="qrn-drawer-card">
            <header><FileWarning size={14} /><div><strong>Observed location</strong><span>Endpoint-reported original path</span></div></header>
            <div className="qrn-copy-value"><code>{row.filePath}</code><button type="button" onClick={() => copyText(row.filePath)} aria-label="Copy file path"><Copy size={13} /></button></div>
          </section>
          <section className="qrn-drawer-card">
            <header><ShieldCheck size={14} /><div><strong>SHA-256</strong><span>Use the complete digest for investigation pivots</span></div></header>
            <div className="qrn-copy-value"><code>{row.sha256Hash ?? 'Not reported'}</code><button type="button" onClick={() => copyText(row.sha256Hash)} aria-label="Copy SHA-256"><Copy size={13} /></button></div>
          </section>
          <div className="qrn-pivots">
            <a href={`/search?query=${encodeURIComponent(row.sha256Hash ? `file.hash.sha256:"${row.sha256Hash}"` : `file.name:"${row.filename}"`)}`}><Search size={13} />Hunt file observations<ExternalLink size={11} /></a>
            <a href={`/entities/${encodeURIComponent(row.agentId)}`}><Laptop size={13} />Open endpoint dossier<ExternalLink size={11} /></a>
            {row.linkedAlertId && <a href={`/alerts/${encodeURIComponent(row.linkedAlertId)}`}><ShieldAlert size={13} />Open {row.linkedAlertId}<ExternalLink size={11} /></a>}
            {row.linkedIncidentId && <a href={`/incidents/${encodeURIComponent(row.linkedIncidentId)}`}><Workflow size={13} />Open {row.linkedIncidentId}<ExternalLink size={11} /></a>}
          </div>
        </div>}

        {view === 'history' && <section id="qrn-file-panel-history" className="qrn-drawer-card" role="tabpanel" aria-labelledby="qrn-file-tab-history">
          <header><History size={14} /><div><strong>Lifecycle summary</strong><span>{fixtureMode ? 'Fictional action sequence' : 'Full immutable history requires RESP-021'}</span></div></header>
          <ol className="qrn-history">
            <li><span /><div><strong>File observed</strong><small>{formatTimestamp(row.firstSeen ?? row.quarantineTime)} · {row.source ?? 'Endpoint sensor'}</small></div></li>
            <li><span /><div><strong>Quarantine requested</strong><small>{row.quarantinedBy ?? 'System policy'} · action accepted</small></div></li>
            <li data-current={eligible}><span /><div><strong>{row.status === 'quarantined' ? 'Quarantine verified' : `File ${row.status}`}</strong><small>{formatTimestamp(row.lastSeen ?? row.quarantineTime)} · {row.actionState ?? 'complete'}</small></div></li>
          </ol>
        </section>}
      </div>
    </HaDrawer>
  );
}

function formatFreshnessLabel(snapshotAt?: string | null, asOf?: string | null, fallbackMs?: number): string {
  if (snapshotAt) {
    const snap = formatTimestamp(snapshotAt);
    return asOf ? `Snapshot ${snap} · as of ${formatTimestamp(asOf)}` : `Snapshot ${snap}`;
  }
  if (fallbackMs) return `Client refresh ${new Date(fallbackMs).toLocaleTimeString()}`;
  return 'Snapshot —';
}

function EndpointContainmentPanel({ density, search, status, page, onPageChange }: {
  density: RowDensity;
  search: string;
  status: IsolationStatus;
  page: number;
  onPageChange: (page: number) => void;
}): JSX.Element {
  const [selected, setSelected] = useState<IsolatedHostDTO | null>(null);
  const [releaseReview, setReleaseReview] = useState<IsolatedHostDTO | null>(null);
  const query = useMemo(
    () => ({ page, size: PAGE_SIZE, status: status === 'all' ? undefined : status }),
    [page, status],
  );
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useIsolatedHosts(query);
  const filteredRecords = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.content ?? []).filter((record) => {
      if (!needle) return true;
      return [record.hostname, record.agentId, record.actionedBy, record.reason, record.isolationType]
        .some((value) => value?.toLowerCase().includes(needle));
    });
  }, [data?.content, search]);
  const columns = useMemo<ColDef[]>(() => [
    {
      field: 'hostname',
      headerName: 'Host',
      flex: 1,
      minWidth: 190,
      cellRenderer: ({ data: row }: { data: IsolatedHostDTO }) => (
        <span className="qrn-target-cell">
          <span><Laptop size={14} /></span>
          <strong>{row.hostname ?? row.agentId}</strong>
          <small>host · {row.agentId}</small>
        </span>
      ),
    },
    {
      field: 'status',
      headerName: 'Isolation',
      width: 126,
      cellRenderer: ({ data: row }: { data: IsolatedHostDTO }) => (
        <span className="qrn-containment-state" data-state={row.status.toLowerCase()}>
          <ShieldOff size={12} />{row.status.toLowerCase()}
        </span>
      ),
    },
    { field: 'isolationType', headerName: 'Type', width: 110 },
    { field: 'actionedBy', headerName: 'Initiator', width: 130 },
    {
      field: 'isolatedAt',
      headerName: 'Isolated',
      width: 132,
      valueFormatter: ({ value }: { value: string }) => formatTimestamp(value),
    },
    {
      field: 'liftedAt',
      headerName: 'Lifted',
      width: 132,
      valueFormatter: ({ value }: { value: string | null | undefined }) => (value ? formatTimestamp(value) : '—'),
    },
    {
      field: 'reason',
      headerName: 'Reason',
      flex: 1,
      minWidth: 160,
      valueFormatter: ({ value }: { value: string | undefined }) => value ?? '—',
    },
    { headerName: '', width: 34, sortable: false, cellRenderer: () => <ChevronRight size={14} className="qrn-chevron" /> },
  ], []);

  if (isError) {
    return (
      <div className="qrn-inline-state">
        <AlertTriangle size={24} />
        <strong>Host isolation inventory unavailable</strong>
        <span>{error instanceof Error ? error.message : 'The secured /api/ha-edr/isolation inventory could not be loaded.'}</span>
        <button type="button" onClick={() => refetch()}>Retry source</button>
      </div>
    );
  }

  if (!isLoading && filteredRecords.length === 0) {
    return (
      <div className="qrn-inline-state" role="status" aria-label="No isolated hosts">
        <ShieldCheck size={24} />
        <strong>No isolated hosts</strong>
        <span>
          {data?.totalElements === 0
            ? 'No host isolation records are present in the secured inventory. Legacy /api/edr/isolation is not used.'
            : 'No hosts on this page match the active search. Clear search or change page.'}
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="qrn-freshness" role="status" aria-label="Host isolation inventory freshness">
        <Clock3 size={12} aria-hidden="true" />
        <span>{formatFreshnessLabel(data?.snapshotAt, data?.asOf, dataUpdatedAt)}</span>
        <small>STAGING CANDIDATE · page read time, not cursor/PIT-bound</small>
      </div>
      <main className="qrn-grid-wrap">
        <SiemDataGrid
          className="response-grid qrn-grid"
          columnDefs={columns}
          rowData={filteredRecords}
          rowHeight={RESPONSE_GRID_ROW_HEIGHTS[density]}
          loading={isLoading}
          rowSelection="single"
          suppressRowClickSelection={false}
          onRowClicked={(event: RowClickedEvent) => setSelected(event.data as IsolatedHostDTO)}
          getRowId={(params) => String((params.data as IsolatedHostDTO).id)}
          ariaLabel="Host isolation inventory"
          defaultColDef={{ filter: false }}
        />
      </main>
      <footer className="qrn-pagination" aria-label="Isolation pagination">
        <span>{data?.totalElements.toLocaleString() ?? 0} isolation records</span>
        <span>Page {page + 1} of {Math.max(1, data?.totalPages ?? 1)} · up to {PAGE_SIZE} rows</span>
        <div>
          <button type="button" disabled={page === 0} onClick={() => onPageChange(Math.max(0, page - 1))}>
            <ChevronLeft size={13} />Previous
          </button>
          <button
            type="button"
            disabled={!data || page + 1 >= data.totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next<ChevronRight size={13} />
          </button>
        </div>
        <span>{formatFreshnessLabel(data?.snapshotAt, data?.asOf, dataUpdatedAt)}</span>
      </footer>
      {selected && (
        <HaDrawer
          isOpen
          onClose={() => setSelected(null)}
          title={selected.hostname ?? selected.agentId}
          subtitle={`host · ${selected.status.toLowerCase()}`}
          width={500}
          footer={(
            <>
              <a className="qrn-drawer-button" href={`/entities/${encodeURIComponent(selected.agentId)}`}>
                <Laptop size={13} />Open endpoint dossier
              </a>
              <button
                className="qrn-drawer-button"
                type="button"
                disabled={selected.status !== 'ACTIVE'}
                onClick={() => setReleaseReview(selected)}
              >
                <ArchiveRestore size={13} />Review release
              </button>
            </>
          )}
        >
          <div className="qrn-drawer">
            <div className="qrn-drawer__status">
              <span className="qrn-containment-state" data-state={selected.status.toLowerCase()}>
                <ShieldOff size={12} />{selected.status.toLowerCase()}
              </span>
              <span>{selected.isolationType} isolation</span>
            </div>
            <section className="qrn-drawer-card">
              <header>
                <Network size={14} />
                <div>
                  <strong>Isolation boundary</strong>
                  <span>Management connectivity carve-outs when reported</span>
                </div>
              </header>
              <dl className="qrn-detail-grid">
                <div><dt>Agent</dt><dd>{selected.agentId}</dd></div>
                <div><dt>Allowed IPs</dt><dd>{selected.allowedIps ?? 'Not reported'}</dd></div>
                <div><dt>EDR event</dt><dd>{selected.edrEventId ?? '—'}</dd></div>
                <div><dt>Type</dt><dd>{selected.isolationType}</dd></div>
              </dl>
            </section>
            <section className="qrn-drawer-card">
              <header>
                <Clock3 size={14} />
                <div>
                  <strong>Lifecycle</strong>
                  <span>Persisted isolation state only — action history incomplete</span>
                </div>
              </header>
              <dl className="qrn-detail-grid">
                <div><dt>Isolated</dt><dd>{formatTimestamp(selected.isolatedAt)}</dd></div>
                <div><dt>Initiator</dt><dd>{selected.actionedBy}</dd></div>
                <div><dt>Lifted</dt><dd>{formatTimestamp(selected.liftedAt)}</dd></div>
                <div><dt>Status</dt><dd>{selected.status}</dd></div>
              </dl>
              <p>{selected.reason ?? 'No operator reason recorded.'}</p>
            </section>
            <section className="qrn-drawer-card qrn-drawer-card--warning">
              <header>
                <LockKeyhole size={14} />
                <div>
                  <strong>Governed release not available here</strong>
                  <span>RESP-021 preview / approval / idempotency remain open</span>
                </div>
              </header>
              <p>
                This inventory is a STAGING CANDIDATE read from /api/ha-edr/isolation.
                Lift and release still require a governed preview path; this panel will not execute release.
              </p>
            </section>
          </div>
        </HaDrawer>
      )}
      <HaConfirmationModal
        isOpen={releaseReview !== null}
        title="Review host release"
        message={releaseReview
          ? `Release restores network communication for ${releaseReview.hostname ?? releaseReview.agentId}. Verify remediation and endpoint health first. The canonical release-preview and approval contract is still required before execution (RESP-021).`
          : ''}
        confirmLabel="Review authority"
        cancelLabel="Keep isolated"
        onConfirm={() => {
          if (!releaseReview) return;
          window.location.assign(`/response/authority?search=${encodeURIComponent(releaseReview.hostname ?? releaseReview.agentId)}`);
        }}
        onCancel={() => setReleaseReview(null)}
      />
    </>
  );
}

export function FileQuarantinePage(): JSX.Element {
  const hasAccess = useAuthStore((state) => state.hasAnyRole([...QUARANTINE_ACCESS_ROLES]));

  if (!hasAccess) {
    return (
      <section
        className="qrn-page"
        style={{ alignItems: 'center', justifyContent: 'center' }}
        aria-label="Quarantine access denied"
      >
        <AccessDeniedState
          title="Access Restricted"
          message="Required permission: Analyst, SOC Manager, or Platform Administrator"
        />
      </section>
    );
  }

  return <FileQuarantineContent />;
}

function FileQuarantineContent(): JSX.Element {
  const gridRef = useRef<AgGridReact>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<WorkspaceView>('files');
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<FileStatus>('all');
  const [verdict, setVerdict] = useState<Verdict>('all');
  const [containmentStatus, setContainmentStatus] = useState<IsolationStatus>('all');
  const [isolationPage, setIsolationPage] = useState(0);
  const [search, setSearch] = useState('');
  const [density, setDensity] = useRowDensity();
  const [selectedRows, setSelectedRows] = useState<QuarantinedFileDTO[]>([]);
  const [selectedFile, setSelectedFile] = useState<QuarantinedFileDTO | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pendingAction, setPendingAction] = useState<QuarantineActionTarget | null>(null);
  const epsStream = useEpsStream();

  const query = useMemo(() => ({ page, size: PAGE_SIZE, status: status === 'all' ? undefined : status }), [page, status]);
  const { data, isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = useQuarantinedFiles(query);
  const singleAction = useQuarantineAction();
  const bulkAction = useQuarantineBulkAction();
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.content ?? []).filter((row) => {
      if (verdict !== 'all' && (row.verdict ?? 'unknown') !== verdict) return false;
      if (!needle) return true;
      return [row.filename, row.filePath, row.sha256Hash, row.agentName, row.agentId, row.threatName, row.linkedAlertId]
        .some((value) => value?.toLowerCase().includes(needle));
    });
  }, [data?.content, search, verdict]);

  const requestRestore = useCallback((row: QuarantinedFileDTO) => setPendingAction({ kind: 'single', action: 'restore', row }), []);
  const requestDelete = useCallback((row: QuarantinedFileDTO) => setPendingAction({ kind: 'single', action: 'delete', row }), []);
  const confirmAction = useCallback(() => {
    if (!pendingAction) return;
    if (pendingAction.kind === 'single') singleAction.mutate({ id: pendingAction.row.id, action: pendingAction.action });
    else bulkAction.mutate({ ids: pendingAction.ids, action: pendingAction.action });
    gridRef.current?.api?.deselectAll();
    setSelectedFile(null);
    setPendingAction(null);
  }, [bulkAction, pendingAction, singleAction]);

  useEffect(() => {
    const handleKeys = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement;
      if (element.matches('input, textarea, select, button, a, [contenteditable=true]')) return;
      if (event.key === '/') { event.preventDefault(); searchRef.current?.focus(); return; }
      if (event.key === 'Escape' && selectedFile) { event.preventDefault(); setSelectedFile(null); return; }
      if (view !== 'files' || !rows.length) return;
      if (event.key.toLowerCase() === 'j') { event.preventDefault(); setActiveIndex((index) => Math.min(rows.length - 1, index + 1)); }
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
      if (event.key === 'Enter') { event.preventDefault(); setSelectedFile(rows[activeIndex] ?? rows[0]); }
    };
    document.addEventListener('keydown', handleKeys);
    return () => document.removeEventListener('keydown', handleKeys);
  }, [activeIndex, rows, selectedFile, view]);

  useEffect(() => {
    if (!rows.length) return;
    gridRef.current?.api?.ensureIndexVisible(activeIndex, 'middle');
    gridRef.current?.api?.setFocusedCell(activeIndex, 'filename');
  }, [activeIndex, rows.length]);

  const columns = useMemo<ColDef[]>(() => [
    { checkboxSelection: true, headerCheckboxSelection: true, width: 42, pinned: 'left', sortable: false, resizable: false, suppressHeaderMenuButton: true },
    { field: 'filename', headerName: 'File', flex: 1, minWidth: 190, cellRenderer: ({ data: row }: ICellRendererParams<QuarantinedFileDTO>) => row ? <span className="qrn-primary-cell"><strong>{row.filename}</strong><small>{row.threatName ?? row.filePath}</small></span> : null },
    { field: 'verdict', headerName: 'Verdict', width: 124, cellRenderer: ({ data: row }: ICellRendererParams<QuarantinedFileDTO>) => row ? <VerdictState verdict={row.verdict} /> : null },
    { field: 'agentName', headerName: 'Endpoint', width: 140, cellRenderer: ({ data: row }: ICellRendererParams<QuarantinedFileDTO>) => row ? <span className="qrn-primary-cell"><strong>{row.agentName ?? row.agentId}</strong><small>{row.source ?? row.agentId}</small></span> : null },
    { field: 'sha256Hash', headerName: 'SHA-256', width: 142, cellRenderer: ({ data: row }: ICellRendererParams<QuarantinedFileDTO>) => <button type="button" className="qrn-hash" onClick={(event) => { event.stopPropagation(); copyText(row?.sha256Hash); }} title={row?.sha256Hash}>{shortenedHash(row?.sha256Hash)}<Copy size={11} /></button> },
    { field: 'quarantineTime', headerName: 'Quarantined', width: 128, valueFormatter: ({ value }: { value: string }) => formatTimestamp(value) },
    { field: 'status', headerName: 'State', width: 118, cellRenderer: ({ data: row }: ICellRendererParams<QuarantinedFileDTO>) => row ? <FileState status={row.status} /> : null },
    { field: 'actionState', headerName: 'Delivery', width: 94, cellRenderer: ({ data: row }: ICellRendererParams<QuarantinedFileDTO>) => <span className="qrn-delivery" data-state={row?.actionState ?? 'unknown'}><span />{row?.actionState ?? 'unknown'}</span> },
    { headerName: 'Actions', colId: 'actions', width: 82, sortable: false, resizable: false, suppressHeaderMenuButton: true, cellRenderer: ({ data: row }: ICellRendererParams<QuarantinedFileDTO>) => row ? <RowActions row={row} onRestore={requestRestore} onDelete={requestDelete} /> : null },
  ], [requestDelete, requestRestore]);

  const visibleActive = rows.filter((row) => row.status === 'quarantined').length;
  const visibleMalicious = rows.filter((row) => row.verdict === 'malicious').length;
  const visiblePending = rows.filter((row) => row.actionState === 'pending' || row.actionState === 'failed').length;
  const errorMessage = error instanceof Error ? error.message : 'An error occurred while loading quarantined files.';
  const eligibleSelectedRows = selectedRows.filter(fileActionEligible);
  const actionTitle = pendingAction?.action === 'restore' ? 'Restore quarantined file?' : 'Permanently delete preserved file?';
  const actionMessage = pendingAction ? pendingAction.kind === 'single'
    ? pendingAction.action === 'restore'
      ? `Restore “${pendingAction.row.filename}” to ${pendingAction.row.agentName ?? pendingAction.row.agentId}? The file becomes available on the endpoint again. Verify the detection, signer, prevalence, and endpoint remediation before continuing.`
      : `Permanently delete “${pendingAction.row.filename}” from quarantine? The preserved copy cannot be restored after successful connector delivery.`
    : pendingAction.action === 'restore'
      ? `Request restore for ${pendingAction.count} eligible selected files? ${pendingAction.excluded ? `${pendingAction.excluded} ineligible record${pendingAction.excluded === 1 ? ' is' : 's are'} excluded. ` : ''}Each file becomes available on its endpoint after successful delivery.`
      : `Permanently delete ${pendingAction.count} eligible selected files? ${pendingAction.excluded ? `${pendingAction.excluded} ineligible record${pendingAction.excluded === 1 ? ' is' : 's are'} excluded. ` : ''}Preserved copies cannot be restored after successful delivery.`
    : '';

  return (
    <section className="qrn-page" data-fixture={fixtureMode || undefined} aria-label="Quarantine and containment">
      <header className="qrn-header">
        <div className="qrn-header__identity"><span className="qrn-header__mark"><ShieldOff size={19} /></span><div><span>Response automation</span><h1>Quarantine &amp; Containment</h1></div></div>
        <div className="qrn-header__actions"><span className="qrn-shortcuts"><kbd>J</kbd>/<kbd>K</kbd> navigate <kbd>Enter</kbd> inspect</span><a href="/response/playbooks"><Workflow size={13} />Playbooks</a><a href="/response/activity"><Activity size={13} />Activity</a><a href="/response/authority"><LockKeyhole size={13} />Approvals</a><button type="button" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh quarantine"><RefreshCw size={14} className={isFetching ? 'qrn-spin' : undefined} /></button></div>
      </header>
      {fixtureMode && <div className="qrn-fixture"><strong>Design fixture:</strong> fictional quarantine and containment records are enabled for visual review.<span>Production never receives these records.</span></div>}
      <section className="qrn-summary" aria-label="Quarantine health summary">
        <div><span><FileArchive size={13} />Inventory</span><strong>{data?.totalElements.toLocaleString() ?? '—'}</strong><small>authorized file records</small></div>
        <div data-tone="danger"><span><ShieldAlert size={13} />Malicious</span><strong>{visibleMalicious}</strong><small>on loaded page</small></div>
        <div data-tone="warning"><span><ShieldOff size={13} />Active quarantine</span><strong>{visibleActive}</strong><small>on loaded page</small></div>
        <div data-tone="warning"><span><FileClock size={13} />Needs attention</span><strong>{visiblePending}</strong><small>pending or failed on page</small></div>
        <div data-tone="positive"><span><ShieldCheck size={13} />Connector health</span><strong>{rows.filter((row) => row.connectorState === 'healthy').length}</strong><small>{rows.filter((row) => row.connectorState !== 'healthy').length} degraded on page</small></div>
        <div><span><Clock3 size={13} />Freshness</span><strong>{data?.snapshotAt ? 'Server' : dataUpdatedAt ? 'Client' : '—'}</strong><small>{data?.snapshotAt ? formatFreshnessLabel(data.snapshotAt, data.asOf) : dataUpdatedAt ? `updated ${new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'awaiting snapshot'}</small></div>
      </section>
      <section className="qrn-operations">
        <nav className="qrn-tabs" aria-label="Quarantine workspace views" role="tablist"><button id="qrn-workspace-tab-files" type="button" role="tab" aria-selected={view === 'files'} aria-controls="qrn-workspace-panel-files" tabIndex={view === 'files' ? 0 : -1} data-active={view === 'files'} onClick={() => setView('files')} onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'End') { event.preventDefault(); setView('endpoints'); document.getElementById('qrn-workspace-tab-endpoints')?.focus(); } }}><FileArchive size={13} />Quarantined files <span>{data?.totalElements ?? '—'}</span></button><button id="qrn-workspace-tab-endpoints" type="button" role="tab" aria-selected={view === 'endpoints'} aria-controls="qrn-workspace-panel-endpoints" tabIndex={view === 'endpoints' ? 0 : -1} data-active={view === 'endpoints'} onClick={() => setView('endpoints')} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'Home') { event.preventDefault(); setView('files'); document.getElementById('qrn-workspace-tab-files')?.focus(); } }}><Laptop size={13} />Endpoint isolation</button></nav>
        <div className="qrn-toolbar" role="toolbar" aria-label="Quarantine filters">
          <label className="qrn-search"><Search size={14} /><input ref={searchRef} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={view === 'files' ? 'Search file, hash, endpoint, threat…' : 'Search host, agent, initiator, reason…'} aria-label={view === 'files' ? 'Search quarantined files' : 'Search host isolation'} /><kbd>/</kbd></label>
          <Filter size={13} className="qrn-filter-icon" />
          {view === 'files' ? <>
            <HaCompactSelect<FileStatus> ariaLabel="Quarantine status" label="State" value={status} options={STATUS_OPTIONS} onChange={(value) => { setStatus(value); setPage(0); }} />
            <HaCompactSelect<Verdict> ariaLabel="Threat verdict" label="Verdict" value={verdict} options={VERDICT_OPTIONS} onChange={setVerdict} />
          </> : <>
            <HaCompactSelect<IsolationStatus> ariaLabel="Isolation status" label="State" value={containmentStatus} options={ISOLATION_STATUS_OPTIONS} onChange={(value) => { setContainmentStatus(value); setIsolationPage(0); }} />
            <span className="qrn-scope"><Laptop size={12} />Host isolation only</span>
          </>}
          <span className="qrn-scope"><LockKeyhole size={12} />All authorized tenants</span>
          {view === 'files' && (
            <span className="qrn-snapshot">{data?.stale ? 'Stale snapshot' : formatFreshnessLabel(data?.snapshotAt, data?.asOf, dataUpdatedAt)}</span>
          )}
        </div>
      </section>

      {Boolean(isError || data?.stale || data?.partialFailures?.length) && <div className="qrn-warning" role="status"><AlertTriangle size={14} /><span>{isError ? 'Refresh failed. The file source is unavailable.' : 'Some endpoint sources are delayed; the last usable projection remains visible.'}</span><button type="button" onClick={() => refetch()}>Retry</button></div>}

      <div className="qrn-results-toolbar"><div><strong>{view === 'files' ? 'Quarantined files' : 'Host isolation'}</strong><span>{view === 'files' ? `${rows.length} loaded · ${data?.totalElements ?? 0} total` : 'secured /api/ha-edr/isolation inventory'}</span></div><div className="qrn-density" role="group" aria-label="Row density"><span>Rows</span><button type="button" aria-label="Compact rows" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}><List size={15} /></button><button type="button" aria-label="Standard rows" aria-pressed={density === 'standard'} onClick={() => setDensity('standard')}><AlignJustify size={15} /></button><button type="button" aria-label="Comfortable rows" aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}><AlignJustify size={18} /></button></div></div>

      {selectedRows.length > 0 && view === 'files' && <div className="qrn-selection" role="toolbar" aria-label="Selected quarantine actions"><strong>{selectedRows.length} selected</strong><span>{eligibleSelectedRows.length} eligible · actions exclude restored, deleted, pending, and offline records.</span><button type="button" disabled={!eligibleSelectedRows.length} onClick={() => setPendingAction({ kind: 'bulk', action: 'restore', ids: eligibleSelectedRows.map((row) => row.id), count: eligibleSelectedRows.length, excluded: selectedRows.length - eligibleSelectedRows.length })}><ArchiveRestore size={13} />Restore eligible</button><button type="button" disabled={!eligibleSelectedRows.length} onClick={() => setPendingAction({ kind: 'bulk', action: 'delete', ids: eligibleSelectedRows.map((row) => row.id), count: eligibleSelectedRows.length, excluded: selectedRows.length - eligibleSelectedRows.length })}><Trash2 size={13} />Delete eligible</button></div>}

      {view === 'files' ? <div id="qrn-workspace-panel-files" className="qrn-workspace-panel" role="tabpanel" aria-labelledby="qrn-workspace-tab-files">
        {isError && !data && <div className="qrn-error"><Alert variant="danger" isInline title="Failed to load quarantined files">{errorMessage}</Alert></div>}
        <main className="qrn-grid-wrap">
          {!isLoading && !isError && rows.length === 0 ? <div className="qrn-inline-state" role="status" aria-label="No quarantined files"><ShieldCheck size={26} /><strong>No quarantined files found</strong><span>Files quarantined by HiveArmor agents will appear here. Clear filters or move to another page.</span></div> : <SiemDataGrid ref={gridRef} className="response-grid qrn-grid" columnDefs={columns} rowData={rows} rowHeight={RESPONSE_GRID_ROW_HEIGHTS[density]} height="100%" rowSelection="multiple" suppressRowClickSelection onSelectionChanged={(selected) => setSelectedRows(selected as QuarantinedFileDTO[])} onRowClicked={(event: RowClickedEvent) => setSelectedFile(event.data as QuarantinedFileDTO)} getRowId={(params) => String((params.data as QuarantinedFileDTO).id)} loading={isLoading} defaultColDef={{ filter: false }} ariaLabel="Quarantined file inventory" />}
        </main>
        <footer className="qrn-pagination" aria-label="Quarantine pagination"><span>{data?.totalElements.toLocaleString() ?? 0} matching records</span><span>Page {page + 1} of {Math.max(1, data?.totalPages ?? 1)} · up to {PAGE_SIZE} rows</span><div><button type="button" disabled={page === 0} onClick={() => { setPage((value) => Math.max(0, value - 1)); setActiveIndex(0); }}><ChevronLeft size={13} />Previous</button><button type="button" disabled={!data || page + 1 >= data.totalPages} onClick={() => { setPage((value) => value + 1); setActiveIndex(0); }}>Next<ChevronRight size={13} /></button></div></footer>
      </div> : <div id="qrn-workspace-panel-endpoints" className="qrn-workspace-panel" role="tabpanel" aria-labelledby="qrn-workspace-tab-endpoints"><EndpointContainmentPanel density={density} search={search} status={containmentStatus} page={isolationPage} onPageChange={setIsolationPage} /></div>}

      <div className="qrn-status"><StatusDock sseConnected={fixtureMode || epsStream.connected} eps={fixtureMode ? 12840 : epsStream.eps} mode={fixtureMode ? 'historical' : 'live'} lastUpdated={data?.snapshotAt ? new Date(data.snapshotAt) : dataUpdatedAt ? new Date(dataUpdatedAt) : undefined} /></div>
      {selectedFile && <FileDrawer row={selectedFile} onClose={() => setSelectedFile(null)} onRestore={requestRestore} onDelete={requestDelete} />}
      <HaConfirmationModal isOpen={pendingAction !== null} title={actionTitle} message={actionMessage} confirmLabel={pendingAction?.action === 'restore' ? 'Request restore' : 'Delete permanently'} cancelLabel="Cancel" variant={pendingAction?.action === 'delete' ? 'danger' : 'primary'} onConfirm={confirmAction} onCancel={() => setPendingAction(null)} />
    </section>
  );
}
