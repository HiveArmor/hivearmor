/**
 * Dashboard Studio — low-code authoring surface (Prompt 32 / Wave C1 slice 2).
 *
 * Save is fail-closed outside DEV fixtures until DSH versioned contracts land.
 * No publish/share path is offered. Distinct from gallery discover and `/reports/*`.
 */

import { useEffect, useMemo, useState } from 'react';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  CircleGauge,
  Columns3,
  Grip,
  LayoutDashboard,
  ListTree,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Table2,
  Text,
  Trash2,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import './DashboardOperations.css';
import { dashboardOperationsService } from './dashboardOperations.service';
import type { DashboardPanel, DashboardPanelKind, DashboardRecord } from './dashboardOperations.types';

import { StatusDock } from '@/components/status-dock';
import { ROUTES } from '@/constants/routes.constants';
import { useEpsStream } from '@/hooks/useEpsStream';

/** Bundle-visible job sentence — Studio authoring, not gallery discover or report generation. */
export const DASHBOARD_STUDIO_JOB_SENTENCE =
  'Dashboard Studio — author governed panel layouts and draft definitions for operational views. Gallery discover stays on Dashboards; runtime panels open on selection; scheduled reporting and templates live under Reports — Studio does not generate SOC communications.';

const SAVE_FAIL_CLOSED_TITLE =
  'Canonical versioned dashboard save is unavailable until DSH contracts land. Fixture-only save is enabled in local design mode.';

const palette: Array<{ kind: DashboardPanelKind; label: string; description: string }> = [
  { kind: 'metric', label: 'Metric', description: 'Single KPI with trend' },
  { kind: 'line', label: 'Time series', description: 'Bucketed signal trend' },
  { kind: 'bar', label: 'Bar chart', description: 'Ranked categorical values' },
  { kind: 'donut', label: 'Distribution', description: 'Bounded proportion view' },
  { kind: 'table', label: 'Data table', description: 'Dense investigation rows' },
  { kind: 'feed', label: 'Live feed', description: 'Recent ordered signals' },
  { kind: 'text', label: 'Context note', description: 'Analyst guidance' },
];

function kindIcon(kind: DashboardPanelKind): JSX.Element {
  return kind === 'metric' ? (
    <CircleGauge size={15} />
  ) : kind === 'table' ? (
    <Table2 size={15} />
  ) : kind === 'feed' ? (
    <ListTree size={15} />
  ) : kind === 'text' ? (
    <Text size={15} />
  ) : (
    <BarChart3 size={15} />
  );
}

function draftRecord(): DashboardRecord {
  return {
    id: '',
    title: 'Untitled operational dashboard',
    description: 'Describe the operating decision this dashboard supports.',
    owner: 'Current analyst',
    managed: false,
    access: 'private',
    health: 'draft',
    tags: ['Draft'],
    version: 0,
    refreshSeconds: 60,
    defaultTimeRange: 'Last 24 hours',
    tenantScope: 'All authorized tenants',
    variables: [],
    panels: [],
  };
}

export function DashboardStudioPage(): JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const eps = useEpsStream();
  const [dashboard, setDashboard] = useState<DashboardRecord>(draftRecord());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useQuery({
    queryKey: ['dashboard-studio', id],
    queryFn: ({ signal }) => dashboardOperationsService.get(id ?? '', signal),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (load.data) {
      setDashboard(
        load.data.managed
          ? {
              ...load.data,
              id: '',
              title: `${load.data.title} copy`,
              managed: false,
              access: 'private',
              health: 'draft',
              version: 0,
            }
          : load.data,
      );
      setSelectedId(load.data.panels[0]?.id ?? null);
    }
  }, [load.data]);

  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  const selected = dashboard.panels.find((panel) => panel.id === selectedId) ?? null;
  const validation = useMemo(
    () => ({
      name: Boolean(dashboard.title.trim()),
      purpose: dashboard.description.trim().length >= 20,
      panels: dashboard.panels.length > 0,
      sources: dashboard.panels.every((panel) => panel.source !== 'Not configured'),
    }),
    [dashboard],
  );
  const ready = Object.values(validation).every(Boolean);
  const canSaveFixture = dashboardOperationsService.fixtureMode;

  const save = useMutation({
    mutationFn: () =>
      dashboardOperationsService.save({ ...dashboard, health: ready ? 'healthy' : 'draft' }),
    onSuccess: (result) => {
      setDirty(false);
      setDashboard(result.dashboard);
      setMessage('Fixture draft saved. Production remains version-contract gated — no publish path.');
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'Save failed — definition was not persisted.'),
  });

  const update = (patch: Partial<DashboardRecord>): void => {
    setDashboard((current) => ({ ...current, ...patch }));
    setDirty(true);
    setMessage(null);
  };

  const addPanel = (kind: DashboardPanelKind): void => {
    const index = dashboard.panels.length;
    const panel: DashboardPanel = {
      id: `panel-${crypto.randomUUID()}`,
      title: `New ${kind} panel`,
      description: 'Configure the decision this panel supports.',
      kind,
      queryLabel: 'Select a governed data projection',
      source: 'Not configured',
      state: 'contract_unavailable',
      position: {
        x: (index % 2) * 6,
        y: Math.floor(index / 2) * 4,
        w: kind === 'metric' ? 3 : 6,
        h: kind === 'metric' ? 2 : 4,
      },
    };
    update({ panels: [...dashboard.panels, panel] });
    setSelectedId(panel.id);
  };

  const patchPanel = (patch: Partial<DashboardPanel>): void => {
    if (!selected) return;
    update({
      panels: dashboard.panels.map((panel) =>
        panel.id === selected.id ? { ...panel, ...patch } : panel,
      ),
    });
  };

  const remove = (): void => {
    if (!selected) return;
    const panels = dashboard.panels.filter((panel) => panel.id !== selected.id);
    update({ panels });
    setSelectedId(panels[0]?.id ?? null);
  };

  const exitTarget = id ? `/dashboards/${id}` : ROUTES.DASHBOARDS;

  const projectionNote = canSaveFixture
    ? 'Design fixture mode: Save draft writes in-memory fixture state only. No production dashboard is created or published.'
    : 'Canonical versioned save/publish is fail-closed until DSH contracts land. Local structural validation does not imply production readiness.';

  if (load.isLoading) {
    return (
      <section className="dsh-page" aria-label="Dashboard Studio">
        <div className="dsh-state">
          <LayoutDashboard size={28} />
          <strong>Loading dashboard definition</strong>
        </div>
      </section>
    );
  }

  if (load.isError) {
    return (
      <section className="dsh-page" aria-label="Dashboard Studio">
        <div className="dsh-state dsh-state--error">
          <AlertTriangle size={28} />
          <strong>Dashboard definition unavailable</strong>
          <span>
            {load.error instanceof Error ? load.error.message : 'Could not load definition.'}
          </span>
          <p className="dsh-page__meta">
            <Link to={ROUTES.DASHBOARDS}>Dashboards</Link>
            <span aria-hidden="true">·</span>
            <Link to={ROUTES.DASHBOARD_STUDIO}>New draft</Link>
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="dsh-page"
      aria-label="Dashboard Studio"
      data-studio-save={canSaveFixture ? 'fixture' : 'fail-closed'}
    >
      <header className="dsh-header">
        <div className="dsh-header__identity">
          <button
            className="dsh-icon-button"
            type="button"
            onClick={() => navigate(exitTarget)}
            aria-label="Exit Studio"
          >
            <ArrowLeft size={15} />
          </button>
          <span className="dsh-header__mark">
            <Columns3 size={18} aria-hidden="true" />
          </span>
          <div className="dsh-header__copy">
            <div className="dsh-header__eyebrow">
              <span>DASHBOARD STUDIO</span>
              <span className="dsh-header__badge">STAGING CANDIDATE</span>
              <span className="dsh-eyebrow">{dirty ? 'UNSAVED DRAFT' : 'DRAFT'}</span>
            </div>
            <h1>{dashboard.title}</h1>
            <p className="dsh-header__job">{DASHBOARD_STUDIO_JOB_SENTENCE}</p>
            <p className="dsh-page__projection-note" role="note">
              {projectionNote}
            </p>
          </div>
        </div>
        <div className="dsh-header__actions">
          <button
            className="dsh-button"
            type="button"
            onClick={() =>
              setMessage(
                ready
                  ? 'Local structural checks passed. This is not a publish approval.'
                  : 'Resolve readiness items before treating this draft as structurally complete.',
              )
            }
          >
            <CheckCircle2 size={13} />
            Validate
          </button>
          <button
            className="dsh-button"
            type="button"
            disabled={!dashboard.panels.length}
            onClick={() =>
              setMessage('Preview uses the current in-session definition without saving or publishing.')
            }
          >
            <Sparkles size={13} />
            Preview
          </button>
          <button
            className="dsh-button dsh-button--primary"
            type="button"
            disabled={save.isPending || !canSaveFixture}
            title={canSaveFixture ? undefined : SAVE_FAIL_CLOSED_TITLE}
            onClick={() => save.mutate()}
          >
            <Save size={13} />
            {save.isPending ? 'Saving…' : 'Save draft'}
          </button>
        </div>
      </header>

      <p className="dsh-page__meta">
        <Link to={ROUTES.DASHBOARDS}>Dashboards</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.DASHBOARD}>Mission Control</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.REPORTS_SCHEDULED}>Scheduled Reports</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.REPORTS_TEMPLATES}>Templates</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.COMPLIANCE}>Compliance</Link>
        <span aria-hidden="true">·</span>
        <span className="dsh-page__access">Analyst · SOC Manager · Platform Administrator</span>
      </p>

      {canSaveFixture && (
        <div className="dsh-trust">
          <ShieldCheck size={13} />
          <strong>Design fixture:</strong> Studio saves only to in-memory fixture state. No
          production dashboard is created or published.
        </div>
      )}

      {!canSaveFixture && (
        <div className="dsh-trust" data-testid="studio-save-fail-closed">
          <ShieldCheck size={13} />
          <strong>Save fail-closed:</strong> Canonical versioned save and publish remain
          unavailable until DSH contracts land. Draft edits stay in-session only.
        </div>
      )}

      <div className="dsh-toolbar">
        <label className="dsh-search">
          <span className="dsh-eyebrow">NAME</span>
          <input
            value={dashboard.title}
            onChange={(event) => update({ title: event.target.value })}
            aria-label="Dashboard name"
          />
        </label>
        <label className="dsh-search">
          <span className="dsh-eyebrow">PURPOSE</span>
          <input
            value={dashboard.description}
            onChange={(event) => update({ description: event.target.value })}
            aria-label="Dashboard purpose"
          />
        </label>
        <select
          className="dsh-select"
          value={dashboard.defaultTimeRange}
          onChange={(event) => update({ defaultTimeRange: event.target.value })}
          aria-label="Default time range"
        >
          <option>Last 4 hours</option>
          <option>Last 24 hours</option>
          <option>Last 7 days</option>
        </select>
        <select
          className="dsh-select"
          value={dashboard.access}
          onChange={(event) =>
            update({ access: event.target.value as DashboardRecord['access'] })
          }
          aria-label="Access"
        >
          <option value="private">Private draft</option>
          <option value="team">Team</option>
        </select>
      </div>

      <main className="dsh-studio">
        <aside className="dsh-palette">
          <div className="dsh-studio-tools">
            <strong>Panels</strong>
            <span className="dsh-badge">{palette.length} types</span>
          </div>
          <div className="dsh-palette__scroll">
            <div className="dsh-palette__group">
              <span>Visualizations</span>
              {palette.map((item) => (
                <button
                  className="dsh-palette__item"
                  type="button"
                  key={item.kind}
                  onClick={() => addPanel(item.kind)}
                >
                  {kindIcon(item.kind)}
                  <span>
                    {item.label}
                    <small>{item.description}</small>
                  </span>
                  <Plus size={13} />
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="dsh-studio-stage">
          <div className="dsh-studio-tools">
            <strong>12-column canvas</strong>
            <button className="dsh-button" type="button">
              Auto arrange
            </button>
            <button className="dsh-button" type="button">
              Fit
            </button>
            <span>{dashboard.panels.length} panels</span>
          </div>
          <div className="dsh-studio-canvas">
            {dashboard.panels.length === 0 ? (
              <div className="dsh-state">
                <LayoutDashboard size={30} />
                <strong>Build the operational view</strong>
                <span>
                  Add a governed panel from the catalogue. Start with the decision, then select a
                  bounded data projection. Saving remains fail-closed until DSH contracts land.
                </span>
              </div>
            ) : (
              <div className="dsh-canvas-grid">
                {dashboard.panels.map((panel) => (
                  <button
                    key={panel.id}
                    className="dsh-canvas-card"
                    type="button"
                    aria-pressed={panel.id === selectedId}
                    onClick={() => setSelectedId(panel.id)}
                    style={{
                      gridColumn: `${panel.position.x + 1} / span ${panel.position.w}`,
                      gridRow: `${panel.position.y + 1} / span ${panel.position.h}`,
                    }}
                  >
                    <header>
                      <Grip size={12} />
                      {kindIcon(panel.kind)}
                      <strong>{panel.title}</strong>
                    </header>
                    <div>
                      {panel.source} · {panel.kind}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="dsh-inspector">
          <div className="dsh-inspector__head">
            <ShieldCheck size={14} />
            <strong>Inspector</strong>
          </div>
          <div className="dsh-inspector__scroll">
            <div className="dsh-readiness" data-ready={ready}>
              <strong>{ready ? 'Structurally complete (local)' : 'Draft requires attention'}</strong>
              <br />
              {Object.entries(validation)
                .filter(([, value]) => !value)
                .map(([key]) => key)
                .join(' · ') || 'All local validation checks passed — not a publish gate'}
            </div>
            {selected ? (
              <>
                <div className="dsh-field">
                  <label>Panel title</label>
                  <input
                    value={selected.title}
                    onChange={(event) => patchPanel({ title: event.target.value })}
                  />
                </div>
                <div className="dsh-field">
                  <label>Purpose</label>
                  <textarea
                    value={selected.description}
                    onChange={(event) => patchPanel({ description: event.target.value })}
                  />
                </div>
                <div className="dsh-field">
                  <label>Governed source</label>
                  <select
                    value={selected.source}
                    onChange={(event) =>
                      patchPanel({
                        source: event.target.value,
                        state:
                          event.target.value === 'Not configured'
                            ? 'contract_unavailable'
                            : 'ready',
                      })
                    }
                  >
                    <option>Not configured</option>
                    <option>Alerts</option>
                    <option>Incidents</option>
                    <option>Detection rules</option>
                    <option>Pipeline</option>
                  </select>
                </div>
                <div className="dsh-field">
                  <label>Query label</label>
                  <input
                    value={selected.queryLabel}
                    onChange={(event) => patchPanel({ queryLabel: event.target.value })}
                  />
                </div>
                <button className="dsh-button" type="button" onClick={remove}>
                  <Trash2 size={13} />
                  Remove panel
                </button>
              </>
            ) : (
              <div className="dsh-state">
                <CircleGauge size={25} />
                <strong>Select a panel</strong>
                <span>Panel configuration and validation appear here.</span>
              </div>
            )}
          </div>
        </aside>
      </main>

      <div className="dsh-status">
        <span>{message ?? (dirty ? 'Draft has unsaved changes' : 'Definition unchanged')}</span>
        <strong>
          {canSaveFixture ? 'Fixture-only save' : 'Canonical versioned save required — fail-closed'}
        </strong>
        <span>
          {dashboard.panels.length} panels · {ready ? 'structurally complete' : 'draft'}
        </span>
      </div>
      <StatusDock
        className="dsh-status-dock"
        sseConnected={canSaveFixture || eps.connected}
        eps={canSaveFixture ? 12840 : eps.eps}
        mode="historical"
      />
    </section>
  );
}
