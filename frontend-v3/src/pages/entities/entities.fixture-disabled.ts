import type { EntityAlertDTO, EntityDetailDTO, EntityEventDTO, EntityIncidentOption, EntityListFilters, EntityListResponse } from '@/types/entity.types';

export const foundationEntities = [];

export function getFoundationEntities(
  _filters: EntityListFilters,
  _signal?: AbortSignal,
): EntityListResponse {
  throw new Error('Entity fixture data is unavailable in production builds.');
}

export function getFoundationEntityDetail(_id: string): EntityDetailDTO {
  throw new Error('Entity fixture data is unavailable in production builds.');
}

export function getFoundationEntityAlerts(_id: string): EntityAlertDTO[] {
  throw new Error('Entity fixture data is unavailable in production builds.');
}

export function getFoundationEntityEvents(_id: string): EntityEventDTO[] {
  throw new Error('Entity fixture data is unavailable in production builds.');
}

export function getFoundationEntityIncidentOptions(): EntityIncidentOption[] {
  throw new Error('Entity fixture data is unavailable in production builds.');
}
