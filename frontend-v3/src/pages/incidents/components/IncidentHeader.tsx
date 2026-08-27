/** Persistent owned-case context and high-frequency actions. */

import { useState } from 'react';

import { ArrowLeft, Clock3, Copy, Plus, ShieldAlert, Sparkles, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import type { IncidentDetail } from '../incidentDetail.types';

import { SlaIndicator } from '@/components/sla-indicator/SlaIndicator';
import { ROLE_LABELS, ROLES } from '@/lib/roles';
import { numericToSeverityLevel } from '@/lib/severity';

import './IncidentHeader.css';

const EDIT_DENIED = `Required permission: ${ROLE_LABELS[ROLES.ANALYST]} or higher`;

export interface IncidentHeaderProps {
  incident: IncidentDetail;
  onAddEvidence: () => void;
  onAskAi: () => void;
  canEdit: boolean;
  isRefreshing?: boolean;
}

export function IncidentHeader({
  incident,
  onAddEvidence,
  onAskAi,
  canEdit,
  isRefreshing = false,
}: IncidentHeaderProps): JSX.Element {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const statusLabels: Record<string, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    closed: 'Closed',
  };

  const severity = numericToSeverityLevel(incident.incidentSeverity);
  const updatedAt = incident.incidentLastUpdated
    ? new Date(incident.incidentLastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Unknown';

  const copyId = async () => {
    await navigator.clipboard?.writeText(`INC-${String(incident.id)}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <header className="incident-command-bar" aria-label="Incident context">
      <div className="incident-command-bar__primary">
        <div className="incident-command-bar__identity">
          <div className="incident-command-bar__breadcrumb">
            <button className="incident-command-bar__back" onClick={() => navigate('/incidents')}>
              <ArrowLeft size={13} aria-hidden="true" />
              Incidents
            </button>
            <span aria-hidden="true">/</span>
            <span>Owned case</span>
            <span className="incident-command-bar__related" aria-hidden="true">·</span>
            <Link to="/queue">Queue</Link>
            <Link to="/alerts">Alerts</Link>
            <Link to="/correlated-findings">Findings</Link>
          </div>
          <div className="incident-command-bar__title-row">
            <h1>{incident.incidentName}</h1>
            <button
              className="incident-command-bar__id"
              type="button"
              onClick={() => void copyId()}
              aria-label={`Copy incident ID INC-${String(incident.id)}`}
            >
              <Copy size={11} aria-hidden="true" />
              {copied ? 'Copied' : `INC-${String(incident.id)}`}
            </button>
          </div>
        </div>

        <div className="incident-command-bar__actions">
          <button
            className="incident-command-bar__action"
            type="button"
            onClick={onAskAi}
            data-mobile-grow="true"
          >
            <Sparkles size={15} aria-hidden="true" />
            Hive Intelligence
          </button>
          <button
            className="incident-command-bar__action"
            data-variant="primary"
            data-mobile-grow="true"
            type="button"
            onClick={onAddEvidence}
            disabled={!canEdit}
            title={canEdit ? undefined : EDIT_DENIED}
          >
            <Plus size={15} aria-hidden="true" />
            Add evidence
          </button>
        </div>
      </div>

      <div className="incident-command-bar__context" aria-label="Case status">
        <span className="incident-command-bar__chip" data-severity={severity}>
          <ShieldAlert size={12} aria-hidden="true" />
          {severity.toUpperCase()} · {incident.incidentSeverity}/10
        </span>
        <span className="incident-command-bar__chip">{incident.incidentPriority}</span>
        <span className="incident-command-bar__chip" data-status={incident.incidentStatus}>
          {statusLabels[incident.incidentStatus] ?? incident.incidentStatus}
        </span>
        <span className="incident-command-bar__separator" aria-hidden="true" />
        <span className="incident-command-bar__chip">
          <UserRound size={12} aria-hidden="true" />
          {incident.incidentAssignedTo ?? 'Unassigned'}
        </span>
        {incident.slaDeadline && (
          <span className="incident-command-bar__chip">
            <Clock3 size={12} aria-hidden="true" />
            <SlaIndicator dueAt={incident.slaDeadline} size="sm" showLabel />
          </span>
        )}
        <span
          className="incident-command-bar__freshness"
          data-refreshing={String(isRefreshing)}
          aria-live="polite"
        >
          {isRefreshing ? 'Refreshing case…' : `Updated ${updatedAt}`}
        </span>
      </div>
    </header>
  );
}
