/**
 * agentDetail.service — per-agent read API for the consolidated agent-detail
 * page (SPEC-03, W3).
 *
 * This service ONLY calls endpoints that were verified (W3 recon) to exist and
 * to accept a single-agent selector. Where a per-agent server-side filter does
 * NOT yet exist, the function returns an explicit `NEEDS_VERIFICATION` capability
 * marker instead of faking a filtered result — the page renders an honest
 * "backend dependency" note rather than a misleading list.
 *
 * Verified backend surface (recon 2026-09-13):
 *   - GET /api/agent-manager/agent-by-hostname?hostname=  → one AgentDTO (tenant-scoped, 404 on miss)  [EXISTS]
 *   - GET /api/agent-manager/agents                        → list only (fallback identity source)      [EXISTS]
 *   - GET /api/ha-telemetry/vitals/{agentId}               → vitals (consumed via telemetryService)     [EXISTS — SPEC-02]
 *   - GET /api/ha-agent-enrollments/audit?agentUuid=       → enrollment audit filterable by agent UUID  [EXISTS_FILTERABLE]
 *   - GET /api/agent-manager/agent-commands                → NO agentId filter param                    [EXISTS_NO_FILTER]
 *   - GET /api/ha-alerts                                   → NO host/agent list filter (only IP + q)    [EXISTS_NO_FILTER]
 *   - per-agent applied policy                             → must be derived from policy states         [NEEDS_VERIFICATION]
 *
 * All requests route through the shared `apiClient` (JWT + X-Tenant-ID). No
 * absolute backend URLs, no invented fields.
 */

import { apiClient, ApiError } from '@/lib/apiClient';
import {
  adaptAgentWireToSensor,
  type AgentWireDTO,
  type SensorDTO,
} from '@/services/sensorsService';

const fixtureMode =
  import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

/**
 * Capability marker for a per-agent data source whose server-side filter is not
 * yet available. The page renders this honestly instead of an empty/faked list.
 */
export interface CapabilityGap {
  /** Machine verdict, mirrors the recon vocabulary. */
  verdict: 'EXISTS_NO_FILTER' | 'NEEDS_VERIFICATION';
  /** Human sentence shown in the UI honesty note. */
  note: string;
}

/** Full identity/detail projection for the header + Overview tab. */
export interface AgentDetail extends SensorDTO {
  /** Best-effort primary IP (from the wire DTO when present). */
  ip: string | null;
  /** MAC address when reported. */
  mac: string | null;
}

/**
 * Adapts a raw AgentDTO wire row into the richer AgentDetail projection,
 * preserving ip/mac the SensorDTO drops.
 */
export function adaptAgentDetail(wire: AgentWireDTO): AgentDetail | null {
  const sensor = adaptAgentWireToSensor(wire);
  if (!sensor) return null;
  return {
    ...sensor,
    ip: wire.ip?.trim() || null,
    mac: wire.mac?.trim() || null,
  };
}

/**
 * Fetches a single agent's identity/detail.
 *
 * The verified single-agent endpoint keys on HOSTNAME, not the numeric agent id
 * the route carries. So this resolves in two steps, honestly:
 *   1. Try GET /agent-manager/agent-by-hostname?hostname={agentId} — works when
 *      the route param IS the hostname.
 *   2. Fall back to the agents LIST and match by agentId or hostname — covers the
 *      case where the route param is the numeric id (as the timeline route uses).
 * A miss throws ApiError(404) so the caller shows "not found", never a fake row.
 *
 * @param agentId route identifier — may be a numeric agent id OR a hostname
 */
export async function fetchAgentDetail(
  agentId: string,
  signal?: AbortSignal,
): Promise<AgentDetail> {
  if (fixtureMode) {
    const { getFixtureAgentDetail } = await import('./agentDetail.fixtures');
    const found = getFixtureAgentDetail(agentId);
    if (!found) {
      throw new ApiError(404, { status: 404, message: 'Agent not found' });
    }
    return found;
  }

  // Step 1: hostname lookup (verified endpoint).
  try {
    const wire = await apiClient.get<AgentWireDTO>('/agent-manager/agent-by-hostname', {
      params: { hostname: agentId },
      signal,
    });
    const detail = adaptAgentDetail(wire);
    if (detail) return detail;
  } catch (err) {
    // 404 → fall through to list match; other errors propagate.
    if (!(err instanceof ApiError) || err.status !== 404) throw err;
  }

  // Step 2: match against the agent list by id or hostname. Adapt the RAW wire
  // rows (not the stripped SensorDTO) so ip/mac survive this fallback — which is
  // the COMMON path, since the route param is the numeric agent id and step 1's
  // hostname lookup 404s for it.
  const wireRows = await apiClient.get<AgentWireDTO[]>('/agent-manager/agents', {
    params: { pageSize: 500 },
    signal,
  });
  const details = (Array.isArray(wireRows) ? wireRows : [])
    .map(adaptAgentDetail)
    .filter((d): d is AgentDetail => d !== null);
  const match = details.find((d) => d.agentId === agentId || d.hostname === agentId);
  if (!match) {
    throw new ApiError(404, { status: 404, message: 'Agent not found' });
  }
  return match;
}

// ---------------------------------------------------------------------------
// Enrollment / config / audit — filterable by agent UUID (verified).
// ---------------------------------------------------------------------------

/** One enrollment-audit row, filtered to a single agent (verified filter). */
export interface AgentEnrollmentAuditRow {
  id: number | string;
  eventType: string;
  agentId: string | null;
  agentUuid: string | null;
  actor: string | null;
  at: string | null;
  detail: string | null;
}

interface EnrollmentAuditWire {
  id?: number | string;
  eventType?: string | null;
  event?: string | null;
  agentId?: string | null;
  agentUuid?: string | null;
  actor?: string | null;
  performedBy?: string | null;
  createdAt?: string | null;
  timestamp?: string | null;
  detail?: string | null;
  message?: string | null;
}

function adaptEnrollmentAuditRow(wire: EnrollmentAuditWire): AgentEnrollmentAuditRow {
  return {
    id: wire.id ?? `${wire.agentUuid ?? 'x'}-${wire.createdAt ?? wire.timestamp ?? Math.random()}`,
    eventType: (wire.eventType ?? wire.event ?? 'UNKNOWN').toString(),
    agentId: wire.agentId ?? null,
    agentUuid: wire.agentUuid ?? null,
    actor: wire.actor ?? wire.performedBy ?? null,
    at: wire.createdAt ?? wire.timestamp ?? null,
    detail: wire.detail ?? wire.message ?? null,
  };
}

/**
 * Fetches enrollment-audit rows for ONE agent (verified: /ha-agent-enrollments/audit
 * accepts an `agentUuid` filter). Returns newest-first. The agent's enrollment UUID
 * is required — pass the SensorDTO agentId only when it is the UUID; otherwise the
 * caller supplies the resolved UUID or omits this data source.
 */
export async function fetchAgentEnrollmentAudit(
  agentUuid: string,
  signal?: AbortSignal,
): Promise<AgentEnrollmentAuditRow[]> {
  if (fixtureMode) {
    const { getFixtureEnrollmentAudit } = await import('./agentDetail.fixtures');
    return getFixtureEnrollmentAudit(agentUuid);
  }
  const rows = await apiClient.get<EnrollmentAuditWire[]>('/ha-agent-enrollments/audit', {
    params: { agentUuid, page: 0, size: 100 },
    signal,
  });
  return (Array.isArray(rows) ? rows : []).map(adaptEnrollmentAuditRow);
}

// ---------------------------------------------------------------------------
// Honest capability markers for data sources without a per-agent server filter.
// ---------------------------------------------------------------------------

/**
 * Per-agent ALERTS is not filterable server-side today: GET /api/ha-alerts exposes
 * only adversaryIp/targetIp + free-text q, no host/agent.id list filter (recon).
 * The page shows this note and a deep link to the pre-filtered alerts list rather
 * than faking a host-scoped list.
 */
export const PER_AGENT_ALERTS_CAPABILITY: CapabilityGap = {
  verdict: 'EXISTS_NO_FILTER',
  note: 'Host-scoped alert filtering is not yet available on the alerts API (only IP and free-text query are server-side filterable). Open the alerts list to search this host by name.',
};

/**
 * Per-agent COMMANDS is not filterable server-side today: GET
 * /api/agent-manager/agent-commands takes no agentId parameter (recon).
 */
export const PER_AGENT_COMMANDS_CAPABILITY: CapabilityGap = {
  verdict: 'EXISTS_NO_FILTER',
  note: 'The agent-commands API does not yet accept an agent filter, so commands cannot be scoped to a single endpoint here. This is a tracked backend dependency (W6).',
};

/**
 * Per-agent applied POLICY must be derived from policy states; there is no direct
 * "policy applied to agent X" GET (recon).
 */
export const PER_AGENT_POLICY_CAPABILITY: CapabilityGap = {
  verdict: 'NEEDS_VERIFICATION',
  note: 'An applied-policy lookup scoped to a single agent is not yet exposed; it must be derived from per-policy enforcement state. Tracked as a backend dependency (W5/W6).',
};

/**
 * The enrollment-audit endpoint filters by agent ENROLLMENT UUID, but the fleet
 * list / route identifier is the numeric agent id, and no UUID is exposed on the
 * agent wire DTO at this layer (recon). So the audit list resolves only when the
 * route id happens to be the UUID; otherwise it returns empty. The Audit tab
 * states this dependency honestly rather than implying the agent has no history.
 */
export const PER_AGENT_AUDIT_CAPABILITY: CapabilityGap = {
  verdict: 'NEEDS_VERIFICATION',
  note: 'Enrollment/credential audit is filtered by the agent enrollment UUID, which is not exposed on the fleet record yet — so records appear only when this endpoint is addressed by UUID. Tracked as a backend dependency.',
};

/**
 * MITRE ATT&CK is NOT mapped onto EDR endpoint events today (audit Q5). The Logs
 * tab shows this note instead of a fabricated technique tag.
 */
export const EDR_MITRE_CAPABILITY: CapabilityGap = {
  verdict: 'NEEDS_VERIFICATION',
  note: 'No ATT&CK mapping is emitted for endpoint (EDR) events today. Technique context is available on correlation-rule alerts, not on raw endpoint telemetry.',
};
