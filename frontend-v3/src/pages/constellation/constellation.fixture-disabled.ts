import type {
  ConstellationExpansionResponse, ConstellationFilters, ConstellationResponse,
  RelationshipEvidenceDTO,
} from '@/types/constellation.types';

export function getFoundationConstellation(_filters: ConstellationFilters, _signal?: AbortSignal): Promise<ConstellationResponse> {
  throw new Error('Threat Constellation fixtures are excluded from production builds.');
}

export function getFoundationExpansion(
  _snapshotId: string,
  _nodeId: string,
  _signal?: AbortSignal
): Promise<ConstellationExpansionResponse> {
  throw new Error('Threat Constellation fixtures are excluded from production builds.');
}

export function getFoundationRelationshipEvidence(
  _relationshipId: string,
  _signal?: AbortSignal
): Promise<RelationshipEvidenceDTO> {
  throw new Error('Threat Constellation fixtures are excluded from production builds.');
}
