/**
 * DossierIdentityHeader — Sprint 46
 * Entity identity banner showing type, value, display name, criticality,
 * tags, OS/location info, and first/last seen timestamps.
 */

import { Clock3, Link2, MapPin, Monitor, Tag } from 'lucide-react';

import type { EntityIdentity } from '../types/dossier.types';

import { EntityTypeIcon } from '@/components/entity-type-icon';


import './DossierIdentityHeader.css';

export interface DossierIdentityHeaderProps {
  identity: EntityIdentity;
  onLinkIncident: () => void;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export function DossierIdentityHeader({ identity, onLinkIncident }: DossierIdentityHeaderProps): JSX.Element {
  return (
    <header className="ha-identity-header">
      <div className="ha-identity-header__icon">
        <EntityTypeIcon type={identity.type} size={28} />
      </div>

      <div className="ha-identity-header__info">
        <div className="ha-identity-header__title">
          <h1>{identity.displayName || identity.value}</h1>
          <span className="ha-identity-header__type">{identity.type.toUpperCase()}</span>
          <span
            className="ha-identity-header__criticality"
            data-level={identity.criticality}
          >
            {identity.criticality}
          </span>
        </div>

        <code className="ha-identity-header__value">{identity.value}</code>

        <div className="ha-identity-header__meta">
          <span><Clock3 size={12} /> First seen: {formatDateTime(identity.firstSeen)}</span>
          <span><Clock3 size={12} /> Last seen: {formatDateTime(identity.lastSeen)}</span>
          {identity.os && <span><Monitor size={12} /> {identity.os}</span>}
          {identity.location && <span><MapPin size={12} /> {identity.location}</span>}
          {identity.department && <span><Tag size={12} /> {identity.department}</span>}
        </div>

        {identity.tags.length > 0 && (
          <div className="ha-identity-header__tags">
            {identity.tags.map(tag => (
              <span key={tag} className="ha-identity-header__tag">{tag}</span>
            ))}
          </div>
        )}
      </div>

      <div className="ha-identity-header__actions">
        <button
          type="button"
          className="ha-identity-header__link-btn"
          onClick={onLinkIncident}
        >
          <Link2 size={14} />
          Link to Incident
        </button>
      </div>
    </header>
  );
}
