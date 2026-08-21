/**
 * Sprint 44 — Correlated Finding Detail Page.
 * COR-002 consumer: narrative panel, entity graph, stages timeline, evidence tabs, actions bar.
 */

import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, GitBranch } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { AttackNarrativePanel } from './components/AttackNarrativePanel';
import { EntityGraphPanel } from './components/EntityGraphPanel';
import { FindingActionsBar } from './components/FindingActionsBar';
import { PromotionModal } from './components/PromotionModal';
import { SignalsTab } from './components/SignalsTab';
import { getFinding } from './services/correlation.service';
import type { CorrelatedFinding } from './types/correlation.types';

type DetailTab = 'narrative' | 'graph' | 'signals';

export function CorrelatedFindingDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<DetailTab>('narrative');
  const [showPromotion, setShowPromotion] = useState(false);

  const findingQuery = useQuery({
    queryKey: ['finding', id],
    queryFn: ({ signal }) => getFinding(id ?? '', signal),
    enabled: Boolean(id),
    staleTime: 30_000,
    select: (data) => data.finding,
  });

  const finding: CorrelatedFinding | undefined = findingQuery.data;

  const handleStatusChange = (): void => {
    void findingQuery.refetch();
  };

  return (
    <div className="correlated-finding-detail">
      <header className="correlated-finding-detail__header">
        <Link to="/correlated-findings" className="correlated-finding-detail__back" aria-label="Back to queue">
          <ArrowLeft size={16} />
        </Link>
        <GitBranch size={18} aria-hidden="true" />
        {finding && (
          <div className="correlated-finding-detail__title-block">
            <h1>{finding.title}</h1>
            <div className="correlated-finding-detail__meta">
              <span data-severity={finding.severity}>{finding.severity}</span>
              <span data-status={finding.status}>{finding.status}</span>
              <span>Confidence: {finding.confidence}%</span>
              <span>{finding.signalCount} signals</span>
              <span>{finding.stages.length} stages</span>
            </div>
          </div>
        )}
      </header>

      {findingQuery.isLoading && (
        <div className="correlated-finding-detail__loading" role="status">
          Loading finding detail…
        </div>
      )}

      {findingQuery.isError && (
        <section className="correlated-finding-detail__error" role="alert">
          <AlertTriangle size={20} />
          <strong>Finding unavailable</strong>
          <p>
            {findingQuery.error instanceof Error
              ? findingQuery.error.message
              : 'Could not load the correlated finding.'}
          </p>
          <div>
            <button type="button" onClick={() => void findingQuery.refetch()}>Retry</button>
            <Link to="/correlated-findings">Return to queue</Link>
          </div>
        </section>
      )}

      {finding && (
        <>
          <FindingActionsBar
            finding={finding}
            onStatusChange={handleStatusChange}
            onPromote={() => setShowPromotion(true)}
          />

          <nav className="correlated-finding-detail__tabs" role="tablist" aria-label="Finding views">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'narrative'}
              onClick={() => setActiveTab('narrative')}
            >
              Narrative &amp; Stages
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'graph'}
              onClick={() => setActiveTab('graph')}
            >
              Entity Graph
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'signals'}
              onClick={() => setActiveTab('signals')}
            >
              Signals ({finding.signalCount})
            </button>
          </nav>

          <div className="correlated-finding-detail__body">
            {activeTab === 'narrative' && (
              <AttackNarrativePanel
                narrative={finding.narrative}
                stages={finding.stages}
                mitreTactics={finding.mitreTactics}
              />
            )}
            {activeTab === 'graph' && (
              <EntityGraphPanel graph={finding.relationshipGraph} />
            )}
            {activeTab === 'signals' && (
              <SignalsTab findingId={finding.id} />
            )}
          </div>

          {showPromotion && (
            <PromotionModal
              findingId={finding.id}
              onClose={() => setShowPromotion(false)}
              onSuccess={handleStatusChange}
            />
          )}
        </>
      )}
    </div>
  );
}
