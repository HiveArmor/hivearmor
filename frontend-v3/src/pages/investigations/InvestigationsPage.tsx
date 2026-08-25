import { useEffect, useMemo, useState } from 'react';

import { Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  FileSearch,
  Filter,
  FlaskConical,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { createInvestigation, listInvestigations } from './investigation.service';
import type { InvestigationSession, InvestigationStatus } from './investigation.types';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaButton } from '@/components/ha-button/HaButton';
import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { useDebounce } from '@/hooks/useDebounce';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useAuthStore } from '@/store/auth.store';

import './InvestigationsPage.css';

type QueueView = 'active' | 'mine' | 'decision' | 'converted' | 'closed' | 'all';
const PAGE_SIZE = 25;
const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

const STATUS_OPTIONS: Array<{ value: InvestigationStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All lifecycle states' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'CONVERTED', label: 'Promoted to incident' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const VIEW_ITEMS: Array<{ id: QueueView; label: string; icon: JSX.Element }> = [
  { id: 'active', label: 'Active', icon: <CircleDot size={13} /> },
  { id: 'mine', label: 'My investigations', icon: <UserRound size={13} /> },
  { id: 'decision', label: 'Needs decision', icon: <BrainCircuit size={13} /> },
  { id: 'converted', label: 'Promoted', icon: <ShieldAlert size={13} /> },
  { id: 'closed', label: 'Completed', icon: <CheckCircle2 size={13} /> },
  { id: 'all', label: 'All', icon: <Archive size={13} /> },
];

function formatRelative(value: string): string {
  const diffMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
  return `${Math.floor(diffMinutes / 1440)}d ago`;
}

function phaseLabel(session: InvestigationSession): string {
  if (session.phase) return session.phase;
  if (session.status === 'CONVERTED') return 'act';
  if (session.status === 'CLOSED' || session.status === 'ARCHIVED') return 'knowledge';
  return 'prepare';
}

export function InvestigationsPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const epsStream = useEpsStream();
  const currentUser = useAuthStore((state) => state.user);
  const [view, setView] = useState<QueueView>('active');
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
    status: view === 'converted' ? 'CONVERTED' as const : view === 'closed' ? 'CLOSED' as const : view === 'all' || view === 'mine' || view === 'decision' ? status : 'ACTIVE' as const,
    ownership: view === 'mine' ? 'mine' as const : 'all' as const,
  }), [page, search, status, view]);

  const listQuery = useQuery({
    queryKey: ['investigation-sessions', params],
    queryFn: ({ signal }) => listInvestigations(params, signal),
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });

  const createMutation = useMutation({
    mutationFn: () => createInvestigation({ sessionName: newName.trim(), description: newObjective.trim(), assignedTo: currentUser?.login }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['investigation-sessions'] });
      setCreateOpen(false);
      setNewName('');
      setNewObjective('');
      navigate(`/investigations/${created.id}`);
    },
  });

  const loadedItems = useMemo(() => listQuery.data?.items ?? [], [listQuery.data?.items]);
  const items = view === 'decision'
    ? loadedItems.filter((item) => (item.openHypothesisCount ?? 0) > 0 || (!item.phase && item.status === 'ACTIVE'))
    : loadedItems;
  const total = listQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selected = items.find((item) => item.id === selectedId) ?? null;

  const metrics = useMemo(() => ({
    active: loadedItems.filter((item) => item.status === 'ACTIVE').length,
    decision: loadedItems.filter((item) => (item.openHypothesisCount ?? 0) > 0).length,
    promoted: loadedItems.filter((item) => item.status === 'CONVERTED').length,
    artifacts: loadedItems.reduce((sum, item) => sum + item.itemCount, 0),
    stale: loadedItems.filter((item) => item.freshness === 'stale' || item.freshness === 'partial').length,
  }), [loadedItems]);

  useEffect(() => {
    setPage(0);
    setSelectedId(null);
    if (view === 'active') setStatus('ACTIVE');
    if (view === 'converted') setStatus('CONVERTED');
    if (view === 'closed') setStatus('CLOSED');
    if (view === 'all' || view === 'mine' || view === 'decision') setStatus('ALL');
  }, [view]);

  useEffect(() => { setPage(0); }, [search, status]);

  return (
    <section className="investigations-page" aria-label="Investigation operations">
      <header className="investigations-header">
        <div className="investigations-header__identity">
          <span className="investigations-header__icon"><FlaskConical size={20} aria-hidden="true" /></span>
          <div><small>INVESTIGATION OPERATIONS</small><h1>Investigation Sessions</h1></div>
        </div>
        <div className="investigations-header__actions">
          <span className="investigations-shortcuts"><kbd>J</kbd>/<kbd>K</kbd> navigate <kbd>Enter</kbd> open</span>
          <button type="button" className="investigations-icon-button" onClick={() => void listQuery.refetch()} aria-label="Refresh investigations"><RefreshCw size={15} /></button>
          <button type="button" className="investigations-primary-button" onClick={() => setCreateOpen(true)}><Plus size={15} /> New investigation</button>
        </div>
      </header>

      {fixtureMode && <div className="investigations-fixture"><strong>Design fixture:</strong> fictional investigation records are enabled for visual review.<span>Production never receives these records.</span></div>}

      <section className="investigations-metrics" aria-label="Loaded investigation metrics">
        <div><span><CircleDot size={13} /> Active in view</span><strong>{metrics.active}</strong><small>loaded projection</small></div>
        <div><span><BrainCircuit size={13} /> Needs decision</span><strong>{metrics.decision}</strong><small>open hypotheses</small></div>
        <div><span><ShieldAlert size={13} /> Promoted</span><strong>{metrics.promoted}</strong><small>incident created</small></div>
        <div><span><FileSearch size={13} /> Pinned artifacts</span><strong>{metrics.artifacts}</strong><small>loaded sessions</small></div>
        <div><span><Clock3 size={13} /> Source attention</span><strong>{metrics.stale}</strong><small>partial or stale</small></div>
      </section>

      <nav className="investigations-views" aria-label="Investigation queue views">
        {VIEW_ITEMS.map((item) => <button type="button" key={item.id} data-active={view === item.id} onClick={() => setView(item.id)}>{item.icon}{item.label}</button>)}
      </nav>

      <section className="investigations-controls" aria-label="Investigation filters">
        <label className="investigations-search"><Search size={14} aria-hidden="true" /><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder={listQuery.data?.filtering === 'loaded_projection' ? 'Filter loaded investigation page…' : 'Search investigation, owner, or ID…'} aria-label="Search investigations" /></label>
        <Filter size={14} aria-hidden="true" />
        <HaCompactSelect ariaLabel="Investigation status" label="STATE" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        <span className="investigations-snapshot">Snapshot {listQuery.data ? new Date(listQuery.data.snapshotAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'pending'}</span>
      </section>

      {listQuery.data?.filtering === 'loaded_projection' && !fixtureMode && (
        <div className="investigations-partial" role="status">Filters apply to the loaded backend page until authoritative server-side investigation search is available.</div>
      )}

      <main className="investigations-table-region">
        <div className="investigations-table-heading"><strong>Investigations</strong><span>{items.length} loaded · {total} authorized records</span></div>
        {listQuery.isLoading ? (
          <div className="investigations-loading" aria-busy="true" aria-label="Loading investigations">{Array.from({ length: 8 }).map((_, index) => <i key={index} />)}</div>
        ) : listQuery.isError ? (
          <ErrorState title="Investigation queue unavailable" message="The authorized investigation projection could not be loaded." onRetry={() => void listQuery.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={<FlaskConical size={36} />} title="No investigations in this view" description="Adjust the loaded-page filters or start a bounded hypothesis-driven investigation." action={<HaButton variant="primary" onClick={() => setCreateOpen(true)}>New investigation</HaButton>} />
        ) : (
          <div className="investigations-table-scroll">
            <table className="investigations-table">
              <thead><tr><th scope="col">Investigation</th><th scope="col">Phase</th><th scope="col">Hypotheses</th><th scope="col">Scope</th><th scope="col">Owner</th><th scope="col">Updated</th><th scope="col">State</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
              <tbody>{items.map((item, index) => (
                <tr key={item.id} data-selected={selectedId === item.id} tabIndex={0} onClick={() => setSelectedId(item.id)} onDoubleClick={() => navigate(`/investigations/${item.id}`)} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/investigations/${item.id}`); if (event.key.toLowerCase() === 'j') (event.currentTarget.nextElementSibling as HTMLElement | null)?.focus(); if (event.key.toLowerCase() === 'k') (event.currentTarget.previousElementSibling as HTMLElement | null)?.focus(); }} aria-rowindex={index + 2}>
                  <td><strong>{item.sessionName}</strong><small>INV-{item.id} · {item.description || 'No objective recorded'}</small></td>
                  <td><span className="investigation-phase" data-phase={phaseLabel(item)}>{phaseLabel(item)}</span></td>
                  <td><strong>{item.openHypothesisCount ?? '—'} open</strong><small>{item.hypothesisCount ?? 'not projected'} total</small></td>
                  <td><strong>{item.entityCount ?? '—'} entities</strong><small>{item.eventCount ?? item.itemCount} events/artifacts</small></td>
                  <td><strong>{item.assignedTo || 'Unassigned'}</strong><small>{item.createdBy}</small></td>
                  <td><time dateTime={item.updatedAt}>{formatRelative(item.updatedAt)}</time><small>{item.freshness ?? 'snapshot'}</small></td>
                  <td><span className="investigation-status" data-status={item.status.toLowerCase()}>{item.status.toLowerCase().replace('_', ' ')}</span>{item.incidentId && <small>INC-{item.incidentId}</small>}</td>
                  <td><button type="button" className="investigation-open" onClick={(event) => { event.stopPropagation(); navigate(`/investigations/${item.id}`); }} aria-label={`Open ${item.sessionName}`}><ArrowRight size={15} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </main>

      <footer className="investigations-pagination" aria-label="Investigation pagination">
        <span>{selected ? `Selected INV-${selected.id}` : `${items.length} records in loaded projection`}</span>
        <strong>Page {page + 1} <small>of {pageCount}</small></strong>
        <div><button type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft size={14} /> Previous</button><button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight size={14} /></button></div>
      </footer>

      <StatusDock sseConnected={epsStream.connected} eps={epsStream.eps} mode={fixtureMode ? 'historical' : 'live'} lastUpdated={listQuery.data ? new Date(listQuery.data.snapshotAt) : undefined} />

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} variant="small" width="min(520px, calc(100vw - 32px))" className="investigation-create-modal" aria-labelledby="investigation-create-title">
        <ModalHeader labelId="investigation-create-title" title="Start investigation" description="Define a specific, testable and bounded objective before collecting artifacts." titleIconVariant="info" />
        <ModalBody>
          <form className="investigation-create-form" onSubmit={(event) => { event.preventDefault(); if (newName.trim() && newObjective.trim()) createMutation.mutate(); }}>
            <label><span>Investigation name</span><input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={200} placeholder="Privileged access from new infrastructure" /></label>
            <label><span>Hypothesis and objective</span><textarea value={newObjective} onChange={(event) => setNewObjective(event.target.value)} maxLength={2000} rows={4} placeholder="We suspect… Confirm or refute by reviewing… within…" /></label>
            <div className="investigation-create-guidance"><BrainCircuit size={15} /><span><strong>Good starting point</strong> Name the technique, expected artifact, data source, and time boundary.</span></div>
          </form>
        </ModalBody>
        <ModalFooter><HaButton variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</HaButton><HaButton variant="primary" isDisabled={!newName.trim() || !newObjective.trim() || createMutation.isPending} isLoading={createMutation.isPending} onClick={() => createMutation.mutate()}>Start investigation</HaButton></ModalFooter>
      </Modal>
    </section>
  );
}
