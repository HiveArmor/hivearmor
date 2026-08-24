/**
 * SlaDeadlineRenderer — SLA countdown via shared SlaIndicator
 * Per CMD-03 / INCIDENT-04 — wire SlaIndicator into the incident queue grid.
 */

import type { ICellRendererParams } from 'ag-grid-community';

import { SlaIndicator } from '@/components/sla-indicator/SlaIndicator';
import type { IncidentListItem } from '@/pages/incidents/incidents.types';

export function SlaDeadlineRenderer(
  params: ICellRendererParams<IncidentListItem, string | null>
): JSX.Element {
  const deadline = params.value ?? params.data?.slaDeadline ?? null;

  if (!deadline) {
    return <span style={{ color: 'var(--ha-text-secondary)' }}>—</span>;
  }

  return <SlaIndicator dueAt={deadline} size="sm" showLabel />;
}
