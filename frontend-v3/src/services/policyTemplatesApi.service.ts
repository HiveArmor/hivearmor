/**
 * Policy template library API — PT-2 tabbed editor plane.
 *
 * Wires the PT-1 template-library endpoints on canonical Plane A
 * (`AgentPolicyResource`, merged in PR #364):
 *   GET  /api/agent-policies/templates            → list the visible library
 *   GET  /api/agent-policies/templates?name&scope&platform → filtered search
 *   GET  /api/agent-policies/templates/{id}        → one template
 *   POST /api/agent-policies/templates             → create from a raw PT-0 envelope
 *   POST /api/agent-policies/{id}/clone            → clone into caller's ORG (v1)
 *   PUT  /api/agent-policies/{id}                  → edit; version bumps server-side
 *
 * A template row IS a `hive_agent_policy` row with `is_template=true`; the DTO is
 * the same `UtmAgentPolicyDTO` used by the FIM push plane, so list/get return that
 * shape (metadata columns + a schema-v1 `policyConfig` JSON string). Create uses the
 * PT-0 ENVELOPE shape (metadata + flat capability sections in one object), which the
 * backend splits into columns + policyConfig.
 */

import { apiClient } from '@/lib/apiClient';
import type { UtmAgentPolicyDTO } from '@/types/agentPolicies';
import type { PolicyTemplateEnvelope, TemplateScope } from '@/types/policyTemplates';

export interface TemplateSearchParams {
  name?: string;
  scope?: TemplateScope;
  platform?: string;
}

function buildQuery(params: TemplateSearchParams): string {
  const q = new URLSearchParams();
  if (params.name && params.name.trim()) q.set('name', params.name.trim());
  if (params.scope) q.set('scope', params.scope);
  if (params.platform && params.platform.trim() && params.platform !== 'any') {
    q.set('platform', params.platform.trim());
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** List the visible template library (own-tenant any scope + all GLOBAL). */
export async function listPolicyTemplates(): Promise<UtmAgentPolicyDTO[]> {
  return apiClient.get<UtmAgentPolicyDTO[]>('/agent-policies/templates');
}

/** Filtered search over the visible library. Empty params ⇒ full list. */
export async function searchPolicyTemplates(
  params: TemplateSearchParams,
): Promise<UtmAgentPolicyDTO[]> {
  return apiClient.get<UtmAgentPolicyDTO[]>(`/agent-policies/templates${buildQuery(params)}`);
}

/** Get one template by id within library visibility. */
export async function getPolicyTemplate(id: number): Promise<UtmAgentPolicyDTO> {
  return apiClient.get<UtmAgentPolicyDTO>(`/agent-policies/templates/${id}`);
}

/**
 * Create a template from a raw PT-0 envelope (metadata keys + schema-v1 sections in
 * one JSON object). GLOBAL scope requires global-admin (enforced server-side → 403).
 */
export async function createPolicyTemplate(
  envelope: PolicyTemplateEnvelope,
): Promise<UtmAgentPolicyDTO> {
  return apiClient.post<UtmAgentPolicyDTO>('/agent-policies/templates', envelope);
}

/**
 * Edit an existing template. Server owns `version` — it bumps on each saved edit,
 * so the client never sends a trusted version. Reuses the canonical PUT endpoint.
 */
export async function updatePolicyTemplate(
  id: number,
  dto: UtmAgentPolicyDTO,
): Promise<UtmAgentPolicyDTO> {
  return apiClient.put<UtmAgentPolicyDTO>(`/agent-policies/${id}`, dto);
}

/** Clone a visible template into a new ORG-scoped template (version 1). */
export async function clonePolicyTemplate(
  id: number,
  newName: string,
): Promise<UtmAgentPolicyDTO> {
  return apiClient.post<UtmAgentPolicyDTO>(`/agent-policies/${id}/clone`, { name: newName });
}
