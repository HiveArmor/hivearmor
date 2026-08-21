/** Production replacement: fictional incident records are never available in a production bundle. */

import type { IncidentListParams } from './incidents.service';
import type { IncidentQueueSummary } from './incidents.types';

export async function fetchFixtureIncidents(_params: IncidentListParams, _signal?: AbortSignal): Promise<never> {
  throw new Error('Incident design fixtures are disabled in production');
}

export async function fetchFixtureIncidentSummary(_analystLogin: string | undefined, _signal?: AbortSignal): Promise<IncidentQueueSummary> {
  throw new Error('Incident design fixtures are disabled in production');
}
