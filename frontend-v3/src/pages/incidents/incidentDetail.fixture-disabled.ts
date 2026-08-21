/** Production replacement for development-only incident detail records. */

import type { EvidenceItem, IncidentDetail, TimelineEvent } from './incidentDetail.types';

import type { IncidentEntity, UtmAlert } from '@/types/api.types';

export const foundationIncident: IncidentDetail = null as never;
export const foundationTimeline: TimelineEvent[] = [];
export const foundationEvidence: EvidenceItem[] = [];
export const foundationEntities: IncidentEntity[] = [];
export const foundationAlerts: UtmAlert[] = [];
