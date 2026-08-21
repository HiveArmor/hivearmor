/**
 * ActivityTimeline — Sprint 46
 * Infinite scroll timeline showing entity activity events with type filtering,
 * severity coloring, and PIT-based pagination via TanStack Query's useInfiniteQuery.
 */

import { useCallback, useRef, useState } from 'react';

import { Spinner } from '@patternfly/react-core';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  Activity, FileText, Globe, Key, Monitor, Radio, Server, ShieldAlert,
} from 'lucide-react';

import { getActivity } from '../services/dossier.service';
import type { ActivityCategory, ActivityEvent, ActivityEventType } from '../types/dossier.types';

import './ActivityTimeline.css';

export interface ActivityTimelineProps {
  entityId: string;
}

const EVENT_TYPE_ICONS: Record<ActivityEventType, typeof Activity> = {
  process_execution: Monitor,
  network_connection: Globe,
  authentication: Key,
  file_operation: FileText,
  registry_change: Server,
  service_change: Server,
  dns_query: Radio,
  alert_triggered: ShieldAlert,
};

const CATEGORY_FILTERS: { value: ActivityCategory; label: string }[] = [
  { value: 'execution', label: 'Execution' },
  { value: 'network', label: 'Network' },
  { value: 'identity', label: 'Identity' },
  { value: 'file', label: 'File' },
  { value: 'system', label: 'System' },
  { value: 'security', label: 'Security' },
];

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' });
}

export function ActivityTimeline({ entityId }: ActivityTimelineProps): JSX.Element {
  const [typeFilter, setTypeFilter] = useState<ActivityEventType[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const activityQuery = useInfiniteQuery({
    queryKey: ['entity-activity', entityId, typeFilter],
    queryFn: ({ pageParam, signal }) => {
      return getActivity(
        entityId,
        {
          cursor: pageParam as string | undefined,
          limit: 50,
          types: typeFilter.length > 0 ? typeFilter : undefined,
        },
        signal,
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    staleTime: 20_000,
    gcTime: 5 * 60_000,
  });

  const allEvents = activityQuery.data?.pages.flatMap(page => page.items) ?? [];
  const total = activityQuery.data?.pages[0]?.total ?? 0;

  const lastElementRef = useCallback((node: HTMLDivElement | null) => {
    if (activityQuery.isFetchingNextPage) return;
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting && activityQuery.hasNextPage) {
        void activityQuery.fetchNextPage();
      }
    });
    if (node) observerRef.current.observe(node);
  }, [activityQuery]);

  const toggleTypeFilter = useCallback((type: ActivityEventType) => {
    setTypeFilter(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type],
    );
  }, []);

  return (
    <section className="ha-activity-timeline">
      <header className="ha-activity-timeline__header">
        <Activity size={14} />
        <h2>Activity Timeline</h2>
        <span className="ha-activity-timeline__total">{total} events</span>
      </header>

      <div className="ha-activity-timeline__filters">
        {CATEGORY_FILTERS.map(cat => (
          <button
            key={cat.value}
            type="button"
            className="ha-activity-timeline__filter-chip"
            data-active={typeFilter.includes(cat.value as unknown as ActivityEventType)}
            onClick={() => toggleTypeFilter(cat.value as unknown as ActivityEventType)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {activityQuery.isLoading ? (
        <div className="ha-activity-timeline__loading">
          <Spinner size="md" aria-label="Loading activity" />
        </div>
      ) : allEvents.length === 0 ? (
        <div className="ha-activity-timeline__empty">
          <p>No activity events found for this entity.</p>
        </div>
      ) : (
        <div className="ha-activity-timeline__list" role="list">
          {allEvents.map((event: ActivityEvent, index: number) => {
            const Icon = EVENT_TYPE_ICONS[event.type] ?? Activity;
            const isLast = index === allEvents.length - 1;
            return (
              <div
                key={event.id}
                ref={isLast ? lastElementRef : undefined}
                className="ha-activity-timeline__event"
                data-severity={event.severity}
                role="listitem"
              >
                <div className="ha-activity-timeline__event-icon">
                  <Icon size={14} />
                </div>
                <div className="ha-activity-timeline__event-content">
                  <div className="ha-activity-timeline__event-header">
                    <span className="ha-activity-timeline__event-type">
                      {event.type.replace(/_/g, ' ')}
                    </span>
                    <span className="ha-activity-timeline__event-time">
                      {formatTimestamp(event.timestamp)}
                    </span>
                  </div>
                  <p className="ha-activity-timeline__event-desc">{event.description}</p>
                  <div className="ha-activity-timeline__event-meta">
                    <span>{event.source}</span>
                    <span data-severity={event.severity}>{event.severity}</span>
                    {event.category && <span>{event.category}</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {activityQuery.isFetchingNextPage && (
            <div className="ha-activity-timeline__loading-more">
              <Spinner size="sm" aria-label="Loading more" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
