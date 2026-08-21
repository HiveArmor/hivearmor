/**
 * Sprint 44 — Correlated Findings Queue Page.
 * COR-001 consumer: queue table with filters, summary badges, sort, cursor pagination.
 */

import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, GitBranch, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { FindingQueueTable } from './components/FindingQueueTable';
import { useFindingStream } from './hooks/useFindingStream';
import { listFindings, type ListFindingsParams } from './services/correlation.service';
import type { FindingSortOption, FindingStatus, QueueSummary } from './types/correlation.types';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import type { SeverityLevel } from '@/lib/severity';

import './CorrelatedFindingsPage.css';

type SeverityFilter = SeverityLevel | '';
type StatusFilter = FindingStatus | '';
type TacticFilter = string;

function SummaryBadge({ label, count, tone, onClick }: {
  label: string;
  count: number;
  tone?: string;
  onClick?: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="correlations-summary-badge"
      data-tone={tone}
      onClick={onClick}
    >
      <span className="correlations-summary-badge__label">{label}</span>
      <strong className="correlations-summary-badge__count">{count}</strong>
    </button>
  );
}

export function CorrelatedFindingsPage(): JSX.Element {
  const navigate = useNavigate();
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [tacticFilter, setTacticFilter] = useState<TacticFilter>('');
  const [sort, setSort] = useState<FindingSortOption>('severity_desc');
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  useFindingStream();

  const params = useMemo<ListFindingsParams>(() => ({
    view: 'queue',
    sort,
    cursor,
    severity: severityFilter || undefined,
    status: statusFilter || undefined,
    tactics: tacticFilter || undefined,
  }), [sort, cursor, severityFilter, statusFilter, tacticFilter]);

  const findingsQuery = useQuery({
    queryKey: ['correlated-findings', params],
    queryFn: ({ signal }) => listFindings(params, signal),
    staleTime: 20_000,
  });

  const summary: QueueSummary | null = findingsQuery.data?.summary ?? null;

  const handleRowClick = (findingId: string): void => {
    navigate(`/correlated-findings/${encodeURIComponent(findingId)}`);
  };

  const handleNextPage = (): void => {
    if (findingsQuery.data?.cursor) {
      setCursor(findingsQuery.data.cursor);
    }
  };

  const handlePrevPage = (): void => {
    setCursor(undefined);
  };

  const refresh = (): void => {
    setCursor(undefined);
    void findingsQuery.refetch();
  };

  return (
    <div className="correlations-page">
      <header className="correlations-page__header">
        <div className="correlations-page__title">
          <GitBranch size={20} aria-hidden="true" />
          <div>
            <h1>Correlated Findings</h1>
            <p>Multi-stage attack stories discovered by the correlation engine</p>
          </div>
        </div>
        <button
          type="button"
          className="correlations-page__refresh"
          onClick={refresh}
          aria-label="Refresh findings"
        >
          <RefreshCw size={15} />
        </button>
      </header>

      {summary && (
        <section className="correlations-page__summary" aria-label="Queue summary">
          <SummaryBadge
            label="Total"
            count={summary.total}
            onClick={() => { setStatusFilter(''); setSeverityFilter(''); }}
          />
          <SummaryBadge
            label="Critical"
            count={summary.bySeverity.critical}
            tone="critical"
            onClick={() => setSeverityFilter('critical')}
          />
          <SummaryBadge
            label="High"
            count={summary.bySeverity.high}
            tone="high"
            onClick={() => setSeverityFilter('high')}
          />
          <SummaryBadge
            label="New"
            count={summary.byStatus.new}
            onClick={() => setStatusFilter('new')}
          />
          <SummaryBadge
            label="Reviewing"
            count={summary.byStatus.reviewing}
            onClick={() => setStatusFilter('reviewing')}
          />
          <SummaryBadge
            label="Confirmed"
            count={summary.byStatus.confirmed}
            onClick={() => setStatusFilter('confirmed')}
          />
        </section>
      )}

      <div className="correlations-page__toolbar">
        <HaCompactSelect
          ariaLabel="Filter by severity"
          label="Severity"
          value={severityFilter}
          options={[
            { value: '', label: 'All severities' },
            { value: 'critical', label: 'Critical' },
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' },
          ]}
          onChange={(value) => { setSeverityFilter(value as SeverityFilter); setCursor(undefined); }}
        />
        <HaCompactSelect
          ariaLabel="Filter by status"
          label="Status"
          value={statusFilter}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'new', label: 'New' },
            { value: 'reviewing', label: 'Reviewing' },
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'dismissed', label: 'Dismissed' },
          ]}
          onChange={(value) => { setStatusFilter(value as StatusFilter); setCursor(undefined); }}
        />
        <HaCompactSelect
          ariaLabel="Filter by tactic"
          label="Tactic"
          value={tacticFilter}
          options={[
            { value: '', label: 'All tactics' },
            { value: 'TA0001', label: 'Initial Access' },
            { value: 'TA0002', label: 'Execution' },
            { value: 'TA0003', label: 'Persistence' },
            { value: 'TA0004', label: 'Privilege Escalation' },
            { value: 'TA0005', label: 'Defense Evasion' },
            { value: 'TA0006', label: 'Credential Access' },
            { value: 'TA0007', label: 'Discovery' },
            { value: 'TA0008', label: 'Lateral Movement' },
            { value: 'TA0009', label: 'Collection' },
            { value: 'TA0010', label: 'Exfiltration' },
            { value: 'TA0011', label: 'Command & Control' },
            { value: 'TA0040', label: 'Impact' },
          ]}
          onChange={(value) => { setTacticFilter(value); setCursor(undefined); }}
        />
        <div className="correlations-page__spacer" />
        <HaCompactSelect
          ariaLabel="Sort findings"
          label="Sort"
          value={sort}
          options={[
            { value: 'severity_desc', label: 'Severity (highest)' },
            { value: 'created_desc', label: 'Newest first' },
            { value: 'updated_desc', label: 'Recently updated' },
            { value: 'stage_count_desc', label: 'Most stages' },
          ]}
          onChange={(value) => { setSort(value as FindingSortOption); setCursor(undefined); }}
        />
      </div>

      <main className="correlations-page__content">
        {findingsQuery.isLoading && (
          <div className="correlations-page__loading" role="status" aria-label="Loading findings">
            <span>Loading correlated findings…</span>
          </div>
        )}

        {findingsQuery.isError && (
          <section className="correlations-page__error" role="alert">
            <AlertTriangle size={20} />
            <strong>Failed to load findings</strong>
            <p>
              {findingsQuery.error instanceof Error
                ? findingsQuery.error.message
                : 'An error occurred loading the correlated findings queue.'}
            </p>
            <button type="button" onClick={() => void findingsQuery.refetch()}>
              Retry
            </button>
          </section>
        )}

        {findingsQuery.data && (
          <>
            <FindingQueueTable
              items={findingsQuery.data.items}
              onRowClick={handleRowClick}
            />
            <div className="correlations-page__pagination">
              <span>
                Showing {findingsQuery.data.items.length} of {findingsQuery.data.total} findings
              </span>
              <div className="correlations-page__pagination-controls">
                {cursor && (
                  <button type="button" onClick={handlePrevPage}>
                    First page
                  </button>
                )}
                {findingsQuery.data.cursor && (
                  <button type="button" onClick={handleNextPage}>
                    Next page
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
