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

import { useQuery } from '@tanstack/react-query';
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
  Sparkles,
  Terminal,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { EndpointTimelineBody } from './EndpointTimelineBody';

import { AccessDeniedState } from '@/components/access-denied-state/AccessDeniedState';
import { AgentHealthBadge } from '@/components/agent-health-badge';
import { AgentVitalsSparkline } from '@/components/agent-vitals-sparkline';
import { AiProvenanceFrame } from '@/components/ai-provenance-frame';
import { AiVerdictCard } from '@/components/ai-verdict-card';
import { ApprovalCard } from '@/components/approval-card';
import { AutonomyControl } from '@/components/autonomy-control';
import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state';
import { HaCard } from '@/components/ha-card/HaCard';
import { HaConfirmationModal } from '@/components/ha-confirmation-modal/HaConfirmationModal';
import { HaDefinitionList, type HaDefinitionItem } from '@/components/ha-definition-list/HaDefinitionList';
import { HaTabs } from '@/components/ha-tabs/HaTabs';
import { LoadingState } from '@/components/loading-state/LoadingState';
import { ROUTES } from '@/constants/routes.constants';
import { useMastheadTenants } from '@/hooks/useMastheadTenants';
import { formatBoundedRelativeTime } from '@/lib/threatIntelFreshness';
import {
  EDR_MITRE_CAPABILITY,
  PER_AGENT_ALERTS_CAPABILITY,
  PER_AGENT_AUDIT_CAPABILITY,
  PER_AGENT_COMMANDS_CAPABILITY,
  PER_AGENT_POLICY_CAPABILITY,
  fetchAgentDetail,
  fetchAgentEnrollmentAudit,
  type AgentDetail,
} from '@/services/agentDetail.service';
import {
  computeCompositeHealth,
  computeFreshness,
  extractSparklineSeries,
} from '@/services/agentHealth';
import {
  fetchEndpointAiAssessment,
  type EndpointAiAssessment,
} from '@/services/endpointAiAssessment.service';
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
// Security tab — AI-assisted assessment (SPEC-08 / W7) + host-scoped alerts note
// ---------------------------------------------------------------------------

/**
 * The AI-assessment surface for the Security tab. Wires the AI kit (SPEC-08):
 *   - `answered`      → AiVerdictCard (verdict → confidence → reasoning → evidence
 *                       spine) wrapped in AiProvenanceFrame so provenance is
 *                       explicit. Fed by the REAL /ha-soc-ai/query endpoint.
 *   - `inconclusive`  → the model's own "insufficient signal" answer, framed as AI
 *                       output — NOT a fabricated benign verdict.
 *   - `unavailable`   → an honest "AI not active" note (the backend graceful
 *                       fallback / unconfigured state). Never a green light.
 *
 * There is no per-endpoint reasoning STREAM source, so we keep AiVerdictCard's
 * static reasoning timeline rather than faking a ReasoningStream (SPEC-08 item 4).
 * The assistive Q&A model does not emit a formal malicious/benign classification,
 * so the verdict shown is 'suspicious' | 'inconclusive' only when the model
 * actually flags concern — we never upgrade silence into a verdict.
 */
function SecurityAiAssessment({
  hostname,
  assessment,
  isLoading,
  isError,
  onRetry,
}: {
  hostname: string;
  assessment: EndpointAiAssessment | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}): JSX.Element {
  if (isLoading) {
    return (
      <HaCard as="section" className="endpoint-detail__card">
        <HaCard.Header>
          <span className="endpoint-detail__card-title endpoint-detail__ai-title">
            <Sparkles size={15} aria-hidden="true" /> AI assessment
          </span>
        </HaCard.Header>
        <HaCard.Body>
          <LoadingState message="Assessing endpoint with Hive Intelligence…" rows={4} />
        </HaCard.Body>
      </HaCard>
    );
  }

  if (isError || !assessment) {
    return (
      <ErrorState
        title="Could not run AI assessment"
        message="Hive Intelligence could not assess this endpoint. Nothing has been changed."
        onRetry={onRetry}
      />
    );
  }

  // Honest non-verdict states — framed as AI output, never a fabricated verdict.
  if (assessment.outcome === 'unavailable') {
    return (
      <AiProvenanceFrame label="Hive Intelligence" caveat={false} variant="rule">
        <p className="endpoint-detail__ai-note">
          AI assessment is not active for this endpoint. {assessment.answer}
        </p>
        <p className="endpoint-detail__muted endpoint-detail__hint">
          Assistive AI is a staging capability; it activates when the SOC AI service is configured.
          Until then, use the log/telemetry evidence and the host-scoped alert search below.
        </p>
      </AiProvenanceFrame>
    );
  }

  if (assessment.outcome === 'inconclusive') {
    return (
      <AiProvenanceFrame label="Hive Intelligence" variant="rule">
        <p className="endpoint-detail__ai-note">{assessment.answer}</p>
      </AiProvenanceFrame>
    );
  }

  // Substantive, grounded answer → the full verdict spine.
  return (
    <AiProvenanceFrame label="Hive Intelligence assessment" variant="rule" caveat={false}>
      <AiVerdictCard
        verdict="suspicious"
        confidence={assessment.confidence}
        summary={assessment.answer}
        reasoning={assessment.steps.map((s) => ({ label: s.label, detail: s.detail, state: 'done' }))}
        evidence={
          assessment.sources.length > 0
            ? assessment.sources.map((src, i) => ({ label: `Source ${i + 1}`, value: <span className="endpoint-detail__evidence-src">{src}</span> }))
            : undefined
        }
      />
      <p className="endpoint-detail__muted endpoint-detail__hint endpoint-detail__ai-disclaimer">
        Assistive assessment from the SOC AI Q&amp;A model — it is not a formal detection verdict.
        Confirm against the evidence and alerts before acting on {hostname}.
      </p>
    </AiProvenanceFrame>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type PendingAction = 'isolate' | 'kill' | 'quarantine' | null;

/** Two-phase governed-action flow (SPEC-08 governed-action gate + SPEC-01 confirm). */
type ActionPhase = 'approval' | 'confirm' | null;

const ACTION_COPY: Record<Exclude<PendingAction, null>, {
  title: string;
  confirm: string;
  reversibility: string;
  /** Human-readable action label for the ApprovalCard. */
  approvalAction: string;
  /** Risk tier drives the ApprovalCard's risk-toned left rule. */
  risk: 'low' | 'medium' | 'high' | 'critical';
  /** Whether the action can be rolled back. */
  reversible: boolean;
  /** Plain-language blast radius. */
  blastRadius: string;
}> = {
  isolate: {
    title: 'Isolate this endpoint?',
    confirm: 'Isolate endpoint',
    reversibility: 'Network isolation cuts the host off from all communication except HiveArmor. It is reversible — you can release the host afterward. Isolation execution is gated by the response-authority contract and is not yet live-verified here.',
    approvalAction: 'Isolate endpoint from the network',
    risk: 'high',
    reversible: true,
    blastRadius: '1 endpoint · all network traffic except HiveArmor',
  },
  kill: {
    title: 'Terminate a process on this endpoint?',
    confirm: 'Request terminate',
    reversibility: 'Terminating a process is NOT reversible — the process is killed. Verify the process and its parent before continuing. Execution is gated by the response-authority contract and is not yet live-verified here.',
    approvalAction: 'Terminate a running process',
    risk: 'critical',
    reversible: false,
    blastRadius: '1 process on 1 endpoint · cannot be undone',
  },
  quarantine: {
    title: 'Quarantine a file on this endpoint?',
    confirm: 'Request quarantine',
    reversibility: 'Quarantine moves the file to a preserved holding area on the endpoint; it is reversible via restore. Execution is gated by the response-authority contract and is not yet live-verified here.',
    approvalAction: 'Quarantine a file',
    risk: 'medium',
    reversible: true,
    blastRadius: '1 file on 1 endpoint · restorable from quarantine',
  },
};

export function EndpointDetailPage(): JSX.Element {
  const { agentId = '' } = useParams<{ agentId: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<string>('overview');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [actionPhase, setActionPhase] = useState<ActionPhase>(null);

  // Role gate: analysts+ may view; destructive actions need the same roles AND a
  // concrete tenant scope (never in the all-tenants aggregate view — SPEC-01).
  const canView = useAuthStore((s) => s.hasAnyRole(['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']));
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

  // Per-endpoint AI assessment (SPEC-08 / W7) — only when the Security tab is
  // open, keyed on the resolved hostname. Fetched from the real /ha-soc-ai/query
  // endpoint; the service maps an unconfigured backend to an honest "unavailable"
  // outcome rather than throwing.
  const detailData = detailQuery.data;
  const aiHostname = detailData?.hostname ?? '';
  const aiQuery = useQuery({
    queryKey: ['endpoint-ai-assessment', aiHostname],
    queryFn: ({ signal }) => fetchEndpointAiAssessment(aiHostname, signal),
    enabled: canView && aiHostname !== '' && activeTab === 'security',
    retry: 1,
    staleTime: 60_000,
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
  // Two-phase governed-action flow (SPEC-08 + SPEC-01):
  //   button → ApprovalCard (human approval gate: risk + blast radius +
  //   reversibility + Approve/Reject) → SPEC-01 confirm modal (tenant echo) →
  //   route to the response-authority console. Nothing destructive fires
  //   automatically; the human passes BOTH gates, and even then execution is the
  //   authority contract's, not this page's.
  const actionsDisabled = isAggregateScope; // fail-closed in the aggregate view
  const openAction = (action: Exclude<PendingAction, null>): void => {
    if (actionsDisabled) return;
    setPendingAction(action);
    setActionPhase('approval');
  };
  const closeAction = (): void => {
    setPendingAction(null);
    setActionPhase(null);
  };
  const approveAction = (): void => {
    // Human approved the proposed action → advance to the SPEC-01 confirm gate.
    setActionPhase('confirm');
  };
  const confirmAction = (): void => {
    // Execution is gated by the response-authority contract (RESP-021) and is
    // not live-verified in W3/W7 — route the operator to the authority console
    // rather than firing an unverified destructive call.
    closeAction();
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
          <SecurityAiAssessment
            hostname={agent.hostname}
            assessment={aiQuery.data}
            isLoading={aiQuery.isLoading}
            isError={aiQuery.isError}
            onRetry={() => void aiQuery.refetch()}
          />
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
          <EmptyState
            icon={<Terminal size={38} />}
            title="Per-endpoint command history unavailable"
            description="The agent-commands API does not yet accept an agent filter. An interactive live-response console is a planned enhancement (W6)."
          />
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

          <HaCard as="section" className="endpoint-detail__card">
            <HaCard.Header>
              <span className="endpoint-detail__card-title endpoint-detail__ai-title">
                <Sparkles size={15} aria-hidden="true" /> Response autonomy
              </span>
            </HaCard.Header>
            <HaCard.Body>
              <AiProvenanceFrame label="Agentic response" variant="rule" caveat={false}>
                <AutonomyControl
                  value="suggest"
                  onChange={() => { /* read-only: no backend autonomy store exists yet */ }}
                  disabled
                  label={`Response agent · ${agent.hostname}`}
                />
                <p className="endpoint-detail__muted endpoint-detail__hint">
                  Autonomy is fixed at <strong>Suggest</strong> and cannot be changed here: there is no
                  agentic autonomy/policy store in the backend yet, so HiveArmor never acts on an
                  endpoint without explicit human approval. This control is shown for transparency and
                  becomes adjustable when the agentic response backend ships (planned — AI-SOC programme).
                </p>
              </AiProvenanceFrame>
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

      {/* Governed-action gate (SPEC-08): human approval BEFORE the confirm. */}
      {actionPhase === 'approval' && pendingAction && pendingCopy && (
        <div className="endpoint-detail__approval-overlay" role="dialog" aria-modal="true" aria-label="Approve response action">
          <div className="endpoint-detail__approval-shell">
            <ApprovalCard
              action={`${pendingCopy.approvalAction} · ${agent.hostname}`}
              agent="Response agent (assistive)"
              risk={pendingCopy.risk}
              blastRadius={pendingCopy.blastRadius}
              reversible={pendingCopy.reversible}
              expiry={`Scope: ${tenantLabel}`}
              onApprove={approveAction}
              onReject={closeAction}
            >
              <p className="endpoint-detail__muted endpoint-detail__hint">
                Approving records your decision and advances to a final confirmation. Execution is
                gated by the response-authority contract and is not fired automatically from here.
              </p>
            </ApprovalCard>
          </div>
        </div>
      )}

      {/* SPEC-01 confirm modal — tenant echo + reversibility (second gate). */}
      <HaConfirmationModal
        isOpen={actionPhase === 'confirm'}
        title={pendingCopy?.title ?? ''}
        message={confirmMessage}
        confirmLabel={pendingCopy?.confirm ?? 'Continue'}
        cancelLabel="Cancel"
        variant={pendingAction === 'kill' ? 'danger' : 'primary'}
        onConfirm={confirmAction}
        onCancel={closeAction}
      />
    </div>
  );
}
