import type { AlertQueueFilters, AlertQueueRecord, AlertQueueSummary, AlertTriageDetail } from './alertTriage.types';

export const foundationAlertQueue: AlertQueueRecord[] = [];

export const foundationAlertQueueSummary: AlertQueueSummary = {
  totalApproximate: 0,
  criticalOpen: 0,
  slaAtRisk: 0,
  unassigned: 0,
  threatIntelMatched: 0,
  snapshotAt: '',
  dataCompleteness: 'unavailable',
};

export function getFoundationAlertDetail(_alertId: string): AlertTriageDetail {
  throw new Error('Foundation alert fixtures are disabled in production builds.');
}

export function filterFoundationAlertQueue(_filters: AlertQueueFilters): AlertQueueRecord[] {
  return [];
}
