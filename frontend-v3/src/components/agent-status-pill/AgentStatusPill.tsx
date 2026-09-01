import './AgentStatusPill.css';

export type AgentStatus = 'idle' | 'queued' | 'running' | 'stopped' | 'failed';

export interface AgentStatusPillProps {
  status: AgentStatus;
  /** Optional agent name shown before the status, e.g. "Triage". */
  agent?: string;
  size?: 'sm' | 'md';
  className?: string;
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'Idle',
  queued: 'Queued',
  running: 'Running',
  stopped: 'Stopped',
  failed: 'Failed',
};

/**
 * AgentStatusPill — the lifecycle-state treatment for an AI agent (design §5a): Idle / Queued /
 * Running / Stopped / Failed. A colored dot pairs with the text label (never color-alone, WCAG),
 * and the Running state pulses (reduced-motion safe). Status uses STATE tokens (connectivity/
 * lifecycle), NOT severity — an agent being "Running" is not a severity signal.
 *
 * Tokens only.
 */
export function AgentStatusPill({
  status,
  agent,
  size = 'sm',
  className,
}: AgentStatusPillProps): JSX.Element {
  return (
    <span
      className={['ha-agent-status', `ha-agent-status--${size}`, `ha-agent-status--${status}`, className]
        .filter(Boolean)
        .join(' ')}
      aria-label={agent ? `${agent} agent: ${STATUS_LABEL[status]}` : `Agent status: ${STATUS_LABEL[status]}`}
    >
      <span className="ha-agent-status__dot" aria-hidden="true" />
      {agent && <span className="ha-agent-status__agent">{agent}</span>}
      <span className="ha-agent-status__label">{STATUS_LABEL[status]}</span>
    </span>
  );
}
