import type { FoundationMetric, FoundationPriorityItem } from './commandCenter.fixtures';

/** Production-safe replacement selected by both supported build pipelines. */
export type { FoundationMetric, FoundationPriorityItem } from './commandCenter.fixtures';

export const foundationMetrics: FoundationMetric[] = [];
export const foundationPriorityWork: FoundationPriorityItem[] = [];
export const foundationTrend: Array<{ time: string; alerts: number; incidents: number }> = [];
export const foundationHealth: Array<{
  label: string;
  value: string;
  detail: string;
  state: 'critical' | 'high' | 'medium' | 'healthy' | 'info' | 'stale';
}> = [];
export const foundationWorkload: Array<{
  name: string;
  assigned: number;
  risk: number;
  utilization: number;
}> = [];
export const foundationActivity: Array<{
  action: string;
  subject: string;
  actor: string;
  time: string;
  state: 'critical' | 'high' | 'medium' | 'healthy' | 'info' | 'stale';
}> = [];
