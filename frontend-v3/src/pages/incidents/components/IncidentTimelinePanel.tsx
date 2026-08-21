/**
 * IncidentTimelinePanel — Timeline Tab Content
 * Chronological event list per CMD-04 §6.2
 */

import {
  AlertCircle,
  StickyNote,
  RefreshCw,
  CheckSquare,
  FileText,
  Flag,
  UserPlus,
} from 'lucide-react';

import type { TimelineEvent } from '../incidentDetail.types';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { LoadingState } from '@/components/loading-state/LoadingState';

import './IncidentTimelinePanel.css';

export interface IncidentTimelinePanelProps {
  events: TimelineEvent[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  compact?: boolean;
  limit?: number;
}

const eventIcons: Record<string, React.ElementType> = {
  alert_added: AlertCircle,
  note_added: StickyNote,
  status_changed: RefreshCw,
  task_created: CheckSquare,
  evidence_added: FileText,
  priority_changed: Flag,
  assignee_changed: UserPlus,
  // Backend returns uppercase ACTION_TYPE format
  STATUS_CHANGE: RefreshCw,
  INCIDENT_CREATED: AlertCircle,
  INCIDENT_STATUS_CHANGE: RefreshCw,
  INCIDENT_ASSIGNED_TO: UserPlus,
  INCIDENT_ASSIGNED_CHANGE: UserPlus,
  INCIDENT_NOTE_ADD: StickyNote,
  INCIDENT_ALERT_ADD: AlertCircle,
  INCIDENT_COMMAND_EXECUTED: CheckSquare,
  INCIDENT_COMPLETED: Flag,
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

const eventLabels: Record<string, string> = {
  alert_added: 'Alert correlated',
  note_added: 'Analyst note',
  status_changed: 'Status changed',
  task_created: 'Task created',
  evidence_added: 'Evidence preserved',
  priority_changed: 'Priority changed',
  assignee_changed: 'Ownership changed',
  // Backend uppercase format
  STATUS_CHANGE: 'Status changed',
  INCIDENT_CREATED: 'Incident created',
  INCIDENT_STATUS_CHANGE: 'Status changed',
  INCIDENT_ASSIGNED_TO: 'Assigned',
  INCIDENT_ASSIGNED_CHANGE: 'Reassigned',
  INCIDENT_NOTE_ADD: 'Analyst note',
  INCIDENT_ALERT_ADD: 'Alert correlated',
  INCIDENT_COMMAND_EXECUTED: 'Action executed',
  INCIDENT_COMPLETED: 'Incident resolved',
};

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

export function IncidentTimelinePanel({
  events,
  isLoading,
  isError,
  onRetry,
  compact = false,
  limit,
}: IncidentTimelinePanelProps): JSX.Element {
  if (isLoading) {
    return <LoadingState message="Loading timeline events..." />;
  }

  if (isError) {
    return <ErrorState message="Failed to load timeline events" onRetry={onRetry} />;
  }

  if (!events || events.length === 0) {
    return <EmptyState icon={<AlertCircle size={48} />} title="No timeline events yet." />;
  }

  const visibleEvents = limit ? events.slice(0, limit) : events;

  return (
    <section className="incident-timeline" data-compact={String(compact)} aria-label="Incident activity timeline">
      <ol className="incident-timeline__list">
        {visibleEvents.map((event, index) => {
          const eventType = event.eventType ?? event.type ?? 'unknown';
          const Icon = eventIcons[eventType] ?? AlertCircle;
          const label = eventLabels[eventType] ?? eventType;
          const date = new Date(event.timestamp);
          return (
            <li className="incident-timeline__event" key={`${String(event.id)}-${String(index)}`}>
              <div className="incident-timeline__time" title={formatTimestamp(event.timestamp)}>
                <time dateTime={event.timestamp}>
                  {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </time>
                <span>{formatRelative(event.timestamp)}</span>
              </div>
              <span className="incident-timeline__marker" data-type={eventType}>
                <Icon size={12} aria-hidden="true" />
              </span>
              <article className="incident-timeline__card">
                <div className="incident-timeline__meta">
                  <strong>{label}</strong>
                  <span>{event.actor}</span>
                </div>
                <p>{event.description ?? event.title ?? event.details ?? ''}</p>
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
