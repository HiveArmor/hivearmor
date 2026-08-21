import {
  AlertTriangle,
  ChevronRight,
  Circle,
  Clock3,
  Crosshair,
  Flame,
  Info,
  ShieldAlert,
  Sparkles,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import type { SeverityBoardAlertStatus, SeverityBoardLane } from './severityBoard.types';

import { getSeverityLabel, type SeverityLevel } from '@/lib/severity';

import './SeverityTile.css';

const severityMeta: Record<SeverityLevel, { icon: LucideIcon; description: string }> = {
  critical: { icon: ShieldAlert, description: 'Immediate investigation' },
  high: { icon: Flame, description: 'Rapid analyst review' },
  medium: { icon: AlertTriangle, description: 'Validate and prioritize' },
  low: { icon: Circle, description: 'Monitor and resolve' },
  info: { icon: Info, description: 'Context and hygiene' },
};

function relativeTime(value: string): string {
  const difference = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function statusTone(status: SeverityBoardAlertStatus): string {
  if (status === 'open') return 'open';
  if (status === 'in_review') return 'review';
  if (status === 'true_positive') return 'positive';
  if (status === 'false_positive') return 'false-positive';
  return 'closed';
}

export interface SeverityLaneProps {
  lane: SeverityBoardLane;
  onViewAll: () => void;
}

export function SeverityLane({ lane, onViewAll }: SeverityLaneProps): JSX.Element {
  const meta = severityMeta[lane.severity];
  const Icon = meta.icon;
  const headingId = `severity-lane-${lane.severity}`;

  return (
    <section className="severity-lane" data-severity={lane.severity} aria-labelledby={headingId}>
      <header className="severity-lane__header">
        <span className="severity-lane__icon" aria-hidden="true"><Icon size={16} /></span>
        <div>
          <h2 id={headingId}>{getSeverityLabel(lane.severity)}</h2>
          <p>{meta.description}</p>
        </div>
        <strong aria-label={`${lane.count} ${lane.severity} alerts`}>{lane.count.toLocaleString()}</strong>
      </header>

      <div className="severity-lane__pressure" aria-label={`${lane.severity} workload summary`}>
        <span><strong>{lane.activeCount}</strong> active</span>
        <span data-tone={lane.slaPressure ? 'warning' : undefined}><strong>{lane.slaPressure}</strong> SLA</span>
        <span data-tone={lane.unassigned ? 'unassigned' : undefined}><strong>{lane.unassigned}</strong> unassigned</span>
      </div>

      <div className="severity-lane__alerts">
        {lane.alerts.length ? lane.alerts.map((alert) => (
          <Link key={alert.id} className="severity-board-alert" to={`/alerts/${encodeURIComponent(alert.id)}`} aria-label={`Open ${alert.title}`}>
            <div className="severity-board-alert__meta">
              <code>{alert.id}</code>
              <span title={new Date(alert.detectedAt).toLocaleString()}><Clock3 size={11} aria-hidden="true" />{relativeTime(alert.detectedAt)}</span>
            </div>
            <h3>{alert.title}</h3>
            <div className="severity-board-alert__entity">
              <Crosshair size={12} aria-hidden="true" />
              <span>{alert.primaryEntity?.label ?? 'Entity unavailable'}</span>
              <small>{alert.category ?? alert.primaryEntity?.type ?? 'Uncategorized'}</small>
            </div>
            <div className="severity-board-alert__signals">
              <span className="severity-board-alert__risk" data-risk={alert.riskScore !== null && alert.riskScore >= 90 ? 'critical' : alert.riskScore !== null && alert.riskScore >= 70 ? 'high' : 'normal'}>
                Risk <strong>{alert.riskScore ?? '—'}</strong>
              </span>
              <span className="severity-board-alert__status" data-status={statusTone(alert.status)}>{alert.statusLabel}</span>
              {alert.threatIntelMatched && <span className="severity-board-alert__intel" title="Threat-intelligence match"><Sparkles size={11} aria-hidden="true" />Intel</span>}
            </div>
            <footer>
              <span data-empty={!alert.assigneeName}><UserRound size={12} aria-hidden="true" />{alert.assigneeName ?? 'Unassigned'}</span>
              <span data-sla={alert.slaStatus}>{alert.slaStatus === 'breached' ? 'SLA breached' : alert.slaStatus === 'at_risk' ? 'SLA at risk' : alert.mitreTechniqueId ?? `${alert.relatedAlertCount} related`}</span>
            </footer>
          </Link>
        )) : (
          <div className="severity-lane__empty">
            <Icon size={19} aria-hidden="true" />
            <strong>No {lane.severity} alerts</strong>
            <span>Nothing matches this board scope.</span>
          </div>
        )}
      </div>

      <button type="button" className="severity-lane__view-all" onClick={onViewAll} disabled={lane.count === 0}>
        View lane in queue <ChevronRight size={13} aria-hidden="true" />
      </button>
    </section>
  );
}
