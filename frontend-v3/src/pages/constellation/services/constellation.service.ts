/**
 * Sprint 48 Constellation Service — CON-001, CON-002, CON-003 API calls.
 * Uses the project's apiClient for consistent auth/tenant handling.
 */

import type {
  ExpandOptions,
  ExpansionResult,
  ExploreOptions,
  ExploreResponse,
  RelationshipEvidenceResponse,
  SeedDescriptor,
} from '../types/constellation.types';

import { apiClient } from '@/lib/apiClient';


const BASE_PATH = '/ha-constellation';

/**
 * CON-001: Create a bounded constellation snapshot from a seed entity/query.
 */
export async function explore(
  seed: SeedDescriptor,
  options: ExploreOptions,
  signal?: AbortSignal
): Promise<ExploreResponse> {
  return apiClient.post<ExploreResponse>(
    `${BASE_PATH}/explore`,
    { seed, options },
    { signal }
  );
}

/**
 * CON-002: Expand a node in an existing constellation snapshot.
 */
export async function expand(
  snapshotId: string,
  options: ExpandOptions,
  signal?: AbortSignal
): Promise<ExpansionResult> {
  return apiClient.post<ExpansionResult>(
    `${BASE_PATH}/explore/${encodeURIComponent(snapshotId)}/expand`,
    options,
    { signal }
  );
}

/**
 * CON-003: Get detailed relationship evidence for a specific edge.
 */
export async function getRelationshipEvidence(
  relationshipId: string,
  signal?: AbortSignal
): Promise<RelationshipEvidenceResponse> {
  return apiClient.get<RelationshipEvidenceResponse>(
    `${BASE_PATH}/relationships/${encodeURIComponent(relationshipId)}`,
    { signal }
  );
}
