import { useEffect, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Crosshair,
  ExternalLink,
  FileKey2,
  GripVertical,
  History,
  ListTree,
  Maximize2,
  Network,
  PanelRightOpen,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Tag,
  UserRound,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { alertTriageFixtureMode, fetchAlertTriageDetail } from './alertTriage.service';
import type { AlertTriageAction, AlertTriageDetail } from './alertTriage.types';

import { getSeverityLabel, numericToSeverityLevel } from '@/lib/severity';
import { useAuthStore } from '@/store/auth.store';

export interface AlertDetailDrawerProps {
  alertId: string | null;
  onClose: () => void;
  width?: number;
  onWidthChange?: (width: number) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onRequestAction?: (action: AlertTriageAction, alertIds: string[]) => void;
}

type DrawerTab = 'triage' | 'evidence' | 'history' | 'response';

const drawerTabs: { id: DrawerTab; label: string; icon: typeof Activity }[] = [
  { id: 'triage', label: 'Triage', icon: Radar },
  { id: 'evidence', label: 'Evidence', icon: FileKey2 },
  { id: 'history', label: 'History', icon: History },
  { id: 'response', label: 'Response', icon: ShieldCheck },
];

function formatDateTime(value: string | undefined): string {
  return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' }) : 'Unavailable';
}

function statusLabel(code: number): string {
  switch (code) {
    case 1: return 'Automatic review';
    case 2: return 'Open';
    case 3: return 'In review';
    case 5: return 'Completed';
    case 6: return 'True positive';
    case 7: return 'False positive';
    default: return 'Unknown';
  }
}

function EmptyContractState({ title, contract }: { title: string; contract: string }): JSX.Element {
  return (
    <div className="alert-drawer-empty">
      <ListTree size={20} aria-hidden="true" />
      <strong>{title}</strong>
      <span>Requires backend contract {contract}. No production evidence is inferred.</span>
    </div>
  );
}

function CopyValueButton({ value, label }: { value: string; label: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="alert-drawer-copy"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? <CheckCircle2 size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
    </button>
  );
}

function TriageView({ alert }: { alert: AlertTriageDetail }): JSX.Element {
  return (
    <div className="alert-drawer-view alert-drawer-view--triage">
      <section className="alert-drawer-card alert-drawer-card--reason" aria-labelledby="drawer-reason-heading">
        <div className="alert-drawer-card__heading">
          <ShieldAlert size={15} aria-hidden="true" />
          <h3 id="drawer-reason-heading">Why this is prioritized</h3>
        </div>
        {alert.reason ? <p>{alert.reason}</p> : <EmptyContractState title="Rendered alert reason unavailable" contract="ALT-009" />}
        <div className="alert-drawer-score-row">
          <div><span>Risk</span><strong data-tone={(alert.riskScore ?? 0) >= 90 ? 'critical' : 'high'}>{alert.riskScore ?? '—'}<small>/100</small></strong></div>
          <div><span>Confidence</span><strong>{alert.confidence ?? '—'}{alert.confidence !== undefined ? <small>%</small> : null}</strong></div>
          <div><span>Occurrences</span><strong>{alert.occurrenceCount ?? '—'}</strong></div>
        </div>
      </section>

      <section className="alert-drawer-card" aria-labelledby="drawer-scope-heading">
        <div className="alert-drawer-card__heading">
          <Crosshair size={15} aria-hidden="true" />
          <h3 id="drawer-scope-heading">Investigation scope</h3>
        </div>
        <dl className="alert-drawer-facts">
          <div><dt>Primary entity</dt><dd>{alert.primaryEntity?.label ?? alert.assetId ?? 'Unavailable'}<small>{alert.primaryEntity?.type ?? 'entity'}</small></dd></div>
          <div><dt>Owner</dt><dd>{alert.assigneeName ?? 'Unassigned'}</dd></div>
          <div><dt>Tenant</dt><dd>{alert.tenantName ?? 'Current tenant'}</dd></div>
          <div><dt>SLA</dt><dd data-tone={alert.slaBreached ? 'critical' : 'neutral'}>{alert.slaBreached ? 'Breached' : alert.slaDeadline ? formatDateTime(alert.slaDeadline) : 'Unavailable'}</dd></div>
        </dl>
      </section>

      <section className="alert-drawer-card" aria-labelledby="drawer-detection-heading">
        <div className="alert-drawer-card__heading">
          <Radar size={15} aria-hidden="true" />
          <h3 id="drawer-detection-heading">Detection context</h3>
        </div>
        <dl className="alert-drawer-detail-list">
          <div><dt>Rule</dt><dd>{alert.ruleName ?? 'Unavailable'}{alert.ruleId && <code>{alert.ruleId}</code>}</dd></div>
          <div><dt>ATT&amp;CK</dt><dd>{alert.mitreTechniqueId ?? 'Unavailable'}{alert.mitreTacticName && <small>{alert.mitreTacticName}</small>}</dd></div>
          <div><dt>Source</dt><dd>{alert.sourceProduct ?? 'Unavailable'}</dd></div>
          <div><dt>Supporting data</dt><dd>{alert.eventCount ?? '—'} events · {alert.relatedAlertCount ?? '—'} related alerts</dd></div>
        </dl>
      </section>

      {alert.threatIntelMatched && (
        <section className="alert-drawer-card alert-drawer-card--intel" aria-labelledby="drawer-intel-heading">
          <div className="alert-drawer-card__heading">
            <Network size={15} aria-hidden="true" />
            <h3 id="drawer-intel-heading">Threat-intelligence match</h3>
          </div>
          <p>{alert.threatIntelIndicatorType?.toUpperCase() ?? 'Indicator'} matched by {alert.threatIntelSource ?? 'an authorized intelligence source'}.</p>
          <div className="alert-drawer-inline-meta"><span>Confidence {alert.threatIntelConfidence ?? '—'}%</span><span>TLP:{alert.threatIntelTlp ?? 'UNSPECIFIED'}</span></div>
        </section>
      )}
    </div>
  );
}

function EvidenceView({ alert }: { alert: AlertTriageDetail }): JSX.Element {
  return (
    <div className="alert-drawer-view">
      <section className="alert-drawer-card alert-drawer-card--flush" aria-labelledby="drawer-evidence-heading">
        <div className="alert-drawer-card__heading">
          <FileKey2 size={15} aria-hidden="true" />
          <h3 id="drawer-evidence-heading">Highlighted evidence</h3>
          <span>{alert.evidenceFields.length}</span>
        </div>
        {alert.evidenceFields.length ? (
          <dl className="alert-drawer-evidence-list">
            {alert.evidenceFields.map((field) => (
              <div key={`${field.field}-${field.value}`} data-tone={field.emphasis}>
                <dt>{field.field}<small>{field.source}</small></dt>
                <dd><code title={field.value}>{field.value}</code><CopyValueButton value={field.value} label={field.field} /></dd>
              </div>
            ))}
          </dl>
        ) : <EmptyContractState title="Highlighted evidence unavailable" contract="ALT-011" />}
      </section>

      <section className="alert-drawer-card" aria-labelledby="drawer-entities-heading">
        <div className="alert-drawer-card__heading"><UserRound size={15} aria-hidden="true" /><h3 id="drawer-entities-heading">Observed sides</h3></div>
        <div className="alert-drawer-sides">
          <div><span>Source</span><strong>{alert.adversary?.hostname ?? alert.adversary?.ip ?? 'Unavailable'}</strong><small>{alert.adversary?.processName ?? alert.adversary?.username ?? 'No process or user projection'}</small></div>
          <ChevronRight size={16} aria-hidden="true" />
          <div><span>Target</span><strong>{alert.target?.hostname ?? alert.target?.ip ?? 'Unavailable'}</strong><small>{alert.target?.processName ?? alert.target?.username ?? 'No process or user projection'}</small></div>
        </div>
      </section>
    </div>
  );
}

function HistoryView({ alert }: { alert: AlertTriageDetail }): JSX.Element {
  if (!alert.activity.length) return <div className="alert-drawer-view"><EmptyContractState title="Alert activity is unavailable" contract="ALT-008" /></div>;

  return (
    <div className="alert-drawer-view">
      <section className="alert-drawer-card alert-drawer-card--flush" aria-labelledby="drawer-history-heading">
        <div className="alert-drawer-card__heading"><History size={15} aria-hidden="true" /><h3 id="drawer-history-heading">Alert history</h3><span>{alert.activity.length}</span></div>
        <ol className="alert-drawer-activity">
          {alert.activity.map((item) => (
            <li key={item.id}>
              <span className="alert-drawer-activity__marker" aria-hidden="true"><Activity size={12} /></span>
              <div><strong>{item.action}</strong><p>{item.detail}</p><small>{item.actor} · <time dateTime={item.at}>{formatDateTime(item.at)}</time></small></div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function ResponseView({ alert, onRequestAction }: { alert: AlertTriageDetail; onRequestAction?: AlertDetailDrawerProps['onRequestAction'] }): JSX.Element {
  const canAssign = useAuthStore((state) => state.hasAnyRole(['ROLE_SOC_MANAGER', 'ROLE_ADMIN']));
  const assignEnabled = Boolean(onRequestAction) && (alertTriageFixtureMode || canAssign);
  const request = (action: AlertTriageAction): void => onRequestAction?.(action, [alert.id]);
  return (
    <div className="alert-drawer-view">
      <section className="alert-drawer-card alert-drawer-card--response" aria-labelledby="drawer-response-heading">
        <div className="alert-drawer-card__heading"><ShieldCheck size={15} aria-hidden="true" /><h3 id="drawer-response-heading">Triage decisions</h3></div>
        <p className="alert-drawer-response-note">Lifecycle changes require an analyst reason and explicit confirmation. Response actions remain in the full investigation workspace.</p>
        <div className="alert-drawer-action-list">
          <button type="button" onClick={() => request('acknowledge')} disabled={!onRequestAction || alert.statusCode >= 5}><ClipboardCheck size={15} aria-hidden="true" /><span><strong>Acknowledge and review</strong><small>Move this alert into active investigation.</small></span></button>
          <button type="button" onClick={() => request('true_positive')} disabled={!onRequestAction || alert.statusCode >= 5}><ShieldAlert size={15} aria-hidden="true" /><span><strong>Classify true positive</strong><small>Record a verified security outcome.</small></span></button>
          <button type="button" onClick={() => request('false_positive')} disabled={!onRequestAction || alert.statusCode >= 5}><CheckCircle2 size={15} aria-hidden="true" /><span><strong>Classify false positive</strong><small>Requires reason and detection feedback.</small></span></button>
          <button
            type="button"
            onClick={() => request('assign')}
            disabled={!assignEnabled}
            title={!assignEnabled && !alertTriageFixtureMode ? 'Required permission: SOC Manager' : undefined}
          >
            <UserRound size={15} aria-hidden="true" />
            <span>
              <strong>Assign owner</strong>
              <small>{assignEnabled ? 'Preview analyst workload and eligibility.' : 'Required permission: SOC Manager'}</small>
            </span>
          </button>
          <button type="button" onClick={() => request('tag')} disabled={!onRequestAction}>
            <Tag size={15} aria-hidden="true" />
            <span><strong>Add triage tags</strong><small>Apply consistent classification labels.</small></span>
          </button>
        </div>
      </section>
    </div>
  );
}

export function AlertDetailDrawer({
  alertId,
  onClose,
  width = 480,
  onWidthChange,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  onRequestAction,
}: AlertDetailDrawerProps): JSX.Element | null {
  const [activeTab, setActiveTab] = useState<DrawerTab>('triage');
  const tabRefs = useRef<Record<DrawerTab, HTMLButtonElement | null>>({ triage: null, evidence: null, history: null, response: null });

  const detailQuery = useQuery({
    queryKey: ['alert', 'triage', alertId],
    queryFn: ({ signal }) => fetchAlertTriageDetail(alertId as string, signal),
    enabled: Boolean(alertId),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (alertId) setActiveTab('triage');
  }, [alertId]);

  useEffect(() => {
    if (!alertId) return undefined;
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [alertId, onClose]);

  if (!alertId) return null;

  const alert = detailQuery.data;
  const severity = numericToSeverityLevel(alert?.severity ?? 1);

  const startResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!onWidthChange) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent: PointerEvent): void => onWidthChange(Math.min(680, Math.max(400, startWidth + startX - moveEvent.clientX)));
    const stop = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tab: DrawerTab): void => {
    const index = drawerTabs.findIndex((item) => item.id === tab);
    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % drawerTabs.length : event.key === 'ArrowLeft' ? (index - 1 + drawerTabs.length) % drawerTabs.length : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const nextTab = drawerTabs[nextIndex].id;
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  return (
    <aside className="alert-triage-drawer" aria-label="Alert triage context" style={{ width }}>
      <div
        className="alert-triage-drawer__resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize alert drawer"
        aria-valuemin={400}
        aria-valuemax={680}
        aria-valuenow={width}
        tabIndex={onWidthChange ? 0 : -1}
        onPointerDown={startResize}
        onKeyDown={(event) => {
          if (!onWidthChange) return;
          if (event.key === 'ArrowLeft') { event.preventDefault(); onWidthChange(Math.min(680, width + 24)); }
          if (event.key === 'ArrowRight') { event.preventDefault(); onWidthChange(Math.max(400, width - 24)); }
          if (event.key === 'Home') { event.preventDefault(); onWidthChange(400); }
          if (event.key === 'End') { event.preventDefault(); onWidthChange(680); }
        }}
      ><GripVertical size={14} aria-hidden="true" /></div>

      <header className="alert-triage-drawer__header">
        <div className="alert-triage-drawer__utility">
          <span className="alert-triage-drawer__queue-position">Queue context</span>
          <div>
            <button type="button" onClick={onPrevious} disabled={!hasPrevious} aria-label="Previous visible alert" title="Previous alert (K)"><ChevronLeft size={15} /></button>
            <button type="button" onClick={onNext} disabled={!hasNext} aria-label="Next visible alert" title="Next alert (J)"><ChevronRight size={15} /></button>
            {onWidthChange && <button type="button" onClick={() => onWidthChange(width >= 560 ? 440 : 600)} aria-label="Toggle drawer width" title="Toggle compact or wide drawer"><PanelRightOpen size={15} /></button>}
            <Link to={`/alerts/${encodeURIComponent(alertId)}`} aria-label="Open full alert investigation" title="Open full investigation"><Maximize2 size={15} /></Link>
            <button type="button" onClick={onClose} aria-label="Close alert drawer" title="Close"><X size={16} /></button>
          </div>
        </div>

        {detailQuery.isLoading && <div className="alert-drawer-header-skeleton" aria-label="Loading alert context"><span /><span /><span /></div>}
        {detailQuery.isError && (
          <div className="alert-drawer-error" role="alert"><AlertTriangle size={16} /><span><strong>Alert context unavailable</strong> The detail route is not available from the current backend contract.</span><button type="button" onClick={() => void detailQuery.refetch()}>Retry</button></div>
        )}
        {alert && (
          <div className="alert-triage-drawer__identity">
            <span className="alert-drawer-hex" data-severity={severity} aria-hidden="true" />
            <div>
              <div className="alert-triage-drawer__eyebrow"><span data-severity={severity}>{getSeverityLabel(severity)}</span><span>{statusLabel(alert.statusCode)}</span><code>{alert.id}</code><CopyValueButton value={alert.id} label="alert ID" /></div>
              <h2>{alert.title}</h2>
              <p>{alert.summary ?? `${alert.category} alert detected ${formatDateTime(alert.timestamp)}.`}</p>
            </div>
          </div>
        )}
      </header>

      {alert?.dataCompleteness === 'core' && (
        <div className="alert-drawer-contract" role="status"><AlertTriangle size={13} /><span>Core alert fields only. Triage projection requires ALT-020.</span></div>
      )}

      <nav className="alert-triage-drawer__tabs" aria-label="Alert context views">
        <div role="tablist">
          {drawerTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              ref={(node) => { tabRefs.current[id] = node; }}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={`alert-drawer-panel-${id}`}
              tabIndex={activeTab === id ? 0 : -1}
              data-active={activeTab === id}
              onClick={() => setActiveTab(id)}
              onKeyDown={(event) => handleTabKeyDown(event, id)}
            ><Icon size={14} aria-hidden="true" />{label}</button>
          ))}
        </div>
      </nav>

      <div className="alert-triage-drawer__body" role="tabpanel" id={`alert-drawer-panel-${activeTab}`} aria-label={drawerTabs.find((tab) => tab.id === activeTab)?.label}>
        {alert && activeTab === 'triage' && <TriageView alert={alert} />}
        {alert && activeTab === 'evidence' && <EvidenceView alert={alert} />}
        {alert && activeTab === 'history' && <HistoryView alert={alert} />}
        {alert && activeTab === 'response' && <ResponseView alert={alert} onRequestAction={onRequestAction} />}
      </div>

      {alert && (
        <footer className="alert-triage-drawer__footer">
          <div><span>Detected</span><time dateTime={alert.timestamp}>{formatDateTime(alert.timestamp)}</time></div>
          <Link to={`/alerts/${encodeURIComponent(alert.id)}`}>Open investigation <ExternalLink size={13} aria-hidden="true" /></Link>
        </footer>
      )}
    </aside>
  );
}
