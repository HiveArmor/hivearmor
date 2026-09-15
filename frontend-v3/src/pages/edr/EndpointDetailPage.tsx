/**
 * EndpointDetailPage — consolidated per-agent detail page (SPEC-03, W3).
 *
 * Route: /edr/endpoints/:agentId (ROUTES.ENDPOINT_DETAIL) — net-new.
 *
 * A persistent header (identity + composite health + tenant echo + action bar)
 * above a 6-tab body (the persistent header is the 7th surface in the spec's
 * "Header + 7 tabs" wording), grounded in the Microsoft Defender device page +
 * Elastic endpoint flyout patterns (research §1):
 *
 *   Header  · Overview · Security · Logs/Telemetry · Commands · Configuration · Audit
 *
 * Reuse (no new visual language): HaTabs, HaCard, HaDefinitionList,
 * AgentHealthBadge (SPEC-02/W2, `full` variant), AgentVitalsSparkline,
 * HaConfirmationModal (SPEC-01 tenant-echo + reversibility pattern), the shared
 * LoadingState/EmptyState/ErrorState/AccessDeniedState, and the folded-in
 * EndpointTimelineBody as the Logs tab.
 *
 * Honesty (the spec's core rule — never a green light hiding a failing sensor,
 * never a fabricated capability):
 *   - The composite health badge always expands to the failing dimension.
 *   - MITRE is NOT on EDR events → the Logs tab shows an explicit "no ATT&CK
 *     mapping for endpoint events" note, not a fake tag.
 *   - Per-agent alerts/commands have NO server-side agent filter yet, and a
 *     per-agent applied-policy lookup must be derived → those tabs render an
 *     honest backend-dependency note instead of a faked/empty list.
 *   - Destructive header actions (Isolate/Kill/Quarantine) are disabled in the
 *     all-tenants aggregate view and fail-closed until live-verified; each opens
 *     an SPEC-01 confirm modal echoing host + agent id + tenant + reversibility.
 *   - Per-panel "as of" freshness stamps (research §3).
 *
 * Constraints: no `any`, no raw hex (foundation.css `--ha-*` tokens only), no
 * absolute backend URLs.
 */

import { useMemo, useState } from 'react';

import { Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  ClipboardList,
  Cpu,
  FileWarning,
  Info,
  Laptop,
  ListTree,
  ScrollText,
  ShieldAlert,
  Settings2,
  Terminal,
  Trash2,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AgentCommandsTab } from './AgentCommandsTab';
import { EndpointTimelineBody } from './EndpointTimelineBody';

import { AccessDeniedState } from '@/components/access-denied-state/AccessDeniedState';
import { AgentHealthBadge } from '@/components/agent-health-badge';
import { AgentVitalsSparkline } from '@/components/agent-vitals-sparkline';
import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state';
import { HaButton } from '@/components/ha-button/HaButton';
import { HaCard } from '@/components/ha-card/HaCard';
import { HaConfirmationModal } from '@/components/ha-confirmation-modal/HaConfirmationModal';
import { HaDefinitionList, type HaDefinitionItem } from '@/components/ha-definition-list/HaDefinitionList';
import { HaTabs } from '@/components/ha-tabs/HaTabs';
import { LoadingState } from '@/components/loading-state/LoadingState';
import { ROUTES } from '@/constants/routes.constants';
import { useMastheadTenants } from '@/hooks/useMastheadTenants';
import { ApiError } from '@/lib/apiClient';
import { formatBoundedRelativeTime } from '@/lib/threatIntelFreshness';
import {
  EDR_MITRE_CAPABILITY,
  PER_AGENT_ALERTS_CAPABILITY,
  PER_AGENT_AUDIT_CAPABILITY,
  PER_AGENT_COMMANDS_CAPABILITY,
  PER_AGENT_POLICY_CAPABILITY,
  fetchAgentDetail,
  fetchAgentEnrollmentAudit,
  removeAgent,
  type AgentDetail,
} from '@/services/agentDetail.service';
import {
  computeCompositeHealth,
  computeFreshness,
  extractSparklineSeries,
} from '@/services/agentHealth';
import { ALL_TENANTS_OPTION } from '@/services/mastheadTenants.service';
import { fetchAgentVitals } from '@/services/telemetryService';
import { useAuthStore } from '@/store/auth.store';


import './EndpointDetailPage.css';

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

/** Per-panel "as of" freshness stamp (research §3). */
function AsOfStamp({ iso }: { iso: string | null }): JSX.Element {
  return (
    <span className="endpoint-detail__asof" title={iso ?? 'No data'}>
      as of {iso ? formatBoundedRelativeTime(iso) : '—'}
    </span>
  );
}

/** An honesty note for a capability that has no per-agent server-side filter yet. */
function CapabilityNote({ note }: { note: string }): JSX.Element {
  return (
    <div className="endpoint-detail__capability-note" role="note">
      <Info size={15} aria-hidden="true" />
      <span>{note}</span>
    </div>
  );
}

function osLabel(agent: AgentDetail): string {
  const platform = agent.platform && agent.platform !== 'unknown' ? agent.platform : null;
  return [platform, agent.osVersion].filter(Boolean).join(' · ') || 'Unknown platform';
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({
  agent,
  vitalsIso,
  cpuSeries,
  healthLevel,
}: {
  agent: AgentDetail;
  vitalsIso: string | null;
  cpuSeries: number[];
  healthLevel: 'red' | 'amber' | 'green' | 'unknown';
}): JSX.Element {
  const identity: HaDefinitionItem[] = [
    { term: 'Agent ID', value: agent.agentId, mono: true },
    { term: 'Hostname', value: agent.hostname, mono: true },
    { term: 'IP address', value: agent.ip, mono: true },
    { term: 'MAC', value: agent.mac, mono: true },
    { term: 'Platform / OS', value: osLabel(agent) },
    { term: 'Agent version', value: agent.agentVersion, mono: true },
    { term: 'Bundle', value: agent.bundleVersion, mono: true },
    { term: 'Collector', value: agent.collectorType },
    { term: 'Connection', value: agent.connectionStatus },
    { term: 'Last seen', value: agent.lastSeen ? formatBoundedRelativeTime(agent.lastSeen) : 'Never' },
  ];

  return (
    <div className="endpoint-detail__overview">
      <div className="endpoint-detail__overview-note">
        <CapabilityNote note="Triage cards for active alerts, risk/exposure, and logged-on users are not yet resolvable per agent (the alerts API has no host filter, and exposure/session data is not exposed per endpoint). This tab shows verified identity and device health; those cards land when the backend dependencies do." />
      </div>
      <HaCard as="section" className="endpoint-detail__card">
        <HaCard.Header>
          <span className="endpoint-detail__card-title"><Laptop size={15} aria-hidden="true" /> Endpoint details</span>
        </HaCard.Header>
        <HaCard.Body>
          <HaDefinitionList layout="inline" items={identity} />
        </HaCard.Body>
      </HaCard>

      <HaCard as="section" className="endpoint-detail__card">
        <HaCard.Header>
          <span className="endpoint-detail__card-title"><Cpu size={15} aria-hidden="true" /> Device health</span>
          <AsOfStamp iso={vitalsIso} />
        </HaCard.Header>
        <HaCard.Body>
          {cpuSeries.length > 0 ? (
            <div className="endpoint-detail__spark">
              <span className="endpoint-detail__spark-label">CPU trend</span>
              <AgentVitalsSparkline series={cpuSeries} level={healthLevel} height={40} ariaLabel="CPU trend" />
            </div>
          ) : (
            <p className="endpoint-detail__muted">No vitals trend to plot yet.</p>
          )}
          <p className="endpoint-detail__muted endpoint-detail__hint">
            Per-dimension health (freshness, CPU, queue, errors) is shown in the header badge above; it always
            expands to the failing dimension rather than a bare status light.
          </p>
        </HaCard.Body>
      </HaCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type PendingAction = 'isolate' | 'kill' | 'quarantine' | null;

const ACTION_COPY: Record<Exclude<PendingAction, null>, { title: string; confirm: string; reversibility: string }> = {
  isolate: {
    title: 'Isolate this endpoint?',
    confirm: 'Isolate endpoint',
    reversibility: 'Network isolation cuts the host off from all communication except HiveArmor. It is reversible — you can release the host afterward. Isolation execution is gated by the response-authority contract and is not yet live-verified here.',
  },
  kill: {
    title: 'Terminate a process on this endpoint?',
    confirm: 'Request terminate',
    reversibility: 'Terminating a process is NOT reversible — the process is killed. Verify the process and its parent before continuing. Execution is gated by the response-authority contract and is not yet live-verified here.',
  },
  quarantine: {
    title: 'Quarantine a file on this endpoint?',
    confirm: 'Request quarantine',
    reversibility: 'Quarantine moves the file to a preserved holding area on the endpoint; it is reversible via restore. Execution is gated by the response-authority contract and is not yet live-verified here.',
  },
};

export function EndpointDetailPage(): JSX.Element {
  const { agentId = '' } = useParams<{ agentId: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<string>('overview');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  // SPEC-07 W6 6.2 — agent removal (irreversible, typed-confirmation tier).
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeTyped, setRemoveTyped] = useState('');
  const queryClient = useQueryClient();

  // Role gate: analysts+ may view; destructive actions need the same roles AND a
  // concrete tenant scope (never in the all-tenants aggregate view — SPEC-01).
  const canView = useAuthStore((s) => s.hasAnyRole(['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']));
  // Removal is MUTATE_AUTH on the backend (ADMIN/SOC_MANAGER) — mirror it in the UI.
  const canMutate = useAuthStore((s) => s.hasAnyRole(['ROLE_SOC_MANAGER', 'ROLE_ADMIN']));
  const selectedTenantId = useAuthStore((s) => s.selectedTenantId);
  const { tenants } = useMastheadTenants();
  const selectedTenant = tenants.find((t) => t.id === selectedTenantId) ?? ALL_TENANTS_OPTION;
  const isAggregateScope = selectedTenantId === null;
  const tenantLabel = selectedTenant.label;

  const detailQuery = useQuery({
    queryKey: ['agent-detail', agentId],
    queryFn: ({ signal }) => fetchAgentDetail(agentId, signal),
    enabled: canView && agentId !== '',
    retry: 1,
  });

  const vitalsQuery = useQuery({
    queryKey: ['agent-vitals', agentId],
    queryFn: ({ signal }) => fetchAgentVitals(agentId, signal),
    enabled: canView && agentId !== '',
    retry: 1,
    refetchInterval: 30_000,
  });

  const auditQuery = useQuery({
    queryKey: ['agent-enrollment-audit', agentId],
    queryFn: ({ signal }) => fetchAgentEnrollmentAudit(agentId, signal),
    enabled: canView && agentId !== '' && activeTab === 'audit',
    retry: 1,
  });

  // Removal mutation (SPEC-07 W6 6.2). On success, invalidate the fleet + this
  // agent's queries and navigate back to the endpoints list — the agent is gone.
  const removeMutation = useMutation({
    mutationFn: (hostname: string) => removeAgent(hostname),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sensors'] });
      void queryClient.invalidateQueries({ queryKey: ['agent-detail'] });
      setRemoveOpen(false);
      setRemoveTyped('');
      navigate(ROUTES.EDR_ENDPOINTS);
    },
  });

  const vitals = useMemo(() => vitalsQuery.data ?? [], [vitalsQuery.data]);
  const health = useMemo(() => computeCompositeHealth(vitals), [vitals]);
  const freshness = useMemo(() => computeFreshness(vitals), [vitals]);
  const cpuSeries = useMemo(() => extractSparklineSeries(vitals, 'cpu'), [vitals]);
  const vitalsIso = vitals[0]?.sampledAt ?? null;

  // ── Access / loading / not-found / error gates ───────────────────────────
  if (!canView) {
    return (
      <div className="endpoint-detail endpoint-detail--state">
        <AccessDeniedState
          title="Access Restricted"
          message="Required permission: Analyst, SOC Manager, or Platform Administrator"
        />
      </div>
    );
  }

  if (!agentId) {
    return (
      <div className="endpoint-detail endpoint-detail--state">
        <ErrorState
          title="Invalid endpoint reference"
          message="Open an endpoint from the endpoints list and try again."
        />
      </div>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <div className="endpoint-detail endpoint-detail--state" aria-busy="true">
        <LoadingState message="Loading endpoint…" rows={8} />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    const message = detailQuery.error instanceof Error ? detailQuery.error.message : '';
    const notFound = message.toLowerCase().includes('not found') || message === 'HTTP 404';
    return (
      <div className="endpoint-detail endpoint-detail--state">
        <ErrorState
          title={notFound ? 'Endpoint not found' : 'Could not load endpoint'}
          message={
            notFound
              ? 'No agent matches this identifier in your current tenant scope. It may have been removed, or the id is incorrect.'
              : 'HiveArmor could not retrieve the endpoint record. Nothing has been changed.'
          }
          onRetry={() => void detailQuery.refetch()}
        />
      </div>
    );
  }

  const agent = detailQuery.data;

  // ── Header action handlers ────────────────────────────────────────────────
  const actionsDisabled = isAggregateScope; // fail-closed in the aggregate view
  const openAction = (action: Exclude<PendingAction, null>): void => {
    if (actionsDisabled) return;
    setPendingAction(action);
  };
  const confirmAction = (): void => {
    // Execution is gated by the response-authority contract (RESP-021) and is
    // not live-verified in W3 — route the operator to the authority console
    // rather than firing an unverified destructive call.
    setPendingAction(null);
    navigate(`${ROUTES.RESPONSE_AUTHORITY}?search=${encodeURIComponent(agent.hostname)}`);
  };

  const pendingCopy = pendingAction ? ACTION_COPY[pendingAction] : null;
  const confirmMessage = pendingCopy
    ? `Target: ${agent.hostname} (agent ${agent.agentId}) · Tenant: ${tenantLabel}. ${pendingCopy.reversibility}`
    : '';

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const tabs = [
    {
      key: 'overview',
      title: (<><Laptop size={14} aria-hidden="true" /> Overview</>),
      content: (
        <OverviewTab agent={agent} vitalsIso={vitalsIso} cpuSeries={cpuSeries} healthLevel={health.level} />
      ),
    },
    {
      key: 'security',
      title: (<><ShieldAlert size={14} aria-hidden="true" /> Security</>),
      content: (
        <div className="endpoint-detail__tabpane">
          <CapabilityNote note={PER_AGENT_ALERTS_CAPABILITY.note} />
          <EmptyState
            icon={<ShieldAlert size={38} />}
            title="Host-scoped alerts unavailable"
            description="Alerts cannot yet be filtered to a single endpoint server-side. Search this host by name in the alerts list."
            action={<Link className="endpoint-detail__link-btn" to={`${ROUTES.ALERTS}?q=${encodeURIComponent(agent.hostname)}`}>Open alerts for {agent.hostname}</Link>}
          />
        </div>
      ),
    },
    {
      key: 'logs',
      title: (<><ListTree size={14} aria-hidden="true" /> Logs / Telemetry</>),
      content: (
        <div className="endpoint-detail__tabpane endpoint-detail__tabpane--flush">
          <CapabilityNote note={EDR_MITRE_CAPABILITY.note} />
          <div className="endpoint-detail__timeline">
            <EndpointTimelineBody agentId={agent.agentId} />
          </div>
        </div>
      ),
    },
    {
      key: 'commands',
      title: (<><Terminal size={14} aria-hidden="true" /> Commands</>),
      content: (
        <div className="endpoint-detail__tabpane">
          <CapabilityNote note={PER_AGENT_COMMANDS_CAPABILITY.note} />
          <AgentCommandsTab agentId={agent.agentId} />
        </div>
      ),
    },
    {
      key: 'configuration',
      title: (<><Settings2 size={14} aria-hidden="true" /> Configuration</>),
      content: (
        <div className="endpoint-detail__tabpane">
          <CapabilityNote note={PER_AGENT_POLICY_CAPABILITY.note} />
          <HaCard as="section" className="endpoint-detail__card">
            <HaCard.Header>
              <span className="endpoint-detail__card-title"><ClipboardList size={15} aria-hidden="true" /> Enrollment &amp; collector</span>
            </HaCard.Header>
            <HaCard.Body>
              <HaDefinitionList
                layout="inline"
                items={[
                  { term: 'Collector type', value: agent.collectorType },
                  { term: 'Agent version', value: agent.agentVersion, mono: true },
                  { term: 'Bundle', value: agent.bundleVersion, mono: true },
                  { term: 'Connection', value: agent.connectionStatus },
                ]}
              />
              <p className="endpoint-detail__muted endpoint-detail__hint">
                Applied-policy detail is not yet resolvable per agent (see note above). Manage policies from the
                {' '}<Link className="endpoint-detail__inline-link" to={ROUTES.ENDPOINTS_FIM_POLICIES}>agent policies</Link> console.
              </p>
            </HaCard.Body>
          </HaCard>
        </div>
      ),
    },
    {
      key: 'audit',
      title: (<><ScrollText size={14} aria-hidden="true" /> Audit</>),
      content: (
        <div className="endpoint-detail__tabpane">
          {auditQuery.isLoading && <LoadingState message="Loading audit trail…" rows={5} />}
          {auditQuery.isError && (
            <ErrorState
              title="Could not load audit trail"
              message="The enrollment audit could not be retrieved for this agent. A concrete tenant scope is required."
              onRetry={() => void auditQuery.refetch()}
            />
          )}
          {!auditQuery.isLoading && !auditQuery.isError && (auditQuery.data?.length ?? 0) === 0 && (
            <>
              <CapabilityNote note={PER_AGENT_AUDIT_CAPABILITY.note} />
              <EmptyState
                icon={<ScrollText size={38} />}
                title="No audit records for this identifier"
                description="No enrollment or credential audit events resolved for this agent. Records surface when the audit endpoint is addressed by the agent's enrollment UUID (see note above)."
              />
            </>
          )}
          {!auditQuery.isLoading && !auditQuery.isError && (auditQuery.data?.length ?? 0) > 0 && (
            <HaCard as="section" className="endpoint-detail__card">
              <HaCard.Header>
                <span className="endpoint-detail__card-title"><ScrollText size={15} aria-hidden="true" /> Enrollment &amp; credential audit</span>
              </HaCard.Header>
              <HaCard.Body>
                <ul className="endpoint-detail__audit-list">
                  {(auditQuery.data ?? []).map((row) => (
                    <li key={String(row.id)} className="endpoint-detail__audit-row">
                      <span className="endpoint-detail__audit-type">{row.eventType}</span>
                      <span className="endpoint-detail__audit-detail">{row.detail ?? '—'}</span>
                      <span className="endpoint-detail__audit-meta">
                        {row.actor ?? 'system'} · {row.at ? formatBoundedRelativeTime(row.at) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </HaCard.Body>
            </HaCard>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="endpoint-detail">
      {/* Persistent header */}
      <header className="endpoint-detail__header">
        <button
          type="button"
          className="endpoint-detail__back"
          onClick={() => navigate(ROUTES.EDR_ENDPOINTS)}
          aria-label="Back to endpoints"
        >
          <ArrowLeft size={17} />
        </button>
        <span className="endpoint-detail__header-icon" aria-hidden="true"><Laptop size={20} /></span>
        <div className="endpoint-detail__identity">
          <small>Endpoint · {tenantLabel}</small>
          <h1>{agent.hostname}</h1>
          <span className="endpoint-detail__subid">{osLabel(agent)}{agent.ip ? ` · ${agent.ip}` : ''}</span>
        </div>

        <div className="endpoint-detail__health">
          <AgentHealthBadge
            health={health}
            freshness={freshness}
            variant="full"
            errored={vitalsQuery.isError}
          />
        </div>

        <div className="endpoint-detail__actions" role="group" aria-label="Endpoint response actions">
          {actionsDisabled && (
            <span className="endpoint-detail__actions-note" role="note">
              Select a specific tenant to enable response actions
            </span>
          )}
          <button
            type="button"
            className="endpoint-detail__action"
            disabled={actionsDisabled}
            onClick={() => openAction('isolate')}
          >
            <Ban size={14} aria-hidden="true" /> Isolate
          </button>
          <button
            type="button"
            className="endpoint-detail__action"
            disabled={actionsDisabled}
            onClick={() => openAction('kill')}
          >
            <Terminal size={14} aria-hidden="true" /> Kill process
          </button>
          <button
            type="button"
            className="endpoint-detail__action"
            disabled={actionsDisabled}
            onClick={() => openAction('quarantine')}
          >
            <FileWarning size={14} aria-hidden="true" /> Quarantine
          </button>
          {canMutate && (
            <button
              type="button"
              className="endpoint-detail__action endpoint-detail__action--danger"
              disabled={actionsDisabled}
              onClick={() => { setRemoveTyped(''); removeMutation.reset(); setRemoveOpen(true); }}
              title={actionsDisabled ? 'Select a specific tenant to enable removal' : 'Remove this agent from the fleet'}
            >
              <Trash2 size={14} aria-hidden="true" /> Remove
            </button>
          )}
        </div>
      </header>

      {/* Tabbed body */}
      <div className="endpoint-detail__body">
        <HaTabs
          activeKey={activeTab}
          onSelect={setActiveTab}
          tabs={tabs}
          className="endpoint-detail__tabs"
        />
      </div>

      {/* SPEC-01 confirm modal — tenant echo + reversibility */}
      <HaConfirmationModal
        isOpen={pendingAction !== null}
        title={pendingCopy?.title ?? ''}
        message={confirmMessage}
        confirmLabel={pendingCopy?.confirm ?? 'Continue'}
        cancelLabel="Cancel"
        variant={pendingAction === 'kill' ? 'danger' : 'primary'}
        onConfirm={confirmAction}
        onCancel={() => setPendingAction(null)}
      />

      {/* SPEC-07 W6 6.2 — agent removal: typed-confirmation tier (type the hostname). */}
      {removeOpen && (
        <Modal
          isOpen
          onClose={() => { if (!removeMutation.isPending) { setRemoveOpen(false); setRemoveTyped(''); } }}
          variant="small"
          width="min(480px, calc(100vw - 32px))"
          className="ha-confirmation-modal"
          backdropClassName="ha-confirmation-modal__backdrop"
          aria-label="Remove agent from fleet"
        >
          <ModalHeader title="Remove this agent?" titleIconVariant="warning" />
          <ModalBody className="ha-confirmation-modal__body">
            <p>
              {`Target: ${agent.hostname} (agent ${agent.agentId}). Tenant: ${tenantLabel}. `}
              Removing an agent is <strong>not reversible</strong> — re-onboarding requires
              redeploying the agent with a new enrollment key. Its history remains in the audit trail.
            </p>
            <label className="endpoint-detail__remove-confirm">
              Type the hostname <code>{agent.hostname}</code> to confirm
              <input
                type="text"
                value={removeTyped}
                onChange={(e) => setRemoveTyped(e.target.value)}
                aria-label={`Type ${agent.hostname} to confirm removal`}
                autoComplete="off"
                autoFocus
              />
            </label>
            <div className="ha-confirmation-modal__guardrail" role="note">
              This decision is recorded in the audit trail. Verify the endpoint before continuing.
            </div>
            {removeMutation.isError && (
              <p className="endpoint-detail__remove-error" role="alert">
                {removeMutation.error instanceof ApiError && removeMutation.error.status === 404
                  ? 'This agent is not in your current tenant scope, or was already removed.'
                  : removeMutation.error instanceof ApiError && removeMutation.error.status === 400
                    ? 'Select a specific tenant before removing an agent.'
                    : 'Removal failed — the agent manager could not be reached. Nothing was changed.'}
              </p>
            )}
          </ModalBody>
          <ModalFooter className="ha-confirmation-modal__footer">
            <HaButton
              variant="secondary"
              onClick={() => { setRemoveOpen(false); setRemoveTyped(''); }}
              isDisabled={removeMutation.isPending}
            >
              Cancel
            </HaButton>
            <HaButton
              variant="danger"
              isDisabled={removeTyped.trim() !== agent.hostname || removeMutation.isPending}
              onClick={() => removeMutation.mutate(agent.hostname)}
            >
              {removeMutation.isPending ? 'Removing…' : 'Remove agent'}
            </HaButton>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
