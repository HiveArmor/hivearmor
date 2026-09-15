/**
 * AgentCommandsTab — per-agent command history (SPEC-07 W6 6.1).
 *
 * Renders the secret-scrubbed command history for one agent, filtered client-side
 * (the agent-commands API has no server-side agent filter). Status is shown
 * honestly with a badge per real state (Pending / Running / Completed / Failed /
 * Unknown) — never a fabricated "done". Polls on an interval so async status
 * advances without a manual refresh (Defender Action Center pattern).
 *
 * Reuse only: HaCard, shared Loading/Empty/Error states, foundation.css tokens.
 * No raw hex, no `any`, no invented fields.
 */

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleDashed, Loader2, Terminal, XCircle, HelpCircle } from 'lucide-react';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state';
import { HaCard } from '@/components/ha-card/HaCard';
import { LoadingState } from '@/components/loading-state/LoadingState';
import { formatBoundedRelativeTime } from '@/lib/threatIntelFreshness';
import {
  PER_AGENT_COMMANDS_CAPABILITY,
  fetchAgentCommands,
  type CommandStatus,
} from '@/services/agentDetail.service';

import './AgentCommandsTab.css';

const STATUS_META: Record<CommandStatus, { label: string; icon: JSX.Element; className: string }> = {
  PENDING: { label: 'Pending', icon: <CircleDashed size={13} aria-hidden="true" />, className: 'agent-commands__status--pending' },
  RUNNING: { label: 'Running', icon: <Loader2 size={13} aria-hidden="true" className="agent-commands__spin" />, className: 'agent-commands__status--running' },
  COMPLETED: { label: 'Completed', icon: <CheckCircle2 size={13} aria-hidden="true" />, className: 'agent-commands__status--completed' },
  FAILED: { label: 'Failed', icon: <XCircle size={13} aria-hidden="true" />, className: 'agent-commands__status--failed' },
  UNKNOWN: { label: 'Unknown', icon: <HelpCircle size={13} aria-hidden="true" />, className: 'agent-commands__status--unknown' },
};

function CommandStatusBadge({ status }: { status: CommandStatus }): JSX.Element {
  const meta = STATUS_META[status];
  return (
    <span className={`agent-commands__status ${meta.className}`}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

export interface AgentCommandsTabProps {
  agentId: string;
  /** The capability note is rendered by the parent; kept here for the empty state copy. */
  capabilityNote?: string;
}

export function AgentCommandsTab({ agentId }: AgentCommandsTabProps): JSX.Element {
  const query = useQuery({
    queryKey: ['agent-commands', agentId],
    queryFn: ({ signal }) => fetchAgentCommands(agentId, signal),
    enabled: agentId !== '',
    retry: 1,
    // Poll so Pending/Running rows advance without a manual refresh (no status stream).
    refetchInterval: 20_000,
  });

  if (query.isLoading) {
    return <LoadingState message="Loading command history…" rows={5} />;
  }

  if (query.isError) {
    return (
      <ErrorState
        title="Could not load command history"
        message="HiveArmor could not retrieve command history for this endpoint. A concrete tenant scope is required. Nothing has been changed."
        onRetry={() => void query.refetch()}
      />
    );
  }

  const rows = query.data ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Terminal size={38} />}
        title="No commands issued to this endpoint"
        description={PER_AGENT_COMMANDS_CAPABILITY.note}
      />
    );
  }

  return (
    <HaCard as="section" className="agent-commands__card">
      <HaCard.Header>
        <span className="agent-commands__card-title">
          <Terminal size={15} aria-hidden="true" /> Command history
        </span>
        <span className="agent-commands__count">{rows.length} command{rows.length === 1 ? '' : 's'}</span>
      </HaCard.Header>
      <HaCard.Body className="agent-commands__body">
        <table className="agent-commands__table">
          <thead>
            <tr>
              <th scope="col">Command</th>
              <th scope="col">Status</th>
              <th scope="col">Issued by</th>
              <th scope="col">Issued</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.cmdId || `${row.command}-${row.issuedAt}`}>
                <td>
                  <span className="agent-commands__cmd">{row.command || '—'}</span>
                  {row.reason && <span className="agent-commands__reason">{row.reason}</span>}
                </td>
                <td><CommandStatusBadge status={row.status} /></td>
                <td>{row.issuedBy ?? 'system'}</td>
                <td title={row.issuedAt ?? ''}>
                  {row.issuedAt ? formatBoundedRelativeTime(row.issuedAt) : '—'}
                </td>
                <td>
                  <span className="agent-commands__result" title={row.result ?? ''}>
                    {row.result ?? (row.status === 'PENDING' || row.status === 'RUNNING' ? 'Awaiting result…' : '—')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </HaCard.Body>
    </HaCard>
  );
}
