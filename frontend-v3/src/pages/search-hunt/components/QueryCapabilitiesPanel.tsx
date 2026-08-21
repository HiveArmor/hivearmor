/**
 * QueryCapabilitiesPanel — Reference panel for query operators, functions, and examples.
 *
 * Opened by the "Help" button in the query editor. Displays capabilities fetched from
 * the backend: operators, functions, field types, time ranges, limits, and examples.
 */

import { useState } from 'react';

import { BookOpen, Code2, Hash, Play, Timer, X } from 'lucide-react';

import type { QueryCapabilities } from '../searchHunt.types';

export interface QueryCapabilitiesPanelProps {
  capabilities: QueryCapabilities;
  onClose: () => void;
  onInsertExample?: (query: string) => void;
}

type Tab = 'operators' | 'functions' | 'examples';

export function QueryCapabilitiesPanel({
  capabilities,
  onClose,
  onInsertExample,
}: QueryCapabilitiesPanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('operators');

  return (
    <aside className="hunt-capabilities-panel" role="complementary" aria-label="Query language reference">
      <header className="hunt-capabilities-panel__header">
        <div>
          <BookOpen size={14} />
          <strong>Query Reference</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close query reference">
          <X size={15} />
        </button>
      </header>

      <nav className="hunt-capabilities-panel__tabs" role="tablist" aria-label="Reference sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'operators'}
          onClick={() => setActiveTab('operators')}
        >
          <Code2 size={12} />
          Operators
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'functions'}
          onClick={() => setActiveTab('functions')}
        >
          <Hash size={12} />
          Functions
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'examples'}
          onClick={() => setActiveTab('examples')}
        >
          <Play size={12} />
          Examples
        </button>
      </nav>

      <div className="hunt-capabilities-panel__content">
        {activeTab === 'operators' && (
          <div className="hunt-capabilities-panel__section">
            <div className="hunt-capabilities-panel__list">
              {capabilities.operators.map((op) => (
                <div key={op.symbol} className="hunt-capabilities-item">
                  <code className="hunt-capabilities-item__symbol">{op.symbol}</code>
                  <div className="hunt-capabilities-item__detail">
                    <strong>{op.name}</strong>
                    <span>{op.description}</span>
                    <code className="hunt-capabilities-item__example">{op.example}</code>
                  </div>
                </div>
              ))}
            </div>

            {capabilities.fieldTypes.length > 0 && (
              <>
                <h4>Field Types</h4>
                <div className="hunt-capabilities-panel__list">
                  {capabilities.fieldTypes.map((ft) => (
                    <div key={ft.type} className="hunt-capabilities-item">
                      <code className="hunt-capabilities-item__symbol">{ft.type}</code>
                      <div className="hunt-capabilities-item__detail">
                        <span>{ft.description}</span>
                        <small>
                          Operators: {ft.operators.join(', ')}
                          {ft.sortable && ' · Sortable'}
                          {ft.aggregatable && ' · Aggregatable'}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {capabilities.timeRanges.length > 0 && (
              <>
                <h4><Timer size={12} /> Time Ranges</h4>
                <div className="hunt-capabilities-panel__list">
                  {capabilities.timeRanges.map((tr) => (
                    <div key={tr.value} className="hunt-capabilities-item">
                      <code className="hunt-capabilities-item__symbol">{tr.value}</code>
                      <div className="hunt-capabilities-item__detail">
                        <strong>{tr.label}</strong>
                        <span>{tr.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <h4>Limits</h4>
            <div className="hunt-capabilities-panel__limits">
              <span>Max results: <strong>{capabilities.limits.maxResults.toLocaleString()}</strong></span>
              <span>Max time range: <strong>{capabilities.limits.maxTimeRange}</strong></span>
              <span>Max concurrent: <strong>{capabilities.limits.maxConcurrent}</strong></span>
              <span>Query timeout: <strong>{capabilities.limits.queryTimeout}s</strong></span>
            </div>
          </div>
        )}

        {activeTab === 'functions' && (
          <div className="hunt-capabilities-panel__section">
            <div className="hunt-capabilities-panel__list">
              {capabilities.functions.map((fn) => (
                <div key={fn.name} className="hunt-capabilities-item">
                  <code className="hunt-capabilities-item__symbol">{fn.name}</code>
                  <div className="hunt-capabilities-item__detail">
                    <strong>{fn.description}</strong>
                    {fn.parameters.length > 0 && (
                      <span>
                        Params: {fn.parameters.map((p) => `${p.name}: ${p.type}`).join(', ')}
                      </span>
                    )}
                    <span>Returns: {fn.returnType}</span>
                    <code className="hunt-capabilities-item__example">{fn.example}</code>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'examples' && (
          <div className="hunt-capabilities-panel__section">
            <div className="hunt-capabilities-panel__list">
              {capabilities.examples.map((ex) => (
                <div key={ex.title} className="hunt-capabilities-item hunt-capabilities-item--example">
                  <div className="hunt-capabilities-item__detail">
                    <strong>{ex.title}</strong>
                    <span>{ex.description}</span>
                    <code className="hunt-capabilities-item__example">{ex.query}</code>
                    <span className="hunt-capabilities-item__category">{ex.category}</span>
                  </div>
                  {onInsertExample && (
                    <button
                      type="button"
                      className="hunt-capabilities-item__use"
                      onClick={() => onInsertExample(ex.query)}
                      title="Use this query"
                    >
                      <Play size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
