/**
 * AgentStateIndicator — ambient Agentic SOC state microcopy (presentation only).
 */

import './AgentStateIndicator.css';

const STATES = [
  'CORRELATING SIGNALS',
  'BUILDING CONTEXT',
  'REASONING OVER EVIDENCE',
  'RESPONSE READY',
] as const;

export function AgentStateIndicator(): JSX.Element {
  return (
    <div className="agent-state" aria-hidden="true">
      {STATES.map((label, index) => (
        <span
          key={label}
          className={`agent-state__item agent-state__item--${index + 1}`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
