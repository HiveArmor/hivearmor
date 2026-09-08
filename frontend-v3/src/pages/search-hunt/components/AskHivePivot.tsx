import { useState } from 'react';

import { Sparkles } from 'lucide-react';

import type { PivotSuggestResponse } from '../ai/huntAiContract.types';
import { suggestPivotFromNl } from '../ai/huntAiService';
import type { HuntPivotConfig } from '../searchHunt.types';

export interface AskHivePivotProps {
  tenantId: number | null;
  /** Apply an AI-proposed pivot — fills the shelves via the parent's config path; never auto-runs. */
  onApply: (config: HuntPivotConfig) => void;
}

/**
 * Ask Hive Intelligence (P3 PR 3): ask a question in plain language, get a PROPOSED pivot definition to
 * inspect + apply. The AI never runs a query — clicking Apply fills the shelves (same path as templates),
 * then the analyst runs it. Degrades to an "AI not configured" note when no provider is available.
 */
export function AskHivePivot({ tenantId, onApply }: AskHivePivotProps): JSX.Element {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PivotSuggestResponse | null>(null);

  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    try {
      setResult(await suggestPivotFromNl(q));
    } catch {
      setResult({ state: 'unavailable', rowField: null, colField: null, valueFn: 'count', distinctField: null, explanation: null, warnings: [], provenance: null });
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!result || result.state !== 'ready') return;
    onApply({
      v: 1, tenantId,
      rowField: result.rowField, colField: result.colField,
      valueFn: result.valueFn, distinctField: result.distinctField,
      rowBucketInterval: null, colBucketInterval: null, rowMissing: 'omit', colMissing: 'omit',
    });
  };

  return (
    <div className="ask-hive" role="group" aria-label="Ask Hive Intelligence">
      <div className="ask-hive__row">
        <span className="ask-hive__glyph" aria-hidden="true"><Sparkles size={13} /></span>
        <input
          type="text"
          className="ask-hive__input"
          placeholder="Ask a question, e.g. which users touched which hosts…"
          aria-label="Ask Hive Intelligence a pivot question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void ask(); }}
          disabled={loading}
        />
        <button type="button" className="ask-hive__ask" onClick={() => void ask()} disabled={loading || !question.trim()}>
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </div>

      {result && result.state === 'unavailable' && (
        <p className="ask-hive__note" role="note">AI is not configured for this deployment — set an AI provider to use Ask Hive.</p>
      )}

      {result && result.state === 'ready' && (
        <div className="ask-hive__preview" role="note">
          {result.explanation && <p className="ask-hive__explain">{result.explanation}</p>}
          <p className="ask-hive__proposed">
            Proposed: <code>{result.rowField ?? '—'}</code> × <code>{result.colField ?? '—'}</code>
            {' · '}{result.valueFn === 'distinct' ? `distinct ${result.distinctField ?? ''}` : 'count'}
          </p>
          {result.warnings.map((w, i) => <p key={i} className="ask-hive__warn">{w}</p>)}
          <div className="ask-hive__actions">
            <button type="button" className="ask-hive__apply" onClick={apply} disabled={!result.rowField && !result.colField}>
              Apply to shelves
            </button>
            <button type="button" className="ask-hive__dismiss" onClick={() => setResult(null)}>Dismiss</button>
          </div>
          <p className="ask-hive__caveat">{result.provenance?.caveat ?? 'AI-proposed — inspect and edit before running.'}</p>
        </div>
      )}
    </div>
  );
}
