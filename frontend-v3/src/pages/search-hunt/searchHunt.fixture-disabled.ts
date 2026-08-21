import type {
  HuntEventDetail,
  HuntFieldDefinition,
  HuntFieldValuesResponse,
  HuntSearchRequest,
  HuntSearchResponse,
} from './searchHunt.types';

import type { SavedHuntDTO } from '@/types/search';

const fixturesUnavailable = (): never => {
  throw new Error('Search & Hunt fixture data is unavailable in production builds.');
};

export const foundationSavedHunts: SavedHuntDTO[] = [];
export const foundationHuntFields: HuntFieldDefinition[] = [];

export async function executeFoundationHunt(
  _request: HuntSearchRequest,
  _signal?: AbortSignal
): Promise<HuntSearchResponse> {
  return fixturesUnavailable();
}

export function getFoundationHuntEventDetail(_eventId: string): HuntEventDetail {
  return fixturesUnavailable();
}

export function getFoundationHuntFieldValues(
  _searchId: string,
  _field: string,
  _cursor: string | null,
  _query: string,
  _signal?: AbortSignal,
): HuntFieldValuesResponse {
  return fixturesUnavailable();
}
