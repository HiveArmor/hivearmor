/**
 * AiChatHistoryList — displays past AI chat sessions for a context (Sprint 25).
 *
 * Requirements: 5.7, 19.1, 19.2
 */

import { useQuery } from '@tanstack/react-query';

import { aiChatService } from '@/services/aiChatService';
import type { AiContextType } from '@/types/ai.types';

export interface AiChatHistoryListProps {
  contextType: AiContextType;
  contextId: string;
}

const PREVIEW_LIMIT = 80;

export function AiChatHistoryList({ contextType, contextId }: AiChatHistoryListProps): JSX.Element | null {
  const { data: history } = useQuery({
    queryKey: ['ai-chat-history', contextType, contextId],
    queryFn: () => aiChatService.getHistory(contextType, contextId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!history || history.length === 0) return null;

  return (
    <section
      aria-label="Previous AI conversations"
      style={{
        borderTop: '1px solid var(--ha-border)',
        padding: '12px 0',
        marginTop: 16,
      }}
    >
      <p
        style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--ha-text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 8,
        }}
      >
        Previous AI Conversations
      </p>

      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {history.map(entry => {
          // Find the first user message for the preview
          const firstUserMsg = entry.messages.find(m => m.role === 'user');
          const preview = firstUserMsg
            ? firstUserMsg.content.slice(0, PREVIEW_LIMIT) +
              (firstUserMsg.content.length > PREVIEW_LIMIT ? '…' : '')
            : '(no messages)';

          const msgCount = entry.messages.length;
          const timestamp = new Date(entry.createdAt).toLocaleString();

          return (
            <li
              key={entry.id}
              style={{
                background: 'var(--ha-surface-raised)',
                border: '1px solid var(--ha-border)',
                borderRadius: 4,
                padding: '8px 12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4,
                }}
              >
                <time
                  dateTime={entry.createdAt}
                  style={{ fontSize: '0.6875rem', color: 'var(--ha-text-secondary)' }}
                >
                  {timestamp}
                </time>
                <span
                  style={{
                    fontSize: '0.6875rem',
                    color: 'var(--ha-text-secondary)',
                    background: 'var(--ha-surface-primary)',
                    border: '1px solid var(--ha-border)',
                    borderRadius: 3,
                    padding: '1px 6px',
                  }}
                  aria-label={`${String(msgCount)} messages`}
                >
                  {msgCount} msg{msgCount !== 1 ? 's' : ''}
                </span>
              </div>
              <p
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--ha-text-primary)',
                  margin: 0,
                  lineHeight: 1.4,
                }}
              >
                {preview}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
