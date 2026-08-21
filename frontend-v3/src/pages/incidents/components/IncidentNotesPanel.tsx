/**
 * IncidentNotesPanel — notes composer and note-only activity for an incident.
 * Uses GET/POST /api/ha-incidents/{id}/activity[/notes]. OpenSearch-backed
 * incidents only; PostgreSQL-only seed incidents return 404 from activity.
 */

import { ActivityFeed } from './ActivityFeed';

export interface IncidentNotesPanelProps {
  incidentId: string;
}

export function IncidentNotesPanel({ incidentId }: IncidentNotesPanelProps): JSX.Element {
  return (
    <div style={{ padding: '24px' }}>
      <ActivityFeed incidentId={incidentId} initialTypes={['note']} />
    </div>
  );
}
