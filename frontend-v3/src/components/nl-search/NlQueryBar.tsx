/**
 * NlQueryBar — Natural Language / DSL query input bar (Sprint 26).
 *
 * Invariants enforced here:
 * - NoAnyTypeInvariant: zero `any` types
 * - NoRawHexInvariant: CSS module uses --ha-* tokens only
 * - MonacoLazyInvariant: Monaco editor is lazily loaded via React.lazy
 * - JwtHeaderOnlyInvariant: JWT never embedded in URLs (delegated to searchService)
 *
 * On HTTP 503 (LLM provider not configured):
 * - The query bar widget is replaced with LlmUnavailableCard.
 * - A panel-level error message is shown above the card.
 * - The surrounding page continues to render (Requirements 8.3, 10.6).
 */

import { lazy, Suspense, useState } from 'react';

import styles from './NlQueryBar.module.css';

import { LlmUnavailableCard, LlmUnavailableErrorStrip } from '@/components/llm-unavailable-card';
import { translateNlToDsl } from '@/services/searchService';
import type { NlToDslResponse } from '@/types/search.types';

// Lazily import Monaco to avoid bloating the initial bundle.
const MonacoEditor = lazy(() => import('@monaco-editor/react'));

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface NlQueryBarProps {
  indexPattern: string;
  initialMode?: 'nl' | 'dsl';
  onTranslate: (response: NlToDslResponse) => void;
  onDslChange?: (dsl: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NlQueryBar(props: NlQueryBarProps): JSX.Element {
  const [mode, setMode] = useState<'nl' | 'dsl'>(props.initialMode ?? 'nl');
  const [nlValue, setNlValue] = useState('');
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [llmUnavailable, setLlmUnavailable] = useState(false);

  const handleTranslate = async (): Promise<void> => {
    if (!nlValue.trim() || translating) return;
    setTranslating(true);
    setError(null);
    try {
      const response = await translateNlToDsl(nlValue, props.indexPattern);
      props.onTranslate(response);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Translation failed';
      // HTTP 503 — LLM provider not configured.
      // Replace the widget with a null-state card; keep the surrounding page mounted.
      if (msg.includes('503')) {
        setLlmUnavailable(true);
      } else {
        setError('Translation failed — try rephrasing your query.');
      }
    } finally {
      setTranslating(false);
    }
  };

  // On 503: replace the entire NlQueryBar widget with the null-state card.
  // The surrounding page (SearchHuntPage etc.) continues to render.
  if (llmUnavailable) {
    return (
      <div className={styles.queryBar}>
        <LlmUnavailableErrorStrip />
        <LlmUnavailableCard
          description="Natural language search requires an AI provider. Ask an administrator to configure one."
        />
      </div>
    );
  }

  const handleModeToggle = (): void => {
    setMode(prev => (prev === 'nl' ? 'dsl' : 'nl'));
    setError(null);
  };

  const handleMonacoChange = (value: string | undefined): void => {
    const next = value ?? '';
    props.onDslChange?.(next);
  };

  const isTranslateDisabled = translating || !nlValue.trim();

  return (
    <div className={styles.queryBar}>
      <div className={styles.controls}>
        {mode === 'nl' ? (
          <input
            type="text"
            className={styles.nlInput}
            maxLength={500}
            value={nlValue}
            onChange={e => setNlValue(e.target.value)}
            placeholder="Describe what you want to search for…"
            aria-label="Natural language search query"
            disabled={translating}
          />
        ) : (
          <div className={styles.monacoWrapper} style={{ flex: 1 }}>
            <Suspense fallback={<div className={styles.monacoFallback}>Loading editor…</div>}>
              <MonacoEditor
                language="json"
                height="120px"
                onChange={handleMonacoChange}
                options={{ minimap: { enabled: false }, scrollBeyondLastLine: false }}
              />
            </Suspense>
          </div>
        )}

        {mode === 'nl' && (
          <button
            type="button"
            className={styles.translateButton}
            onClick={() => void handleTranslate()}
            disabled={isTranslateDisabled}
            aria-label="Translate natural language query to DSL"
          >
            Translate
          </button>
        )}

        <button
          type="button"
          className={styles.modeToggle}
          onClick={handleModeToggle}
          aria-label={mode === 'nl' ? 'Switch to DSL mode' : 'Switch to natural language mode'}
        >
          {mode === 'nl' ? 'DSL' : 'NL'}
        </button>
      </div>

      {error && (
        <div role="alert" className={styles.errorAlert}>
          Translation failed — try rephrasing your query.
        </div>
      )}
    </div>
  );
}
