/**
 * intelligenceFinding.service.ts — HI-05 findings API
 * Confirmed path: /api/ha-intelligence/findings
 */

import { apiClient } from '@/lib/apiClient';
import type {
  IntelligenceFindingDTO,
  IntelligenceFindingFeedbackRequest,
} from '@/types/intelligenceFinding.types';

export interface IntelligenceFindingListResult {
  items: IntelligenceFindingDTO[];
  total: number;
}

export const intelligenceFindingService = {
  listFindings: async (
    page = 0,
    size = 20,
    signal?: AbortSignal
  ): Promise<IntelligenceFindingListResult> => {
    const token = localStorage.getItem('hivearmor_auth_token');
    const qs = new URLSearchParams({ page: String(page), size: String(size) });
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api/ha-intelligence/findings?${qs.toString()}`, { headers, signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = (await res.json()) as IntelligenceFindingDTO[];
    const total = parseInt(res.headers.get('X-Total-Count') ?? String(items.length), 10);
    return { items, total: Number.isFinite(total) ? total : items.length };
  },

  getFinding: (id: number, signal?: AbortSignal) =>
    apiClient.get<IntelligenceFindingDTO>(`/ha-intelligence/findings/${id}`, { signal }),

  createFinding: (body: IntelligenceFindingDTO, signal?: AbortSignal) =>
    apiClient.post<IntelligenceFindingDTO>('/ha-intelligence/findings', body, { signal }),

  submitFeedback: (id: number, body: IntelligenceFindingFeedbackRequest, signal?: AbortSignal) =>
    apiClient.post<void>(`/ha-intelligence/findings/${id}/feedback`, body, { signal }),
};

export function isUnconfiguredFinding(finding: IntelligenceFindingDTO): boolean {
  return (
    finding.provenance === 'soc-ai-unconfigured' ||
    (finding.confidence <= 0 && finding.facts.length === 1 && finding.inferences.length === 0)
  );
}
