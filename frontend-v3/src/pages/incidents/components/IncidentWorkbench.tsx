/**
 * IncidentWorkbench — Main layout wiring all workbench panels.
 * Connects SSE hook for live updates and handles inter-panel navigation.
 */

import { useCallback, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { ActivityFeed } from './ActivityFeed';
import { EventSearchPanel } from './EventSearchPanel';
import { EvidenceProvenanceCard } from './EvidenceProvenanceCard';
import { ResponseActionsPanel } from './ResponseActionsPanel';
import { SimilarIncidentsPanel } from './SimilarIncidentsPanel';
import { TaskPanel } from './TaskPanel';
import { WorkbenchHeader } from './WorkbenchHeader';
import { useIncidentStream } from '../hooks/useIncidentStream';
import type { EvidenceProvenance, IncidentSseEvent } from '../types/incident-workbench.types';

import { apiClient } from '@/lib/apiClient';

interface WorkbenchIncident {
  id: string;
  title: string;
  description: string | null;
  assignee: string | null;
  version: number;
  entities?: Array<{ id: string; label: string; type: string }>;
}

type WorkbenchPanel = 'tasks' | 'similar' | 'events' | 'actions' | 'activity' | 'evidence';

export function IncidentWorkbench(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const incidentId = id ?? '';
  const [activePanel, setActivePanel] = useState<WorkbenchPanel>('tasks');

  // Fetch base incident data
  const incidentQuery = useQuery({
    queryKey: ['incident', incidentId],
    queryFn: () => apiClient.get<WorkbenchIncident>(`/ha-incidents/${encodeURIComponent(incidentId)}`),
    enabled: Boolean(incidentId),
    staleTime: 30_000,
  });

  // Fetch evidence with provenance
  const evidenceQuery = useQuery({
    queryKey: ['incident-evidence', incidentId],
    queryFn: () => apiClient.get<EvidenceProvenance[]>(`/ha-incidents/${encodeURIComponent(incidentId)}/evidence`),
    enabled: activePanel === 'evidence' && Boolean(incidentId),
    staleTime: 30_000,
  });

  // SSE live updates
  const handleSseEvent = useCallback((_event: IncidentSseEvent) => {
    // Inter-panel navigation could be triggered here
    // For now, query invalidation is handled by the hook itself
  }, []);

  useIncidentStream(incidentId || undefined, {
    enabled: Boolean(incidentId),
    onEvent: handleSseEvent,
  });

  if (!incidentId) {
    return <div className="incident-workbench__error">No incident ID provided.</div>;
  }

  if (incidentQuery.isLoading) {
    return <div className="incident-workbench__loading" aria-busy="true">Loading workbench…</div>;
  }

  if (incidentQuery.isError || !incidentQuery.data) {
    return (
      <div className="incident-workbench__error" role="alert">
        Could not load incident.{' '}
        <button type="button" onClick={() => void incidentQuery.refetch()}>Retry</button>
      </div>
    );
  }

  const incident = incidentQuery.data;
  const linkedEntities = incident.entities?.map((e) => e.label) ?? [];
  const mentionSuggestions = ['maya.chen', 'james.wilson', 'priya.sharma', 'carlos.rodriguez', 'aisha.thompson'];

  const panelTabs: Array<{ key: WorkbenchPanel; label: string }> = [
    { key: 'tasks', label: 'Tasks' },
    { key: 'similar', label: 'Similar' },
    { key: 'events', label: 'Events' },
    { key: 'actions', label: 'Actions' },
    { key: 'activity', label: 'Activity' },
    { key: 'evidence', label: 'Evidence' },
  ];

  return (
    <div className="incident-workbench-v2">
      <WorkbenchHeader
        incidentId={incidentId}
        title={incident.title}
        description={incident.description}
        assignee={incident.assignee}
        version={incident.version}
      />

      <nav className="incident-workbench-v2__tabs" role="tablist" aria-label="Workbench panels">
        {panelTabs.map((tab) => (
          <button
            className="incident-workbench-v2__tab"
            type="button"
            role="tab"
            key={tab.key}
            aria-selected={activePanel === tab.key}
            aria-controls={`workbench-panel-${tab.key}`}
            onClick={() => setActivePanel(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div
        className="incident-workbench-v2__panel"
        role="tabpanel"
        id={`workbench-panel-${activePanel}`}
      >
        {activePanel === 'tasks' && <TaskPanel incidentId={incidentId} />}
        {activePanel === 'similar' && <SimilarIncidentsPanel incidentId={incidentId} />}
        {activePanel === 'events' && <EventSearchPanel incidentId={incidentId} linkedEntities={linkedEntities} />}
        {activePanel === 'actions' && <ResponseActionsPanel incidentId={incidentId} />}
        {activePanel === 'activity' && (
          <ActivityFeed incidentId={incidentId} mentionSuggestions={mentionSuggestions} />
        )}
        {activePanel === 'evidence' && (
          <section aria-label="Evidence with provenance">
            {evidenceQuery.isLoading && (
              <div aria-busy="true">Loading evidence…</div>
            )}
            {evidenceQuery.isError && (
              <div role="alert">
                Could not load evidence.{' '}
                <button type="button" onClick={() => void evidenceQuery.refetch()}>Retry</button>
              </div>
            )}
            {evidenceQuery.data?.map((evi) => (
              <EvidenceProvenanceCard key={evi.id} incidentId={incidentId} evidence={evi} />
            ))}
            {!evidenceQuery.isLoading && !evidenceQuery.isError && (evidenceQuery.data?.length ?? 0) === 0 && (
              <div>No evidence items with provenance data.</div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
