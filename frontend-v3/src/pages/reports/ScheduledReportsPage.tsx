/**
 * Scheduled Reports — delivery schedule inventory honesty (Prompt 34 / Wave C1 slice 4).
 *
 * Production inventory: GET /api/ha-reports/scheduled only. Run stamps lastExecutionTime (REP-004).
 * Does not author dashboards or claim artifact generation/distribution from schedule run.
 */

import { useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarClock,
  CircleSlash2,
  Pause,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Stamp,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import './ScheduledReports.css';
import {
  fetchScheduledReports,
  pauseScheduledReport,
  resumeScheduledReport,
  runScheduledReport,
} from './reports.service';
import type { UtmReportDTO } from './reports.types';

import { CronHumanLabel } from '@/components/cron-human-label';
import { HaIconButton } from '@/components/ha-icon-button';
import { StatusDock } from '@/components/status-dock';
import { useToastStore } from '@/components/toast-stack/toastStore';
import { ROUTES } from '@/constants/routes.constants';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useAuthStore } from '@/store/auth.store';

/** Bundle-visible job sentence — scheduled reporting, not gallery/studio/runtime. */
export const SCHEDULED_REPORTS_JOB_SENTENCE =
  'Scheduled reporting — manage delivery schedules and last-execution stamps for authorized report definitions. Dashboard gallery and Studio stay under Dashboards; runtime panels open on selection; template inventory lives on Templates — this workspace does not author dashboards or claim artifact generation from schedule run.';

const formatDate = (value?: string | null): string =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : 'Never';

export function ScheduledReportsPage(): JSX.Element {
  const eps = useEpsStream();
  const queryClient = useQueryClient();
  const addToast = useToastStore((state) => state.addToast);
  const { hasAnyRole, hasRole } = useAuthStore();
  const canView = hasAnyRole(['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']);
  const canAdmin = hasRole('ROLE_ADMIN');

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [pendingId, setPendingId] = useState<number | null>(null);

  const schedulesQuery = useQuery({
    queryKey: ['reports/scheduled'],
    queryFn: fetchScheduledReports,
    enabled: canView,
    staleTime: 45_000,
  });

  const schedules = useMemo(() => schedulesQuery.data ?? [], [schedulesQuery.data]);
  const hasFilters = statusFilter !== 'all' || Boolean(query.trim());

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return schedules.filter((item) => {
      const statusOk =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? item.active : !item.active);
      const textOk =
        !needle ||
        `${item.name} ${item.description ?? ''} ${item.type} ${item.schedule} ${item.format}`
          .toLocaleLowerCase()
          .includes(needle);
      return statusOk && textOk;
    });
  }, [query, schedules, statusFilter]);

  const activeCount = schedules.filter((item) => item.active).length;
  const pausedCount = schedules.length - activeCount;

  const showEmptyHonesty =
    !schedulesQuery.isLoading &&
    !schedulesQuery.isError &&
    schedules.length === 0 &&
    !hasFilters;
  const showFilterEmpty =
    !schedulesQuery.isLoading &&
    !schedulesQuery.isError &&
    schedules.length > 0 &&
    filtered.length === 0;

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['reports/scheduled'] });
  };

  const pauseMutation = useMutation({
    mutationFn: pauseScheduledReport,
    onMutate: (id) => setPendingId(id),
    onSettled: () => setPendingId(null),
    onSuccess: () => {
      invalidate();
      addToast({
        variant: 'success',
        title: 'Schedule paused',
        description: 'Active flag updated. No delivery or generation was triggered.',
      });
    },
    onError: (error) => {
      addToast({
        variant: 'danger',
        title: 'Pause failed',
        description: error instanceof Error ? error.message : 'Could not pause schedule.',
      });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: resumeScheduledReport,
    onMutate: (id) => setPendingId(id),
    onSettled: () => setPendingId(null),
    onSuccess: () => {
      invalidate();
      addToast({
        variant: 'success',
        title: 'Schedule resumed',
        description: 'Active flag updated. Resume does not generate or distribute a report.',
      });
    },
    onError: (error) => {
      addToast({
        variant: 'danger',
        title: 'Resume failed',
        description: error instanceof Error ? error.message : 'Could not resume schedule.',
      });
    },
  });

  const runMutation = useMutation({
    mutationFn: runScheduledReport,
    onMutate: (id) => setPendingId(id),
    onSettled: () => setPendingId(null),
    onSuccess: () => {
      invalidate();
      addToast({
        variant: 'info',
        title: 'Last-execution stamp recorded',
        description:
          'POST …/run updates lastExecutionTime only (REP-004). No artifact was generated or distributed.',
      });
    },
    onError: (error) => {
      addToast({
        variant: 'danger',
        title: 'Stamp failed',
        description:
          error instanceof Error ? error.message : 'Could not record last-execution stamp.',
      });
    },
  });

  const clearFilters = (): void => {
    setQuery('');
    setStatusFilter('all');
  };

  if (!canView) {
    return (
      <section className="sched-page" aria-label="Scheduled reports">
        <header className="sched-header">
          <div className="sched-header__identity">
            <span className="sched-header__mark">
              <CalendarClock size={18} aria-hidden="true" />
            </span>
            <div className="sched-header__copy">
              <div className="sched-header__eyebrow">
                <span>SCHEDULED REPORTS</span>
                <span className="sched-header__badge">STAGING CANDIDATE</span>
              </div>
              <h1>Scheduled Reports</h1>
              <p className="sched-header__job">{SCHEDULED_REPORTS_JOB_SENTENCE}</p>
            </div>
          </div>
        </header>
        <div className="sched-empty" role="status">
          <CircleSlash2 size={30} />
          <strong>Reporting access restricted</strong>
          <span>
            Scheduled Reports requires Analyst or higher. Required permission: Analyst, SOC Manager,
            or Platform Administrator.
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="sched-page" aria-label="Scheduled reports">
      <header className="sched-header">
        <div className="sched-header__identity">
          <span className="sched-header__mark">
            <CalendarClock size={18} aria-hidden="true" />
          </span>
          <div className="sched-header__copy">
            <div className="sched-header__eyebrow">
              <span>SCHEDULED REPORTS</span>
              <span className="sched-header__badge">STAGING CANDIDATE</span>
            </div>
            <h1>Scheduled Reports</h1>
            <p className="sched-header__job">{SCHEDULED_REPORTS_JOB_SENTENCE}</p>
            <p className="sched-page__projection-note" role="note">
              Inventory via GET /api/ha-reports/scheduled (legacy array — bound and tenant scope not
              verified). POST …/run stamps lastExecutionTime only — it does not generate or
              distribute a report artifact.
            </p>
          </div>
        </div>
        <div className="sched-header__actions">
          <HaIconButton
            className="sched-icon-button"
            aria-label="Refresh scheduled reports"
            onClick={() => void schedulesQuery.refetch()}
            icon={<RefreshCw size={13} />}
          />
        </div>
      </header>

      <p className="sched-page__meta">
        <Link to={ROUTES.DASHBOARDS}>Gallery</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.DASHBOARD_STUDIO}>Studio</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.REPORTS_TEMPLATES}>Templates</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.COMPLIANCE}>Compliance</Link>
        <span aria-hidden="true">·</span>
        <span className="sched-page__access">Analyst · SOC Manager · Platform Administrator</span>
      </p>

      {showEmptyHonesty && (
        <div
          className="scheduled-reports-empty-honesty"
          role="status"
          data-testid="scheduled-reports-empty-honesty"
        >
          <strong>No scheduled reports in authorized inventory.</strong>
          <span>
            An empty schedule list does not imply reporting health or successful delivery. Open
            Templates for definition inventory, or Gallery / Studio for dashboards — schedule run
            never claims artifact generation.
          </span>
          <span className="scheduled-reports-empty-honesty__links">
            <Link to={ROUTES.REPORTS_TEMPLATES}>Open Templates</Link>
            <Link to={ROUTES.DASHBOARDS}>Open Gallery</Link>
          </span>
        </div>
      )}

      <div className="sched-toolbar" aria-label="Schedule filters">
        <label className="sched-search">
          <Search size={13} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search schedules, type, or cadence…"
            aria-label="Search scheduled reports"
          />
        </label>
        <select
          className="sched-select"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          aria-label="Schedule status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select>
      </div>

      <main className="sched-inventory">
        <div className="sched-results-head">
          <div>
            <strong>Delivery schedules</strong>{' '}
            <span>
              {filtered.length} of {schedules.length} loaded
            </span>
            {!showEmptyHonesty && schedules.length > 0 && (
              <span className="sched-inline-stats" aria-label="Schedule summary">
                <span>{activeCount} active</span>
                <span>{pausedCount} paused</span>
              </span>
            )}
            {hasFilters && filtered.length > 0 && (
              <button className="sched-button" type="button" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
          <span>Legacy endpoint · bound not reported</span>
        </div>

        {schedulesQuery.isLoading ? (
          <div className="sched-empty" role="status">
            <CalendarClock size={28} />
            <strong>Loading scheduled reports</strong>
            <span>Retrieving the authorized schedule inventory.</span>
          </div>
        ) : schedulesQuery.isError ? (
          <div className="sched-empty sched-empty--error" role="alert">
            <AlertTriangle size={28} />
            <strong>Scheduled reports unavailable</strong>
            <span>
              {schedulesQuery.error instanceof Error
                ? schedulesQuery.error.message
                : 'The schedule inventory could not be loaded.'}
            </span>
            <button
              className="sched-button"
              type="button"
              onClick={() => void schedulesQuery.refetch()}
            >
              Retry
            </button>
          </div>
        ) : showEmptyHonesty ? null : showFilterEmpty ? (
          <div className="sched-empty" role="status">
            <Search size={28} />
            <strong>No schedules match this view</strong>
            <span>Clear filters or broaden status and search criteria.</span>
            <button className="sched-button" type="button" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        ) : (
          <div className="sched-table-wrap">
            <table className="sched-table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Type</th>
                  <th>Cadence</th>
                  <th>Last stamp</th>
                  <th>Next run</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((report) => (
                  <ScheduleRow
                    key={report.id}
                    report={report}
                    canAdmin={canAdmin}
                    busy={pendingId === report.id}
                    onPause={() => pauseMutation.mutate(report.id)}
                    onResume={() => resumeMutation.mutate(report.id)}
                    onStamp={() => runMutation.mutate(report.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <div className="sched-status">
        <span>
          <ShieldCheck size={11} />
          No report is distributed without explicit authorization
        </span>
        <strong>
          Canonical generation contract pending · schedule run stamps last-execution only
        </strong>
        <span>Legacy compatibility mode</span>
      </div>
      <StatusDock
        className="sched-status-dock"
        sseConnected={eps.connected}
        eps={eps.eps}
        mode="historical"
        lastUpdated={
          schedulesQuery.dataUpdatedAt ? new Date(schedulesQuery.dataUpdatedAt) : undefined
        }
      />
    </section>
  );
}

function ScheduleRow({
  report,
  canAdmin,
  busy,
  onPause,
  onResume,
  onStamp,
}: {
  report: UtmReportDTO;
  canAdmin: boolean;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  onStamp: () => void;
}): JSX.Element {
  const adminTitle = canAdmin ? undefined : 'Required permission: Platform Administrator';

  return (
    <tr>
      <td>
        <div className="sched-cell-title">
          <strong>{report.name}</strong>
          <small>
            {report.format}
            {report.recipients.length > 0
              ? ` · ${report.recipients.length} recipient${report.recipients.length === 1 ? '' : 's'}`
              : ' · recipients not listed'}
          </small>
        </div>
      </td>
      <td>{report.type}</td>
      <td>
        <CronHumanLabel cron={report.schedule} />
      </td>
      <td className="sched-mono">{formatDate(report.lastRun)}</td>
      <td className="sched-mono">{formatDate(report.nextRun)}</td>
      <td>
        <span className="sched-badge" data-state={report.active ? 'active' : 'paused'}>
          {report.active ? 'Active' : 'Paused'}
        </span>
      </td>
      <td>
        <div className="sched-row-actions">
          <HaIconButton
            className="sched-icon-button"
            disabled={!canAdmin || busy}
            title={
              canAdmin
                ? 'Stamp last-execution time only — does not generate or distribute'
                : adminTitle
            }
            aria-label={`Stamp last execution for ${report.name}`}
            onClick={onStamp}
            icon={<Stamp size={13} />}
          />
          <HaIconButton
            className="sched-icon-button"
            disabled={!canAdmin || busy}
            title={
              canAdmin
                ? report.active
                  ? 'Pause schedule (active flag only)'
                  : 'Resume schedule (active flag only)'
                : adminTitle
            }
            aria-label={report.active ? `Pause ${report.name}` : `Resume ${report.name}`}
            onClick={report.active ? onPause : onResume}
            icon={report.active ? <Pause size={13} /> : <Play size={13} />}
          />
        </div>
      </td>
    </tr>
  );
}
