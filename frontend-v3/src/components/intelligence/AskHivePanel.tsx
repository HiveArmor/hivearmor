/**
 * AskHivePanel — assistive SOC AI with structured finding output (HI-07)
 */

import { useState } from 'react';

import { useMutation } from '@tanstack/react-query';
import { Brain, Loader2 } from 'lucide-react';

import { IntelligenceFindingCard } from '@/components/intelligence/IntelligenceFindingCard';
import { ROLE_LABELS } from '@/lib/roles';
import {
  canQuerySocAi,
  formatSocAiHttpHonesty,
  isSocAiUnavailableAnswer,
  socAiService,
} from '@/services/socAi.service';
import { useAuthStore } from '@/store/auth.store';

import './AskHivePanel.css';

export interface AskHivePanelProps {
  context?: string;
  placeholder?: string;
  persistFinding?: boolean;
  compact?: boolean;
}

export function AskHivePanel({
  context,
  placeholder = 'e.g. What should I check for this IOC before escalating?',
  persistFinding = false,
  compact = false,
}: AskHivePanelProps): JSX.Element {
  const roles = useAuthStore((state) => state.user?.roles ?? []);
  const hasSocAiRole = canQuerySocAi(roles);
  const [prompt, setPrompt] = useState('');

  const aiMutation = useMutation({
    mutationFn: () =>
      socAiService.query({
        prompt: prompt.trim(),
        context,
        persist: persistFinding,
      }),
  });

  return (
    <section
      className={compact ? 'hi-ask-hive hi-ask-hive--compact' : 'hi-ask-hive'}
      aria-label="Ask Hive"
    >
      <header className="hi-ask-hive__head">
        <h2>Ask Hive</h2>
        <span className="hi-ask-hive__badge">Assist only</span>
      </header>
      <p className="hi-ask-hive__hint">
        Assistive SOC AI — never autonomous response. STAGING CANDIDATE.
      </p>

      {!hasSocAiRole ? (
        <p className="hi-ask-hive__honesty">
          Required permission: {ROLE_LABELS.ROLE_ANALYST}, {ROLE_LABELS.ROLE_SOC_MANAGER}, or{' '}
          {ROLE_LABELS.ROLE_ADMIN}.
        </p>
      ) : (
        <>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={placeholder}
            aria-label="Ask Hive question"
          />
          <button
            type="button"
            className="hi-ask-hive__submit"
            disabled={!prompt.trim() || aiMutation.isPending}
            onClick={() => aiMutation.mutate()}
          >
            {aiMutation.isPending ? (
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} aria-hidden />
            ) : (
              <Brain size={16} aria-hidden />
            )}
            Ask Hive
          </button>

          {aiMutation.isError && (
            <p className="hi-ask-hive__honesty hi-ask-hive__honesty--error" role="alert">
              {formatSocAiHttpHonesty(aiMutation.error, { hasLocalRole: hasSocAiRole })}
            </p>
          )}

          {aiMutation.isSuccess && aiMutation.data && (
            <div className="hi-ask-hive__result">
              {isSocAiUnavailableAnswer(aiMutation.data) ? (
                <IntelligenceFindingCard
                  finding={aiMutation.data.finding}
                  compact={compact}
                  showAnswer
                />
              ) : (
                <IntelligenceFindingCard
                  finding={aiMutation.data.finding}
                  compact={compact}
                />
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
