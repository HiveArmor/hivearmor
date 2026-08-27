/**
 * Investigations list — working evidence sessions (pre-incident).
 * Distinct from /search (ad-hoc hunt) and /incidents (owned response cases).
 */

import { useEffect, useMemo, useState } from 'react';

import { Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  FlaskConical,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { createInvestigation, listInvestigations } from './investigation.service';
import type { InvestigationSession, InvestigationStatus } from './investigation.types';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaButton } from '@/components/ha-button/HaButton';
import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { useDebounce } from '@/hooks/useDebounce';
import { useEpsStream } from '@/hooks/useEpsStream';
import { ROLE_LABELS, ROLES } from '@/lib/roles';
import { useAuthStore } from '@/store/auth.store';

import './InvestigationsPage.css';

/** Bundle-visible job sentence — evidence sessions, not hunt or owned incidents. */
export const INVESTIGATIONS_JOB_SENTENCE =
  'Working investigations — pin evidence, build narrative, and promote to an owned incident when response ownership is required.';

type SessionScope = 'active' | 'mine' | 'converted' | 'closed' | 'all';
const PAGE_SIZE = 25;
const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

const CREATE_DENIED = `Required permission: ${ROLE_LABELS[ROLES.USER]} or higher`;

const STATUS_OPTIONS: Array<{ value: InvestigationStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All states' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'CONVERTED', label: 'Promoted to incident' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const SCOPE_VIEWS: Array<{ id: SessionScope; label: string; icon: JSX.Element }> = [
  { id: 'active', label: 'Active', icon: <CircleDot size={13} /> },
  { id: 'mine', label: 'Mine', icon: <UserRound size={13} /> },
  { id: 'converted', label: 'Promoted', icon: <ShieldAlert size={13} /> },
  { id: 'closed', label: 'Closed', icon: <CheckCircle2 size={13} /> },
  { id: 'all', label: 'All', icon: <Archive size={13} /> },
];

function formatRelative(value: string): string {
  const diffMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
  return `${Math.floor(diffMinutes / 1440)}d ago`;
}

function statusLabel(status: InvestigationStatus): string {
  if (status === 'CONVERTED') return 'Promoted';
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function InvestigationsPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const epsStream = useEpsStream();
  const currentUser = useAuthStore((state) => state.user);
  const hasAnyRole = useAuthStore((state) => state.hasAnyRole);
  const canCreate = hasAnyRole([ROLES.USER, ROLES.ANALYST, ROLES.SOC_MANAGER, ROLES.ADMIN, 'ROLE_SOC_ANALYST']);
  const [view, setView] = useState<SessionScope>('active');
  const [page, setPage] = useState(0);
  const [searchText, setSearchText] = useState('');
  const search = useDebounce(searchText.trim(), 250);
  const [status, setStatus] = useState<InvestigationStatus | 'ALL'>('ACTIVE');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newObjective, setNewObjective] = useState('');

  const params = useMemo(() => ({
    page,
    size: PAGE_SIZE,
    search: search || undefined,
    status:
      view === 'converted'
        ? ('CONVERTED' as const)
        : view === 'closed'
          ? ('CLOSED' as const)
          : view === 'all' || view === 'mine'
            ? status
            : ('ACTIVE' as const),
    ownership: view === 'mine' ? ('mine' as const) : ('all' as const),
  }), [page, search, status, view]);

  const listQuery = useQuery({
    queryKey: ['investigation-sessions', params],
    queryFn: ({ signal }) => listInvestigations(params, signal),
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });

  const createMutation = useMutation({
    mutationFn: () => createInvestigation({
      sessionName: newName.trim(),
      description: newObjective.trim(),
      assignedTo: currentUser?.login,
    }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['investigation-sessions'] });
      setCreateOpen(false);
      setNewName('');
      setNewObjective('');
      navigate(`/investigations/${created.id}`);
    },
  });

  const items = useMemo(() => listQuery.data?.items ?? [], [listQuery.data?.items]);
  const total = listQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selected = items.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    setPage(0);
    setSelectedId(null);
    if (view === 'active') setStatus('ACTIVE');
    if (view === 'converted') setStatus('CONVERTED');
    if (view === 'closed') setStatus('CLOSED');
    if (view === 'all' || view === 'mine') setStatus('ALL');
  }, [view]);

  useEffect(() => {
    setPage(0);
  }, [search, status]);

  return (
    <section className="investigations-page" aria-label="Working investigations">
      {fixtureMode && (
        <div className="investigations-fixture" role="status">
          <strong>Design fixture:</strong> fictional investigation records are enabled for visual review.
          <span>Production never receives these records.</span>
        </div>
      )}

      <header className="investigations-header">
        <div className="investigations-header__identity">
          <span className="investigations-header__icon"><FlaskConical size={18} aria-hidden="true" /></span>
          <div>
            <small>Evidence sessions</small>
            <h1>Investigations</h1>
            <p className="investigations-header__job">{INVESTIGATIONS_JOB_SENTENCE}</p>
          </div>
        </div>
        <div className="investigations-header__actions">
          <span className="investigations-shortcuts"><kbd>J</kbd>/<kbd>K</kbd> navigate <kbd>Enter</kbd> open</span>
          <button
            type="button"
            className="investigations-icon-button"
            onClick={() => void listQuery.refetch()}
            aria-label="Refresh investigations"
            title="Refresh investigations"
          >
            <RefreshCw size={15} />
          </button>
          <button
            type="button"
            className="investigations-primary-button"
            disabled={!canCreate}
            title={canCreate ? 'Start a working investigation' : CREATE_DENIED}
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={15} /> New investigation
          </button>
        </div>
      </header>

      <p className="investigations-meta">
        <Link to="/dashboard">Mission Control</Link>
        <span aria-hidden="true">·</span>
        <Link to="/search">Search &amp; Hunt</Link>
        <span aria-hidden="true">·</span>
        <Link to="/alerts">Alerts</Link>
        <span aria-hidden="true">·</span>
        <Link to="/incidents">Incidents</Link>
        {!canCreate && (
          <>
            <span aria-hidden="true">·</span>
            <span className="investigations-meta__warn" title={CREATE_DENIED}>Create gated — {CREATE_DENIED}</span>
          </>
        )}
      </p>

      <div className="investigations-sticky" aria-label="Investigation filters">
        <nav className="investigations-views" aria-label="Session scopes">
          <strong>Scope</strong>
          {SCOPE_VIEWS.map((item) => (
            <button
              type="button"
              key={item.id}
              data-active={view === item.id || undefined}
              aria-pressed={view === item.id}
              onClick={() => setView(item.id)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <section className="investigations-controls" aria-label="Investigation search and status">
          <label className="investigations-search">
            <Search size={14} aria-hidden="true" />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={
                listQuery.data?.filtering === 'loaded_projection'
                  ? 'Filter loaded page…'
                  : 'Search name, owner, or ID…'
              }
              aria-label="Search investigations"
            />
          </label>
          <HaCompactSelect
            ariaLabel="Investigation status"
            label="STATE"
            options={STATUS_OPTIONS}
            value={status}
            onChange={setStatus}
          />
          <span className="investigations-snapshot">
            Snapshot{' '}
            {listQuery.data
              ? new Date(listQuery.data.snapshotAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : 'pending'}
          </span>
        </section>
      </div>

      {listQuery.data?.filtering === 'loaded_projection' && !fixtureMode && (
        <div className="investigations-partial" role="status">
          Filters apply to the loaded backend page until authoritative server-side investigation search is available.
        </div>
      )}

      <main className="investigations-table-region">
        <div className="investigations-table-heading">
          <strong>Working sessions</strong>
          <span>{items.length} loaded · {total} authorized records</span>
        </div>
        {listQuery.isLoading ? (
          <div className="investigations-loading" aria-busy="true" aria-label="Loading investigations">
            {Array.from({ length: 8 }).map((_, index) => <i key={index} />)}
          </div>
        ) : listQuery.isError ? (
          <ErrorState
            title="Investigations unavailable"
            message="The authorized investigation projection could not be loaded."
            onRetry={() => void listQuery.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FlaskConical size={36} />}
            title="No investigations in this view"
            description="Start a working session to pin evidence from Search & Hunt or Alerts, then promote when response ownership is required."
            action={
              canCreate ? (
                <HaButton variant="primary" onClick={() => setCreateOpen(true)}>New investigation</HaButton>
              ) : undefined
            }
          />
        ) : (
          <div className="investigations-table-scroll">
            <table className="investigations-table">
              <thead>
                <tr>
                  <th scope="col">Investigation</th>
                  <th scope="col">Pinned items</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Updated</th>
                  <th scope="col">State</th>
                  <th scope="col"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <SessionRow
                    key={item.id}
                    item={item}
                    selected={selectedId === item.id}
                    rowIndex={index + 2}
                    onSelect={() => setSelectedId(item.id)}
                    onOpen={() => navigate(`/investigations/${item.id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <footer className="investigations-pagination" aria-label="Investigation pagination">
        <span>{selected ? `Selected INV-${selected.id}` : `${items.length} records in loaded projection`}</span>
        <strong>
          Page {page + 1} <small>of {pageCount}</small>
        </strong>
        <div>
          <button type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
            <ChevronLeft size={14} /> Previous
          </button>
          <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}>
            Next <ChevronRight size={14} />
          </button>
        </div>
      </footer>

      <StatusDock
        sseConnected={epsStream.connected}
        eps={epsStream.eps}
        mode={fixtureMode ? 'historical' : 'live'}
        lastUpdated={listQuery.data ? new Date(listQuery.data.snapshotAt) : undefined}
      />

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        variant="small"
        width="min(520px, calc(100vw - 32px))"
        className="investigation-create-modal"
        aria-labelledby="investigation-create-title"
      >
        <ModalHeader
          labelId="investigation-create-title"
          title="Start investigation"
          description="Define a bounded objective before pinning evidence. Promote later when an owned incident is required."
          titleIconVariant="info"
        />
        <ModalBody>
          <form
            className="investigation-create-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (newName.trim() && newObjective.trim() && canCreate) createMutation.mutate();
            }}
          >
            <label>
              <span>Investigation name</span>
              <input
                autoFocus
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                maxLength={200}
                placeholder="Privileged access from new infrastructure"
              />
            </label>
            <label>
              <span>Objective / narrative seed</span>
              <textarea
                value={newObjective}
                onChange={(event) => setNewObjective(event.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="We suspect… Confirm or refute by reviewing… within…"
              />
            </label>
          </form>
        </ModalBody>
        <ModalFooter>
          <HaButton variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</HaButton>
          <HaButton
            variant="primary"
            isDisabled={!newName.trim() || !newObjective.trim() || createMutation.isPending || !canCreate}
            isLoading={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Start investigation
          </HaButton>
        </ModalFooter>
      </Modal>
    </section>
  );
}

function SessionRow({
  item,
  selected,
  rowIndex,
  onSelect,
  onOpen,
}: {
  item: InvestigationSession;
  selected: boolean;
  rowIndex: number;
  onSelect: () => void;
  onOpen: () => void;
}): JSX.Element {
  return (
    <tr
      data-selected={selected || undefined}
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen();
        if (event.key.toLowerCase() === 'j') {
          (event.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
        }
        if (event.key.toLowerCase() === 'k') {
          (event.currentTarget.previousElementSibling as HTMLElement | null)?.focus();
        }
      }}
      aria-rowindex={rowIndex}
    >
      <td>
        <strong>{item.sessionName}</strong>
        <small>INV-{item.id} · {item.description || 'No objective recorded'}</small>
      </td>
      <td>
        <strong>{item.itemCount}</strong>
        <small>pinned artifacts</small>
      </td>
      <td>
        <strong>{item.assignedTo || 'Unassigned'}</strong>
        <small>{item.createdBy}</small>
      </td>
      <td>
        <time dateTime={item.updatedAt}>{formatRelative(item.updatedAt)}</time>
      </td>
      <td>
        <span className="investigation-status" data-status={item.status.toLowerCase()}>
          {statusLabel(item.status)}
        </span>
        {item.incidentId != null && <small>INC-{item.incidentId}</small>}
      </td>
      <td>
        <button
          type="button"
          className="investigation-open"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          aria-label={`Open ${item.sessionName}`}
        >
          <ArrowRight size={15} />
        </button>
      </td>
    </tr>
  );
}
