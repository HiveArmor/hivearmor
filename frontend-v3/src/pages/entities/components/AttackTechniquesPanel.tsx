/**
 * AttackTechniquesPanel — Sprint 46
 * Displays MITRE ATT&CK techniques observed for the entity,
 * with tactic badges, alert counts, and a tactic heatmap.
 */

import { Shield } from 'lucide-react';

import type { AttackTechniques } from '../types/dossier.types';

import './AttackTechniquesPanel.css';

export interface AttackTechniquesPanelProps {
  attackTechniques: AttackTechniques;
}

const TACTIC_NAMES: Record<string, string> = {
  TA0001: 'Initial Access',
  TA0002: 'Execution',
  TA0003: 'Persistence',
  TA0004: 'Privilege Escalation',
  TA0005: 'Defense Evasion',
  TA0006: 'Credential Access',
  TA0007: 'Discovery',
  TA0008: 'Lateral Movement',
  TA0009: 'Collection',
  TA0010: 'Exfiltration',
  TA0011: 'Command and Control',
  TA0040: 'Impact',
  TA0042: 'Resource Development',
  TA0043: 'Reconnaissance',
};

function getTacticName(tacticId: string): string {
  return TACTIC_NAMES[tacticId] ?? tacticId;
}

function formatRelativeTime(value: string): string {
  const minutes = Math.floor((Date.now() - Date.parse(value)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return 'Unknown';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function getHeatLevel(count: number): string {
  if (count >= 5) return 'hot';
  if (count >= 3) return 'warm';
  if (count >= 1) return 'mild';
  return 'cold';
}

export function AttackTechniquesPanel({ attackTechniques }: AttackTechniquesPanelProps): JSX.Element {
  const { techniques, tacticsHeatmap } = attackTechniques;
  const sortedTactics = Object.entries(tacticsHeatmap).sort((a, b) => b[1] - a[1]);

  return (
    <section className="ha-techniques-panel">
      <header className="ha-techniques-panel__header">
        <Shield size={14} />
        <h2>ATT&amp;CK Techniques</h2>
        <span className="ha-techniques-panel__count">
          {techniques.length} techniques observed
        </span>
      </header>

      {sortedTactics.length > 0 && (
        <div className="ha-techniques-panel__heatmap">
          {sortedTactics.map(([tacticId, count]) => (
            <div
              key={tacticId}
              className="ha-techniques-panel__tactic-cell"
              data-heat={getHeatLevel(count)}
              title={`${getTacticName(tacticId)}: ${count} alerts`}
            >
              <span className="ha-techniques-panel__tactic-name">{getTacticName(tacticId)}</span>
              <span className="ha-techniques-panel__tactic-count">{count}</span>
            </div>
          ))}
        </div>
      )}

      {techniques.length === 0 ? (
        <p className="ha-techniques-panel__empty">No ATT&amp;CK techniques observed for this entity.</p>
      ) : (
        <ul className="ha-techniques-panel__list">
          {techniques.map(tech => (
            <li key={tech.id} className="ha-techniques-panel__technique">
              <code className="ha-techniques-panel__tech-id">{tech.id}</code>
              <div className="ha-techniques-panel__tech-info">
                <span className="ha-techniques-panel__tech-name">{tech.name}</span>
                <span className="ha-techniques-panel__tech-tactic">{getTacticName(tech.tactic)}</span>
              </div>
              <div className="ha-techniques-panel__tech-meta">
                <span className="ha-techniques-panel__alert-count">{tech.alertCount} alerts</span>
                <span className="ha-techniques-panel__last-seen">{formatRelativeTime(tech.lastSeen)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
