/**
 * ActivityFeed — Chronological feed with actor avatars, type icons, note input
 * with @mention autocomplete, type filter toggles.
 */

import { useCallback, useRef, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Clock,
  FileText,
  MessageSquare,
  Play,
  Shield,
  UserPlus,
} from 'lucide-react';

import { addNote, getActivity } from '../services/incident-workbench.service';
import type {
  ActivityEntry,
  ActivityType,
  AddNoteBody,
} from '../types/incident-workbench.types';

export interface ActivityFeedProps {
  incidentId: string;
  mentionSuggestions?: string[];
  initialTypes?: ActivityType[];
}

const TYPE_ICONS: Record<ActivityType, JSX.Element> = {
  note: <MessageSquare size={14} aria-hidden="true" />,
  field_change: <FileText size={14} aria-hidden="true" />,
  task_completed: <Shield size={14} aria-hidden="true" />,
  response_action: <Play size={14} aria-hidden="true" />,
  alert_linked: <AlertTriangle size={14} aria-hidden="true" />,
  evidence_added: <UserPlus size={14} aria-hidden="true" />,
};

const TYPE_LABELS: Record<ActivityType, string> = {
  note: 'Notes',
  field_change: 'Changes',
  task_completed: 'Tasks',
  response_action: 'Actions',
  alert_linked: 'Alerts',
  evidence_added: 'Evidence',
};

function formatActivityTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${String(diffMins)}m ago`;
  if (diffMins < 1440) return `${String(Math.floor(diffMins / 60))}h ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function ActivityFeed({ incidentId, mentionSuggestions = [], initialTypes = [] }: ActivityFeedProps): JSX.Element {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<ActivityType[]>(initialTypes);
  const [noteContent, setNoteContent] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const queryKey = ['incident-activity', incidentId, undefined, typeFilter.length > 0 ? typeFilter : undefined] as const;

  const activityQuery = useQuery({
    queryKey,
    queryFn: () =>
      getActivity(incidentId, {
        types: typeFilter.length > 0 ? typeFilter : undefined,
      }),
    staleTime: 10_000,
  });

  const noteMutation = useMutation({
    mutationFn: (body: AddNoteBody) => addNote(incidentId, body),
    onSuccess: () => {
      setNoteContent('');
      void queryClient.invalidateQueries({ queryKey: ['incident-activity', incidentId] });
    },
  });

  const handleSubmitNote = useCallback(() => {
    if (!noteContent.trim() || noteMutation.isPending) return;
    const mentions = [...noteContent.matchAll(/@(\w[\w.]*)/g)].map((m) => m[1]);
    const body: AddNoteBody = {
      content: noteContent.trim(),
      mentions: mentions.length > 0 ? mentions : undefined,
    };
    noteMutation.mutate(body);
  }, [noteContent, noteMutation]);

  const handleNoteKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmitNote();
      }
    },
    [handleSubmitNote]
  );

  const handleNoteChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setNoteContent(value);

      // Detect @mention pattern
      const lastAt = value.lastIndexOf('@');
      if (lastAt >= 0 && lastAt === value.length - 1) {
        setShowMentions(true);
        setMentionFilter('');
      } else if (lastAt >= 0) {
        const afterAt = value.slice(lastAt + 1);
        if (/^\w*$/.test(afterAt) && !afterAt.includes(' ')) {
          setShowMentions(true);
          setMentionFilter(afterAt.toLowerCase());
        } else {
          setShowMentions(false);
        }
      } else {
        setShowMentions(false);
      }
    },
    []
  );

  const insertMention = useCallback(
    (username: string) => {
      const lastAt = noteContent.lastIndexOf('@');
      const before = noteContent.slice(0, lastAt);
      setNoteContent(`${before}@${username} `);
      setShowMentions(false);
      inputRef.current?.focus();
    },
    [noteContent]
  );

  const toggleTypeFilter = useCallback((type: ActivityType) => {
    setTypeFilter((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }, []);

  const filteredMentions = mentionSuggestions.filter((u) =>
    u.toLowerCase().includes(mentionFilter)
  );

  const entries: ActivityEntry[] = activityQuery.data?.items ?? [];

  return (
    <section className="activity-feed" aria-label="Activity feed">
      <div className="activity-feed__header">
        <h2 className="activity-feed__title">
          <Clock size={15} aria-hidden="true" /> Activity
        </h2>
        <div className="activity-feed__filters" role="group" aria-label="Filter by activity type">
          {(Object.keys(TYPE_LABELS) as ActivityType[]).map((type) => (
            <button
              className="activity-feed__filter-btn"
              type="button"
              key={type}
              data-active={String(typeFilter.includes(type))}
              onClick={() => toggleTypeFilter(type)}
              aria-pressed={typeFilter.includes(type)}
            >
              {TYPE_ICONS[type]}
              <span>{TYPE_LABELS[type]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Note Input */}
      <div className="activity-feed__note-input">
        <div className="activity-feed__textarea-wrapper">
          <textarea
            ref={inputRef}
            className="activity-feed__textarea"
            value={noteContent}
            onChange={handleNoteChange}
            onKeyDown={handleNoteKeyDown}
            placeholder="Add a note… (Ctrl+Enter to send, @ to mention)"
            rows={2}
            aria-label="Add investigation note"
          />
          {showMentions && filteredMentions.length > 0 && (
            <ul className="activity-feed__mentions-dropdown" role="listbox" aria-label="Mention suggestions">
              {filteredMentions.slice(0, 5).map((user) => (
                <li key={user}>
                  <button
                    className="activity-feed__mention-item"
                    type="button"
                    onClick={() => insertMention(user)}
                    role="option"
                  >
                    @{user}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          className="activity-feed__send-btn"
          type="button"
          onClick={handleSubmitNote}
          disabled={!noteContent.trim() || noteMutation.isPending}
        >
          {noteMutation.isPending ? 'Sending…' : 'Send'}
        </button>
      </div>

      {activityQuery.isLoading && (
        <div className="activity-feed__loading" aria-busy="true">Loading activity…</div>
      )}

      {activityQuery.isError && (
        <div className="activity-feed__error" role="alert">
          Could not load activity.{' '}
          <button type="button" onClick={() => void activityQuery.refetch()}>Retry</button>
        </div>
      )}

      {!activityQuery.isLoading && !activityQuery.isError && entries.length === 0 && (
        <div className="activity-feed__empty">No activity recorded yet.</div>
      )}

      <ul className="activity-feed__list" aria-label="Activity entries">
        {entries.map((entry) => (
          <li className="activity-feed__entry" key={entry.id} data-type={entry.type}>
            <div className="activity-feed__avatar">
              {entry.actor.avatar ? (
                <img src={entry.actor.avatar} alt="" className="activity-feed__avatar-img" />
              ) : (
                <span className="activity-feed__avatar-placeholder">
                  {entry.actor.displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="activity-feed__entry-content">
              <div className="activity-feed__entry-header">
                <span className="activity-feed__type-icon">{TYPE_ICONS[entry.type]}</span>
                <strong className="activity-feed__actor">{entry.actor.displayName}</strong>
                <time className="activity-feed__time" dateTime={entry.timestamp}>
                  {formatActivityTime(entry.timestamp)}
                </time>
              </div>
              <p className="activity-feed__text">{entry.content}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
