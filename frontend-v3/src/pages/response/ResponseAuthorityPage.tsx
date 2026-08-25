/**
 * ResponseAuthorityPage — Phase 7 governed response approvals.
 * Human decisions, blast-radius evidence, delegated authority, policy and audit history.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import type { AgGridReact } from 'ag-grid-react';
import {
  Activity,
  AlertTriangle,
  AlignJustify,
  Ban,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleSlash2,
  Clock3,
  Copy,
  ExternalLink,
  FileClock,
  Filter,
  Gavel,
  History,
  List,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldEllipsis,
  TimerReset,
  UsersRound,
  Workflow,
  XCircle,
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { RESPONSE_GRID_ROW_HEIGHTS } from './response-grid-standard';
import { useRowDensity } from '@/hooks/useRowDensity';
import {
  RESP_020_DISABLED_TITLE,
  RESP_020_GOVERNANCE,
} from './response.capabilities';
import type {
  ResponseApprovalDecisionRequest,
  ResponseApprovalListParams,
  ResponseApprovalRequest,
  ResponseApprovalState,
  ResponseAuthorityPolicy,
} from './response.types';
import {
  decideResponseGovernanceApproval,
  fetchResponseGovernance,
  fixtureMode,
} from './responsePlaybooks.service';

import { AccessDeniedState } from '@/components/access-denied-state/AccessDeniedState';
import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaButton } from '@/components/ha-button/HaButton';
import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { formatAuthorityLabel } from '@/lib/roles';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { useDebounce } from '@/hooks/useDebounce';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useAuthStore } from '@/store/auth.store';
import './ResponseAuthorityPage.css';
import './response-grid-standard.css';

type GovernanceView = 'queue' | 'policies' | 'history';
type StateFilter = ResponseApprovalState | 'ALL';
type RiskFilter = ResponseApprovalRequest['riskLevel'] | 'ALL';

const STATE_OPTIONS: Array<{ value: StateFilter; label: string }> = [
  { value: 'PENDING', label: 'Pending decisions' },
  { value: 'ALL', label: 'All states' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const RISK_OPTIONS: Array<{ value: RiskFilter; label: string }> = [
  { value: 'ALL', label: 'All risk levels' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function timeRemaining(expiresAt: string): { label: string; urgent: boolean; expired: boolean } {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return { label: 'Expired', urgent: true, expired: true };
  const minutes = Math.ceil(remaining / 60_000);
  return { label: minutes < 60 ? `${minutes}m left` : `${Math.floor(minutes / 60)}h ${minutes % 60}m left`, urgent: minutes <= 30, expired: false };
}

function RiskBadge({ risk }: { risk: ResponseApprovalRequest['riskLevel'] }): JSX.Element {
  return <span className="gov-risk" data-risk={risk.toLowerCase()} aria-label={`${risk.toLowerCase()} risk`}><ShieldAlert size={12} />{risk.charAt(0) + risk.slice(1).toLowerCase()}</span>;
}

function StateBadge({ state }: { state: ResponseApprovalState }): JSX.Element {
  const icon = state === 'APPROVED' ? <CheckCircle2 size={12} /> : state === 'REJECTED' ? <XCircle size={12} /> : state === 'PENDING' ? <Clock3 size={12} /> : <CircleSlash2 size={12} />;
  return <span className="gov-state" data-state={state.toLowerCase()} aria-label={`Approval state: ${state.toLowerCase()}`}>{icon}{state.charAt(0) + state.slice(1).toLowerCase()}</span>;
}

function CopyButton({ value, label }: { value: string; label: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_200);
    });
  };
  return <button type="button" className="gov-copy" onClick={copy} aria-label={`Copy ${label}`} title={`Copy ${label}`}>{copied ? <Check size={12} /> : <Copy size={12} />}</button>;
}

interface ApprovalDrawerProps {
  approval: ResponseApprovalRequest;
  onClose: () => void;
  onDecision: (request: ResponseApprovalDecisionRequest) => void;
  decisionPending: boolean;
  decisionError: string | null;
}

function ApprovalDrawer({ approval, onClose, onDecision, decisionPending, decisionError }: ApprovalDrawerProps): JSX.Element {
  const [comment, setComment] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const remaining = timeRemaining(approval.expiresAt);
  const linkedRoute = approval.linkedEntityType === 'ALERT'
    ? `/alerts/${approval.linkedEntityId}`
    : approval.linkedEntityType === 'INCIDENT'
      ? `/incidents/${approval.linkedEntityId}`
      : null;
  const decisionReady = acknowledged && comment.trim().length >= 12 && !decisionPending;

  const decide = (decision: 'APPROVED' | 'REJECTED') => onDecision({
    approvalId: approval.id,
    decision,
    comment: comment.trim(),
    expectedState: 'PENDING',
    acknowledgement: acknowledged,
  });

  return (
    <HaDrawer
      isOpen
      onClose={onClose}
      title={approval.actionName}
      subtitle={`${approval.id} · ${approval.tenantLabel}`}
      width={620}
      footer={
        <>
          <Link className="gov-drawer-button" to={`/response/playbooks/${approval.playbookId}`} onClick={onClose}><Workflow size={14} />Open playbook</Link>
          {linkedRoute && <Link className="gov-drawer-button" to={linkedRoute} onClick={onClose}>Open context<ExternalLink size={13} /></Link>}
        </>
      }
    >
      <div className="gov-drawer-body">
        <div className="gov-drawer-status"><RiskBadge risk={approval.riskLevel} /><StateBadge state={approval.state} /><span data-urgent={remaining.urgent || undefined}><TimerReset size={12} />{remaining.label}</span></div>

        <section className="gov-blast" aria-labelledby="blast-radius-title">
          <div className="gov-section-title"><ShieldAlert size={15} /><div><strong id="blast-radius-title">Blast-radius review</strong><span>Decision-critical scope before execution resumes</span></div></div>
          <div className="gov-blast__metrics">
            <div><span>Targets</span><strong>{approval.targets.length}</strong><small>{approval.targetType}</small></div>
            <div><span>Affected users</span><strong>{approval.affectedUserCount}</strong><small>estimated</small></div>
            <div><span>Downtime</span><strong>{approval.estimatedDowntime}</strong><small>projected impact</small></div>
          </div>
          <ul className="gov-target-list">{approval.targets.map((target) => <li key={target}><code>{target}</code><CopyButton value={target} label="target" /></li>)}</ul>
        </section>

        {approval.changeWindowState !== 'OPEN' && (
          <section className="gov-guard-notice" data-tone="warning"><LockKeyhole size={16} /><div><strong>{approval.changeWindowState === 'RESTRICTED' ? 'Restricted change window' : 'Emergency approval path required'}</strong><span>This action needs the policy-defined exception path before execution can continue.</span></div></section>
        )}
        {approval.connectorState !== 'HEALTHY' && (
          <section className="gov-guard-notice" data-tone="danger"><AlertTriangle size={16} /><div><strong>{approval.connectorName} is degraded</strong><span>Approval does not guarantee execution. The connector is revalidated immediately before the action.</span></div></section>
        )}

        <section className="gov-evidence" aria-labelledby="decision-evidence-title">
          <div className="gov-section-title"><FileClock size={15} /><div><strong id="decision-evidence-title">Decision evidence</strong><span>Bounded, tenant-authorized projection</span></div></div>
          <p>{approval.evidenceSummary}</p>
          <dl className="gov-detail-grid">
            <div><dt>Confidence</dt><dd>{approval.confidence}%</dd></div>
            <div><dt>Connector</dt><dd>{approval.connectorName}</dd></div>
            <div><dt>Requested by</dt><dd>{approval.requestedBy} · {approval.requesterRole}</dd></div>
            <div><dt>Requested</dt><dd>{formatTimestamp(approval.requestedAt)}</dd></div>
            <div><dt>Policy</dt><dd>{approval.approvalPolicy}</dd></div>
            <div><dt>Required authority</dt><dd>{formatAuthorityLabel(approval.requiredPermission)}</dd></div>
          </dl>
        </section>

        <section className="gov-approval-path" aria-labelledby="approval-path-title">
          <div className="gov-section-title"><UsersRound size={15} /><div><strong id="approval-path-title">Approval path</strong><span>Tier {approval.approvalTier} · {approval.approvalsReceived}/{approval.approvalsRequired} approvals recorded</span></div></div>
          <div className="gov-path-steps">
            {Array.from({ length: approval.approvalsRequired }, (_, index) => <span key={index} data-complete={index < approval.approvalsReceived || undefined}>{index < approval.approvalsReceived ? <Check size={12} /> : index + 1}</span>)}
            <div>{approval.eligibleApproverGroups.join(' or ')}</div>
          </div>
          <p><ShieldCheck size={13} />{approval.separationOfDutiesSatisfied ? 'Requester and approver duties are separated.' : 'Separation-of-duties validation is incomplete.'}</p>
        </section>

        <section className="gov-rollback" data-reversible={approval.reversible || undefined}>
          <RotateCcw size={15} />
          <div><strong>{approval.reversible ? 'Rollback available' : 'Irreversible action'}</strong><span>{approval.rollbackGuidance ?? 'The process cannot be restored after termination. Recovery requires starting a new process or service.'}</span></div>
        </section>

        {approval.state === 'PENDING' ? (
          <section className="gov-decision" aria-labelledby="decision-title">
            <div className="gov-section-title"><Gavel size={15} /><div><strong id="decision-title">Record decision</strong><span>The rationale is written to the immutable response audit log.</span></div></div>
            <label htmlFor="decision-comment">Decision rationale <span>required · minimum 12 characters</span></label>
            <textarea id="decision-comment" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={500} placeholder="State the evidence, operational risk and rollback consideration…" />
            <label className="gov-ack"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I reviewed the targets, blast radius, change-window state and rollback guidance.</span></label>
            {decisionError && <div className="gov-decision-error" role="alert"><AlertTriangle size={13} />{decisionError}</div>}
            <div className="gov-decision-actions">
              <button type="button" className="gov-decision-button gov-decision-button--reject" onClick={() => decide('REJECTED')} disabled={!decisionReady}><Ban size={14} />Reject</button>
              <button type="button" className="gov-decision-button gov-decision-button--approve" onClick={() => decide('APPROVED')} disabled={!decisionReady}><CheckCircle2 size={14} />Approve and continue</button>
            </div>
          </section>
        ) : (
          <section className="gov-decision-record"><StateBadge state={approval.state} /><div><strong>{approval.decisionBy ?? 'Policy engine'}</strong><span>{formatTimestamp(approval.decisionAt)} · {approval.decisionComment ?? 'No comment recorded'}</span></div></section>
        )}

        <section className="gov-audit-ids">
          <div><span>Audit ID</span><code>{approval.auditId}</code><CopyButton value={approval.auditId} label="audit ID" /></div>
          <div><span>Correlation ID</span><code>{approval.correlationId}</code><CopyButton value={approval.correlationId} label="correlation ID" /></div>
        </section>
      </div>
    </HaDrawer>
  );
}

function PolicyView({
  policies,
  delegates,
  canEditGovernance,
}: {
  policies: ResponseAuthorityPolicy[];
  delegates: NonNullable<Awaited<ReturnType<typeof fetchResponseGovernance>>['delegates']>;
  canEditGovernance: boolean;
}): JSX.Element {
  return (
    <div className="gov-policy-workspace">
      <section className="gov-policy-main">
        <header>
          <div>
            <strong>Enforced response policies</strong>
            <span>Deterministic gates evaluated before disruptive actions</span>
          </div>
          <div className="gov-policy-head-actions">
            <span>{policies.filter((policy) => policy.status === 'ENFORCED').length} enforced</span>
            {canEditGovernance ? (
              <Link to="/response/authority/policies/new"><Plus size={12} />New policy</Link>
            ) : (
              <span title={RESP_020_DISABLED_TITLE}>Policy authoring unavailable</span>
            )}
          </div>
        </header>
        <div className="gov-policy-grid">
          {policies.map((policy) => (
            <article key={policy.id} className="gov-policy-card">
              <div className="gov-policy-card__head"><span className="gov-policy-icon"><ShieldEllipsis size={16} /></span><div><strong>{policy.name}</strong><span>{policy.actionCategory} · {policy.riskFloor.toLowerCase()}+ · v{policy.version}</span></div>{canEditGovernance && <Link className="gov-edit-link" to={`/response/authority/policies/${policy.id}/edit`} aria-label={`Edit policy ${policy.name}`}><Pencil size={12} /></Link>}<em data-status={policy.status.toLowerCase()}>{policy.status}</em></div>
              <dl>
                <div><dt>Approvals</dt><dd>{policy.requiredApprovals}</dd></div>
                <div><dt>Self approval</dt><dd>{policy.selfApprovalAllowed ? 'Allowed' : 'Blocked'}</dd></div>
                <div><dt>Change window</dt><dd>{policy.changeWindow}</dd></div>
                <div><dt>Rollback</dt><dd>{policy.rollbackRequired ? 'Required' : 'Optional'}</dd></div>
              </dl>
              <p>{policy.approverGroups.join(' · ')}</p>
              <footer><span>{policy.tenantScope}</span><span>{formatTimestamp(policy.lastChangedAt)} · {policy.lastChangedBy}</span></footer>
            </article>
          ))}
        </div>
      </section>
      <aside className="gov-delegates">
        <header>
          <div>
            <strong>Delegated authority</strong>
            <span>Time-bound principals</span>
          </div>
          {canEditGovernance ? (
            <Link className="gov-add-delegate" to="/response/authority/delegations/new"><Plus size={12} />Delegate</Link>
          ) : (
            <span title={RESP_020_DISABLED_TITLE}>Delegation unavailable</span>
          )}
        </header>
        <div className="gov-delegate-list">
          {delegates.map((delegate) => (
            <article key={delegate.id}>
              <div><span className="gov-principal-icon"><UsersRound size={15} /></span><div><strong>{delegate.principal}</strong><span>Tier {delegate.authorityTier} · {delegate.principalType.toLowerCase()} · v{delegate.version}</span></div>{canEditGovernance && <Link className="gov-edit-link" to={`/response/authority/delegations/${delegate.id}/edit`} aria-label={`Edit delegation ${delegate.principal}`}><Pencil size={12} /></Link>}<em data-status={delegate.status.toLowerCase()}>{delegate.status}</em></div>
              <p>{delegate.actionScopes.join(' · ')}</p>
              <small>{delegate.tenantScope}</small>
              <footer><span>{delegate.emergencyAccess ? 'Emergency authority' : 'Standard authority'}</span><span>until {formatTimestamp(delegate.validUntil)}</span></footer>
            </article>
          ))}
        </div>
        <section className="gov-policy-boundary"><LockKeyhole size={15} /><div><strong>Authoritative publish gate</strong><span>{canEditGovernance ? 'Draft editing is available. Production publication remains blocked until the versioned governance contract validates the change.' : RESP_020_DISABLED_TITLE}</span></div></section>
      </aside>
    </div>
  );
}

export function ResponseAuthorityPage(): JSX.Element {
  const gridRef = useRef<AgGridReact>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const epsStream = useEpsStream();
  const canReview = user?.roles?.some((role) => ['ROLE_SOC_MANAGER', 'ROLE_ADMIN'].includes(role)) ?? false;

  const [view, setView] = useState<GovernanceView>(() => searchParams.get('view') === 'policies' ? 'policies' : searchParams.get('view') === 'history' ? 'history' : 'queue');
  const [searchText, setSearchText] = useState('');
  const search = useDebounce(searchText.trim(), 250);
  const [stateFilter, setStateFilter] = useState<StateFilter>('PENDING');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('ALL');
  const [density, setDensity] = useRowDensity();
  const [selected, setSelected] = useState<ResponseApprovalRequest | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const params = useMemo<ResponseApprovalListParams>(() => ({
    state: view === 'history' ? 'ALL' : stateFilter,
    risk: riskFilter,
    tenantScope: 'authorized',
    search: search || undefined,
    limit: 100,
  }), [riskFilter, search, stateFilter, view]);

  const { data, isLoading, isError, error, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['response-governance', params],
    queryFn: () => fetchResponseGovernance(params),
    enabled: canReview,
    staleTime: 10_000,
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  });

  const decisionMutation = useMutation({
    mutationFn: decideResponseGovernanceApproval,
    onSuccess: (updated) => {
      setSelected(updated);
      void queryClient.invalidateQueries({ queryKey: ['response-governance'] });
    },
  });

  const queueItems = useMemo(() => {
    const approvals = data?.approvals ?? [];
    return view === 'history' ? approvals.filter((item) => item.state !== 'PENDING') : approvals;
  }, [data?.approvals, view]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, button, [contenteditable="true"]') || !queueItems.length || view === 'policies') return;
      if (event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setActiveIndex((index) => Math.min(queueItems.length - 1, index + 1));
      } else if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setActiveIndex((index) => Math.max(0, index - 1));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        setSelected(queueItems[activeIndex]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIndex, queueItems, view]);

  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.ensureIndexVisible(activeIndex, 'middle');
    api.getDisplayedRowAtIndex(activeIndex)?.setSelected(true, true);
  }, [activeIndex, queueItems]);

  const openRow = useCallback((event: RowClickedEvent<ResponseApprovalRequest>) => {
    if (!event.data) return;
    setActiveIndex(event.rowIndex ?? 0);
    setSelected(event.data);
  }, []);

  const columnDefs = useMemo<ColDef<ResponseApprovalRequest>[]>(() => [
    { field: 'requestedAt', headerName: 'Requested', width: 130, sort: 'desc', cellRenderer: ({ data: row }: { data: ResponseApprovalRequest }) => <span className="gov-mono">{formatTimestamp(row.requestedAt)}</span> },
    { field: 'actionName', headerName: 'Action / playbook', minWidth: 220, flex: 1, cellRenderer: ({ data: row }: { data: ResponseApprovalRequest }) => <span className="gov-primary-cell"><strong>{row.actionName}</strong><small>{row.playbookName} · v{row.playbookVersion}</small></span> },
    { field: 'riskLevel', headerName: 'Risk', width: 104, cellRenderer: ({ data: row }: { data: ResponseApprovalRequest }) => <RiskBadge risk={row.riskLevel} /> },
    { field: 'targets', headerName: 'Target scope', width: 156, cellRenderer: ({ data: row }: { data: ResponseApprovalRequest }) => <span className="gov-primary-cell"><strong>{row.targets[0]}</strong><small>{row.targets.length} {row.targetType.toLowerCase()}</small></span> },
    { field: 'requestedBy', headerName: 'Requester', width: 118 },
    { field: 'approvalPolicy', headerName: 'Policy gate', width: 168, cellRenderer: ({ data: row }: { data: ResponseApprovalRequest }) => <span className="gov-policy-cell"><strong>Tier {row.approvalTier} · {row.approvalsReceived}/{row.approvalsRequired}</strong><small>{row.approvalPolicy}</small></span> },
    { field: 'expiresAt', headerName: 'Decision SLA', width: 94, cellRenderer: ({ data: row }: { data: ResponseApprovalRequest }) => { const remaining = timeRemaining(row.expiresAt); return <span className="gov-sla" data-urgent={remaining.urgent || undefined}>{remaining.label}</span>; } },
    { field: 'state', headerName: 'State', width: 108, cellRenderer: ({ data: row }: { data: ResponseApprovalRequest }) => <StateBadge state={row.state} /> },
    { headerName: '', colId: 'open', width: 34, sortable: false, filter: false, cellRenderer: () => <ChevronRight size={14} className="gov-row-chevron" /> },
  ], []);

  if (!canReview) return <section className="gov-page gov-page--center"><AccessDeniedState message="Response governance requires SOC Manager or Platform Administrator authority." /></section>;
  if (isError && !data) return <section className="gov-page gov-page--center"><ErrorState title="Could not load response governance" message={error instanceof Error ? error.message : 'Unexpected error'} onRetry={() => refetch()} /></section>;

  const summary = data?.summary;
  const decisionError = decisionMutation.error instanceof Error ? decisionMutation.error.message : null;

  return (
    <section className="gov-page" aria-label="Response governance" data-fixture={fixtureMode || undefined}>
      <header className="gov-header">
        <div className="gov-header__identity"><span className="gov-header__mark"><Gavel size={19} /></span><div><span>Response automation</span><h1>Response Governance</h1></div></div>
        <div className="gov-header__actions">
          <span className="gov-shortcuts"><kbd>J</kbd>/<kbd>K</kbd> navigate <kbd>Enter</kbd> review</span>
          <HaButton className="gov-header-action" variant="secondary" icon={<BookOpen size={13} />} onClick={() => navigate('/response/playbooks')}>Playbooks</HaButton>
          <HaButton className="gov-header-action" variant="secondary" icon={<Activity size={13} />} onClick={() => navigate('/response/activity')}>Activity</HaButton>
          <HaButton className="gov-header-action gov-header-action--icon" variant="plain" icon={<RefreshCw size={13} className={isFetching ? 'gov-spin' : undefined} />} onClick={() => refetch()} isDisabled={isFetching} aria-label="Refresh governance" />
        </div>
      </header>

      {fixtureMode && <div className="gov-fixture"><strong>Design fixture:</strong> fictional approval and policy records are enabled for visual review.<span>Production never receives these records.</span></div>}
      {!fixtureMode && !RESP_020_GOVERNANCE && (
        <div className="gov-fixture" role="status">
          <strong>Governance unavailable:</strong> {RESP_020_DISABLED_TITLE}
          <span>Approvals and policies will appear when the secured governance contract is connected.</span>
        </div>
      )}

      <section className="gov-summary" aria-label="Response governance summary">
        <div data-tone="warning"><span><Clock3 size={13} />Pending</span><strong>{summary?.pending ?? '—'}</strong><small>{summary?.dueSoon ?? 0} due within 30 minutes</small></div>
        <div data-tone="danger"><span><ShieldAlert size={13} />Critical risk</span><strong>{summary?.critical ?? '—'}</strong><small>disruptive response decisions</small></div>
        <div data-tone="warning"><span><LockKeyhole size={13} />Restricted window</span><strong>{summary?.restrictedWindow ?? '—'}</strong><small>exception path required</small></div>
        <div data-tone="positive"><span><CheckCircle2 size={13} />Approved · 24h</span><strong>{summary?.approved24h ?? '—'}</strong><small>{summary?.rejected24h ?? 0} rejected</small></div>
        <div><span><TimerReset size={13} />Median decision</span><strong>{summary ? formatDuration(summary.medianDecisionMs) : '—'}</strong><small>approval response time</small></div>
        <div data-tone={summary?.connectorWarnings ? 'warning' : 'positive'}><span><Workflow size={13} />Connector warnings</span><strong>{summary?.connectorWarnings ?? '—'}</strong><small>revalidated before execution</small></div>
      </section>

      <div className="gov-operations">
        <nav className="gov-tabs" aria-label="Response governance views">
          <button type="button" data-active={view === 'queue' || undefined} onClick={() => { setView('queue'); setSearchParams({}); setStateFilter('PENDING'); setActiveIndex(0); }}><Gavel size={14} />Approval queue <span>{summary?.pending ?? 0}</span></button>
          <button type="button" data-active={view === 'policies' || undefined} onClick={() => { setView('policies'); setSearchParams({ view: 'policies' }); }}><ShieldEllipsis size={14} />Authority policy <span>{data?.policies.length ?? 0}</span></button>
          <button type="button" data-active={view === 'history' || undefined} onClick={() => { setView('history'); setSearchParams({ view: 'history' }); setStateFilter('ALL'); setActiveIndex(0); }}><History size={14} />Decision history</button>
        </nav>
        {view !== 'policies' && (
          <div className="gov-filters" role="toolbar" aria-label="Approval filters">
            <label className="gov-search"><Search size={14} /><input type="search" value={searchText} onChange={(event) => { setSearchText(event.target.value); setActiveIndex(0); }} placeholder="Search action, target, requester or context…" aria-label="Search approvals" /><kbd>/</kbd></label>
            <Filter size={13} className="gov-filter-icon" />
            <HaCompactSelect<StateFilter> ariaLabel="Approval state" label="State" options={STATE_OPTIONS} value={stateFilter} onChange={(value) => { setStateFilter(value); setActiveIndex(0); }} />
            <HaCompactSelect<RiskFilter> ariaLabel="Approval risk" label="Risk" options={RISK_OPTIONS} value={riskFilter} onChange={(value) => { setRiskFilter(value); setActiveIndex(0); }} />
            <span className="gov-snapshot">Snapshot {formatTimestamp(data?.snapshotAt ?? null)}</span>
          </div>
        )}
      </div>

      {!!data?.partialFailures.length && <div className="gov-data-warning"><AlertTriangle size={13} />Partial governance data: {data.partialFailures.join(', ')}<button type="button" onClick={() => refetch()}>Retry</button></div>}

      {view === 'policies' ? (
        <main className="gov-policy-shell">{isLoading ? <div className="gov-skeleton" role="status">Loading governance policies…</div> : <PolicyView policies={data?.policies ?? []} delegates={data?.delegates ?? []} canEditGovernance={fixtureMode || RESP_020_GOVERNANCE} />}</main>
      ) : (
        <>
          <div className="gov-results-toolbar"><div><strong>{view === 'history' ? 'Decision history' : 'Approval requests'}</strong><span>{queueItems.length} loaded · bounded authorized scope</span></div><div className="gov-density" role="group" aria-label="Row density"><span>Rows</span><button type="button" aria-label="Compact rows" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}><List size={15} /></button><button type="button" aria-label="Standard rows" aria-pressed={density === 'standard'} onClick={() => setDensity('standard')}><AlignJustify size={15} /></button><button type="button" aria-label="Comfortable rows" aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}><AlignJustify size={17} /></button></div></div>
          <main className="gov-grid-wrap">
            {isLoading ? <div className="gov-grid-skeleton" role="status" aria-live="polite">{Array.from({ length: 10 }, (_, index) => <div key={index} />)}</div> : !queueItems.length ? <EmptyState title={!fixtureMode && !RESP_020_GOVERNANCE ? 'Response governance unavailable' : view === 'history' ? 'No decisions match these filters' : 'No response actions need approval'} description={!fixtureMode && !RESP_020_GOVERNANCE ? RESP_020_DISABLED_TITLE : 'Adjust the filters or wait for the next governed response request.'} /> : <SiemDataGrid ref={gridRef} className="response-grid gov-grid" columnDefs={columnDefs} rowData={queueItems} rowHeight={RESPONSE_GRID_ROW_HEIGHTS[density]} rowSelection="single" suppressRowClickSelection={false} onRowClicked={openRow} getRowId={(params) => (params.data as ResponseApprovalRequest).id} ariaLabel={view === 'history' ? 'Response decision history' : 'Response approval queue'} defaultColDef={{ filter: false }} />}
          </main>
          <footer className="gov-footer"><span>{queueItems.length} records in the loaded projection</span><span>{view === 'history' ? 'Immutable decision ledger' : 'No request opens without explicit selection'}</span><span>{isFetching ? 'Updating…' : 'Current snapshot'}</span></footer>
        </>
      )}

      <div className="gov-status-dock"><StatusDock sseConnected={fixtureMode || epsStream.connected} eps={fixtureMode ? 12840 : epsStream.eps} mode={fixtureMode ? 'historical' : 'live'} lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : undefined} /></div>
      {selected && <ApprovalDrawer key={`${selected.id}-${selected.state}`} approval={selected} onClose={() => { setSelected(null); decisionMutation.reset(); }} onDecision={(request) => decisionMutation.mutate(request)} decisionPending={decisionMutation.isPending} decisionError={decisionError} />}
    </section>
  );
}
