import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, GitBranch, RefreshCw, ShieldAlert, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import {
  correlatedFindingsFixtureMode,
  fetchCorrelatedFindingDetail,
} from './correlatedFindings.service';
import type { CorrelatedFindingDTO } from './correlatedFindings.types';
import { FindingPromotionDialog } from './FindingPromotionDialog';
import { FindingWorkbench } from './FindingWorkbench';

import { StatusDock } from '@/components/status-dock/StatusDock';
import { useAlertStream } from '@/hooks/useAlertStream';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useAlertStreamStore } from '@/store/alertStream.store';

import './CorrelatedFindingDetailPage.css';

const statusLabels: Record<CorrelatedFindingDTO['status'], string> = {
  open: 'Open', investigating: 'Investigating', incident_created: 'Incident created', resolved: 'Resolved', false_positive: 'False positive',
};

export function CorrelatedFindingDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [promotionFinding, setPromotionFinding] = useState<CorrelatedFindingDTO | null>(null);
  useAlertStream();
  const epsStream = useEpsStream();
  const connected = useAlertStreamStore((state) => state.connected);
  const effectiveConnected = correlatedFindingsFixtureMode || connected;
  const findingQuery = useQuery({
    queryKey: ['correlated-findings', id, 'detail'],
    queryFn: ({ signal }) => fetchCorrelatedFindingDetail(id ?? '', signal),
    enabled: Boolean(id),
    staleTime: 30_000,
    retry: correlatedFindingsFixtureMode ? false : 1,
  });
  const finding = findingQuery.data;

  return (
    <div className="correlated-finding-detail-page">
      {correlatedFindingsFixtureMode && (
        <div className="correlated-finding-detail-page__fixture" role="status">
          <span><strong>Design fixture:</strong> this fictional attack story is isolated from production.</span>
          <span>Actions are simulated and audited only in the visual foundation.</span>
        </div>
      )}
      <header className="correlated-finding-detail-header">
        <div className="correlated-finding-detail-header__path">
          <Link to="/correlated-findings" aria-label="Back to Correlated Findings"><ArrowLeft size={16} /></Link>
          <span aria-hidden="true"><GitBranch size={18} /></span>
          <div>
            <small>Correlation investigation</small>
            <strong>{finding?.id ?? id ?? 'Finding unavailable'}</strong>
          </div>
        </div>
        {finding && (
          <div className="correlated-finding-detail-header__context">
            <span data-status={finding.status}><ShieldAlert size={13} />{statusLabels[finding.status]}</span>
            <span data-empty={!finding.owner}><UserRound size={13} />{finding.owner?.name ?? 'Unassigned'}</span>
            <span>{finding.tenantName}</span>
          </div>
        )}
        <div className="correlated-finding-detail-header__actions">
          <Link to="/alerts">Alerts inventory</Link>
          <Link to="/queue">Analyst Queue</Link>
          <Link to="/incidents">Incidents</Link>
          <Link to="/dashboard">Mission Control</Link>
          <button type="button" onClick={() => void findingQuery.refetch()} aria-label="Refresh finding investigation" title="Refresh investigation"><RefreshCw size={15} /></button>
        </div>
      </header>

      <main className="correlated-finding-detail-main">
        {findingQuery.isLoading && (
          <div className="correlated-finding-detail-skeleton">
            <header><span /><span /></header>
            <div><span /><span /><span /><span /><span /></div>
            <nav><span /><span /><span /></nav>
            <section><span /><span /><span /></section>
          </div>
        )}
        {findingQuery.isError && (
          <section className="correlated-finding-detail-error" role="alert">
            <AlertTriangle size={24} />
            <strong>Correlated finding unavailable</strong>
            <p>
              {findingQuery.error instanceof Error ? findingQuery.error.message : 'The finding detail could not be loaded.'}
              {' '}Primary contracts: GET /api/offenses/{'{id}'} and GET /api/offenses/{'{id}'}/alerts.
            </p>
            <div>
              <button type="button" onClick={() => void findingQuery.refetch()}>Retry</button>
              <Link to="/correlated-findings">Return to findings</Link>
            </div>
          </section>
        )}
        {finding && <FindingWorkbench finding={finding} onPromote={() => setPromotionFinding(finding)} />}
      </main>

      <StatusDock
        sseConnected={effectiveConnected && (correlatedFindingsFixtureMode || epsStream.connected)}
        eps={correlatedFindingsFixtureMode ? 12840 : epsStream.eps}
        mode={correlatedFindingsFixtureMode ? 'historical' : 'live'}
      />
      <FindingPromotionDialog finding={promotionFinding} onClose={() => setPromotionFinding(null)} />
    </div>
  );
}
