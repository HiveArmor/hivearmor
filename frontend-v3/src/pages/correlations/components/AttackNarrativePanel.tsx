/**
 * Sprint 44 — Attack Narrative Panel.
 * Renders markdown narrative with vertical stage timeline and MITRE badges.
 */

import type { FindingStage } from '../types/correlation.types';

/**
 * Basic markdown-to-HTML conversion for attack narratives.
 * Handles paragraphs, inline code, bold, and line breaks.
 */
function renderMarkdown(text: string): string {
  return text
    .split('\n\n')
    .map((paragraph) => {
      const html = paragraph
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br/>');
      return `<p>${html}</p>`;
    })
    .join('');
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export interface AttackNarrativePanelProps {
  narrative: string;
  stages: FindingStage[];
  mitreTactics: string[];
}

export function AttackNarrativePanel({
  narrative,
  stages,
  mitreTactics,
}: AttackNarrativePanelProps): JSX.Element {
  return (
    <div className="attack-narrative-panel">
      <section className="attack-narrative-panel__narrative">
        <h3>Attack Narrative</h3>
        <div
          className="attack-narrative-panel__content"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(narrative) }}
        />
      </section>

      <section className="attack-narrative-panel__tactics" aria-label="MITRE ATT&CK tactics">
        <h4>ATT&amp;CK Coverage</h4>
        <div className="attack-narrative-panel__tactic-badges">
          {mitreTactics.map((tactic) => (
            <span key={tactic} className="attack-narrative-panel__tactic-badge">
              {tactic}
            </span>
          ))}
        </div>
      </section>

      <section className="attack-narrative-panel__timeline" aria-label="Attack stages timeline">
        <h3>Stage Progression</h3>
        <ol className="attack-narrative-panel__stages">
          {stages.map((stage, index) => (
            <li
              key={`${stage.order}-${stage.mitreTactic}`}
              className="attack-narrative-panel__stage"
              data-status={stage.status}
            >
              <div className="attack-narrative-panel__stage-marker">
                <span className="attack-narrative-panel__stage-number">{index + 1}</span>
                {index < stages.length - 1 && (
                  <div className="attack-narrative-panel__stage-connector" aria-hidden="true" />
                )}
              </div>
              <div className="attack-narrative-panel__stage-body">
                <header>
                  <strong>{stage.name}</strong>
                  <time>{formatTimestamp(stage.timestamp)}</time>
                </header>
                <p>{stage.description}</p>
                <div className="attack-narrative-panel__stage-badges">
                  <span className="attack-narrative-panel__mitre-badge">
                    {stage.mitreTactic}
                  </span>
                  <span className="attack-narrative-panel__mitre-badge">
                    {stage.mitreTechnique}
                  </span>
                  <small>{stage.signalIds.length} signal{stage.signalIds.length !== 1 ? 's' : ''}</small>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
