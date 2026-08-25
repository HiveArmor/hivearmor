/**
 * HiveArmor SOAR Playbook service.
 * Sprint 18 — T01 · frontend-v3/src/services/playbookService.ts
 *
 * All calls go through the shared apiClient which prepends `/api` and injects
 * the JWT `Authorization` header automatically.  Never use absolute backend
 * URLs here.
 */

import type { Playbook, PlaybookAuditEntry, PlaybookAuditPage, PlaybookExecution } from '../types/playbook';

import { apiClient } from '@/lib/apiClient';
import { RESP_PLAYBOOK_AUDIT } from '@/pages/response/response.capabilities';

const fixtureMode =
  import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/**
 * Fetch the full list of playbooks.
 * GET /api/ha-playbooks
 */
export async function fetchPlaybooks(): Promise<Playbook[]> {
  if (fixtureMode) {
    const { fixturePlaybooks } = await import('@/services/playbookService.fixtures');
    return fixturePlaybooks;
  }
  return apiClient.get<Playbook[]>('/ha-playbooks');
}

/**
 * Fetch a single playbook by id (response includes the `steps` array).
 * GET /api/ha-playbooks/:id
 */
export async function fetchPlaybook(id: number): Promise<Playbook> {
  if (fixtureMode) {
    const { fixturePlaybooks } = await import('@/services/playbookService.fixtures');
    const found = fixturePlaybooks.find((p) => p.id === id);
    if (!found) throw new Error(`Playbook ${id} not found`);
    return found;
  }
  return apiClient.get<Playbook>(`/ha-playbooks/${id}`);
}

/**
 * Fetch execution history for a playbook, sorted by startedAt descending.
 * GET /api/ha-playbooks/:playbookId/history
 */
export async function fetchPlaybookExecutions(
  playbookId: number,
): Promise<PlaybookExecution[]> {
  if (fixtureMode) {
    const { fixturePlaybookExecutions } = await import('@/services/playbookService.fixtures');
    return fixturePlaybookExecutions.filter((e) => e.playbookId === playbookId);
  }
  return apiClient.get<PlaybookExecution[]>(`/ha-playbooks/${playbookId}/history`);
}

/**
 * Fetch the immutable audit trail for one playbook.
 * GET /api/ha-playbooks/:playbookId/audit — gated until PlaybookResource maps it.
 */
export async function fetchPlaybookAudit(playbookId: number): Promise<PlaybookAuditPage> {
  if (fixtureMode) {
    const { fixturePlaybookAudit } = await import('@/services/playbookService.fixtures');
    const items = fixturePlaybookAudit.map((entry) => ({
      ...entry,
      id: entry.id.replace('audit-pb-1-', `audit-pb-${playbookId}-`),
    }));
    return { items, nextCursor: null, total: items.length, hasMore: false };
  }
  if (!RESP_PLAYBOOK_AUDIT) {
    return { items: [], nextCursor: null, total: 0, hasMore: false };
  }
  const response = await apiClient.get<PlaybookAuditPage | PlaybookAuditEntry[]>(
    `/ha-playbooks/${playbookId}/audit?limit=100`
  );
  // Compatibility with an early array-only implementation while RESP-018 is rolled out.
  if (Array.isArray(response)) {
    return { items: response, nextCursor: null, total: response.length, hasMore: false };
  }
  return response;
}

// ---------------------------------------------------------------------------
// Write / action operations
// ---------------------------------------------------------------------------

/**
 * Trigger an immediate execution of a playbook.
 * POST /api/ha-playbooks/:id/execute
 * Optional runtime context (agentId / alertId / inputs) is merged into step configs.
 */
export function executePlaybook(
  id: number,
  context?: {
    alertId?: string;
    agentId?: string;
    hostname?: string;
    inputs?: Record<string, string | number | boolean>;
  },
): Promise<{ executionId: string }> {
  return apiClient.post<{ executionId: string }>(`/ha-playbooks/${id}/execute`, context ?? {});
}

/**
 * Toggle the active flag on a playbook.
 * PATCH /api/ha-playbooks/:id/status?active=<boolean>
 * Returns void (HTTP 204 No Content on success).
 */
export function setPlaybookActive(id: number, active: boolean): Promise<void> {
  return apiClient.patch<void>(`/ha-playbooks/${id}/status`, undefined, {
    params: { active },
  });
}

/**
 * Create a new playbook.
 * POST /api/ha-playbooks
 */
export function createPlaybook(
  playbook: Omit<Playbook, 'id' | 'runCount' | 'lastRunAt' | 'lastRunStatus'>,
): Promise<Playbook> {
  return apiClient.post<Playbook>('/ha-playbooks', playbook);
}

/**
 * Update an existing playbook by id.
 * PUT /api/ha-playbooks/:id
 */
export async function updatePlaybook(
  id: number,
  playbook: Partial<Playbook>,
): Promise<Playbook> {
  if (fixtureMode) {
    const current = await fetchPlaybook(id);
    return { ...current, ...playbook, id };
  }
  return apiClient.put<Playbook>(`/ha-playbooks/${id}`, playbook);
}
