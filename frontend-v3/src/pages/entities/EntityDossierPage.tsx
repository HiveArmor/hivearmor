/**
 * EntityDossierPage — Sprint 46 (ENT-006 through ENT-010)
 * Main layout page for the entity dossier deep-dive investigation view.
 * Orchestrates data fetching and renders identity header, risk panel,
 * baseline, sources, techniques, and tabbed panels for activity/alerts/relationships.
 */

import { lazy, Suspense, useCallback, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';


import { ActivityTimeline } from './components/ActivityTimeline';
import { AttackTechniquesPanel } from './components/AttackTechniquesPanel';
import { BaselineMetricsPanel } from './components/BaselineMetricsPanel';
import { DossierIdentityHeader } from './components/DossierIdentityHeader';
import { RelatedAlertsPanel } from './components/RelatedAlertsPanel';
import { RiskProfilePanel } from './components/RiskProfilePanel';
import { SourceCoveragePanel } from './components/SourceCoveragePanel';
import { getDossier } from './services/dossier.service';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { StatusDock } from '@/components/status-dock';
import { useEpsStream } from '@/hooks/useEpsStream';
import { ApiError } from '@/lib/apiClient';

import './EntityDossierPage.css';

const RelationshipGraphPanel = lazy(() =>
  import('./components/RelationshipGraphPanel').then(m => ({ default: m.RelationshipGraphPanel })),
);
const IncidentLinkModal = lazy(() =>
  import('./components/IncidentLinkModal').then(m => ({ default: m.IncidentLinkModal })),
);

type DossierTab = 'activity' | 'alerts' | 'relationships';

export function EntityDossierPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: DossierTab = requestedTab === 'alerts' || requestedTab === 'relationships' ? requestedTab : 'activity';
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [window, setWindow] = useState('30d');
  const epsStream = useEpsStream();

  const dossierQuery = useQuery({
    queryKey: ['entity-dossier-full', id, window],
    queryFn: ({ signal }) => {
      if (!id) throw new Error('Entity ID is required');
      return getDossier(id, window, signal);
    },
    enabled: Boolean(id),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const handleBack = useCallback(() => {
    navigate('/entities');
  }, [navigate]);

  const handleLinkIncident = useCallback(() => {
    setLinkModalOpen(true);
  }, []);

  const handleLinkModalClose = useCallback(() => {
    setLinkModalOpen(false);
  }, []);

  const selectTab = useCallback((tab: DossierTab) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('tab', tab);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  if (!id) {
    return (
      <section className="ha-dossier-page">
        <div className="ha-dossier-page__error">
          <AlertTriangle size={24} />
          <h2>No entity selected</h2>
          <p>Navigate to an entity from the inventory to view its dossier.</p>
          <button type="button" onClick={handleBack}>Back to entities</button>
        </div>
      </section>
    );
  }

  if (dossierQuery.isLoading) {
    return (
      <section className="ha-dossier-page" aria-busy="true">
        <div className="ha-dossier-page__skeleton ha-dossier-page__skeleton--header" role="status" aria-label="Loading entity dossier" />
        <div className="ha-dossier-page__skeleton-grid">
          <div className="ha-dossier-page__skeleton" />
          <div className="ha-dossier-page__skeleton" />
          <div className="ha-dossier-page__skeleton" />
          <div className="ha-dossier-page__skeleton" />
        </div>
      </section>
    );
  }

  if (dossierQuery.isError) {
    const is404 = dossierQuery.error instanceof ApiError && dossierQuery.error.status === 404;
    const is403 = dossierQuery.error instanceof ApiError && dossierQuery.error.status === 403;
    return (
      <section className="ha-dossier-page">
        <div className="ha-dossier-page__error">
          <AlertTriangle size={24} />
          <h2>{is404 ? 'Entity not found' : is403 ? 'Access denied' : 'Failed to load dossier'}</h2>
          <p>
            {is404
              ? 'This entity does not exist or has been removed.'
              : is403
                ? 'You do not have permission to view this entity.'
                : 'An error occurred while loading the entity dossier.'}
          </p>
          <button type="button" onClick={handleBack}>Back to entities</button>
          {!is404 && !is403 && (
            <button type="button" onClick={() => void dossierQuery.refetch()}>Retry</button>
          )}
        </div>
      </section>
    );
  }

  const dossier = dossierQuery.data?.dossier;
  if (!dossier) {
    return (
      <section className="ha-dossier-page">
        <div className="ha-dossier-page__error" role="alert"><AlertTriangle size={24} /><h2>Dossier response incomplete</h2><p>The entity exists, but its normalized dossier payload is unavailable.</p><button type="button" onClick={() => void dossierQuery.refetch()}>Retry</button></div>
      </section>
    );
  }

  return (
    <section className="ha-dossier-page">
      <header className="ha-dossier-page__topbar">
        <button
          type="button"
          className="ha-dossier-page__back"
          onClick={handleBack}
          aria-label="Back to entity inventory"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="ha-dossier-page__topbar-title">
          <span>Entity intelligence</span>
          <strong>Investigation dossier</strong>
        </div>
        <div className="ha-dossier-page__topbar-spacer" />
        <HaCompactSelect
          ariaLabel="Select dossier observation window"
          label="Window"
          value={window}
          options={[
            { value: '24h', label: 'Last 24 hours' },
            { value: '7d', label: 'Last 7 days' },
            { value: '30d', label: 'Last 30 days' },
            { value: '90d', label: 'Last 90 days' },
          ]}
          onChange={setWindow}
        />
        <button type="button" className="ha-dossier-page__refresh" onClick={() => void dossierQuery.refetch()} aria-label="Refresh dossier"><RefreshCw size={14} /></button>
      </header>

      <div className="ha-dossier-page__scroll">
        <DossierIdentityHeader identity={dossier.identity} onLinkIncident={handleLinkIncident} />

        <div className="ha-dossier-page__grid">
          <div className="ha-dossier-page__left">
            <RiskProfilePanel riskProfile={dossier.riskProfile} />
            <BaselineMetricsPanel baseline={dossier.baseline} />
          </div>
          <div className="ha-dossier-page__right">
            <SourceCoveragePanel sourceCoverage={dossier.sourceCoverage} />
            <AttackTechniquesPanel attackTechniques={dossier.attackTechniques} />
          </div>
        </div>

        <nav className="ha-dossier-page__tabs" role="tablist" aria-label="Dossier detail panels">
          <button role="tab" aria-selected={activeTab === 'activity'} onClick={() => selectTab('activity')}>Activity</button>
          <button role="tab" aria-selected={activeTab === 'alerts'} onClick={() => selectTab('alerts')}>Related Alerts</button>
          <button role="tab" aria-selected={activeTab === 'relationships'} onClick={() => selectTab('relationships')}>Relationships</button>
        </nav>

        <div className="ha-dossier-page__tab-content" role="tabpanel">
          {activeTab === 'activity' && <ActivityTimeline entityId={id} />}
          {activeTab === 'alerts' && <RelatedAlertsPanel entityId={id} />}
          {activeTab === 'relationships' && (
            <Suspense fallback={<div className="ha-dossier-page__tab-skeleton" role="status" aria-label="Loading relationships" />}>
              <RelationshipGraphPanel entityId={id} />
            </Suspense>
          )}
        </div>
      </div>

      <div className="ha-dossier-page__status"><StatusDock sseConnected={epsStream.connected} eps={epsStream.eps} mode="historical" lastUpdated={dossierQuery.dataUpdatedAt ? new Date(dossierQuery.dataUpdatedAt) : undefined} /></div>

      {linkModalOpen && (
        <Suspense fallback={null}>
          <IncidentLinkModal entityId={id} onClose={handleLinkModalClose} />
        </Suspense>
      )}
    </section>
  );
}
