/**
 * Report templates — inventory-first honesty hub (Prompt 35 / Wave C1 slice 5).
 *
 * Production inventory: GET /api/ha-reports?repType=TEMPLATE only.
 * No fake generation success; create/generate remain fail-closed until REP / GAP-BE-09 land.
 */

import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CircleSlash2,
  ClipboardList,
  FileText,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import './ReportingOperations.css';
import type { OperationalReportType, ReportTemplate } from './reportingOperations.types';
import {
  CREATE_TEMPLATE_FAIL_CLOSED_TITLE,
  GENERATE_FROM_TEMPLATE_FAIL_CLOSED_TITLE,
  reportTemplatesService,
} from './reportTemplates.service';

import { StatusDock } from '@/components/status-dock';
import { ROUTES } from '@/constants/routes.constants';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useAuthStore } from '@/store/auth.store';

/** Bundle-visible job sentence — report templates / generation, not dashboard authoring or schedule ops. */
export const REPORT_TEMPLATES_JOB_SENTENCE =
  'Report templates — browse reusable SOC communication definitions for generation. Dashboard authoring stays in Studio; schedule delivery ops live on Scheduled Reports — this surface does not claim governed generation success until REP contracts land.';

const typeLabels: Record<OperationalReportType, string> = {
  SITREP: 'SITREP',
  INCIDENT: 'Incident',
  AFTER_ACTION: 'After-action',
  EXECUTIVE: 'Executive',
  COMPLIANCE: 'Compliance',
};

const formatDate = (value?: string): string =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : 'Never';

export function ReportTemplatesPage(): JSX.Element {
  const eps = useEpsStream();
  const canManage = useAuthStore((state) =>
    state.hasAnyRole(['ROLE_SOC_MANAGER', 'ROLE_ADMIN']),
  );
  const [query, setQuery] = useState('');
  const [facet, setFacet] = useState<'all' | OperationalReportType>('all');
  const [selectedId, setSelectedId] = useState<string>();

  const templatesQuery = useQuery({
    queryKey: ['report-templates'],
    queryFn: ({ signal }) => reportTemplatesService.list(signal),
    enabled: canManage,
    staleTime: 60_000,
  });

  const templates = useMemo(
    () => templatesQuery.data?.items ?? [],
    [templatesQuery.data?.items],
  );

  const hasFilters = facet !== 'all' || Boolean(query.trim());

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return templates.filter(
      (item) =>
        (facet === 'all' || item.type === facet) &&
        (!needle ||
          `${item.name} ${item.description} ${item.owner} ${item.type}`
            .toLocaleLowerCase()
            .includes(needle)),
    );
  }, [facet, query, templates]);

  const selected = filtered.find((item) => item.id === selectedId);

  const published = templates.filter((item) => item.status === 'published').length;
  const drafts = templates.filter((item) => item.status === 'draft').length;
  const managed = templates.filter((item) => item.managed).length;

  const showEmptyHonesty =
    !templatesQuery.isLoading &&
    !templatesQuery.isError &&
    templates.length === 0 &&
    !hasFilters;
  const showFilterEmpty =
    !templatesQuery.isLoading &&
    !templatesQuery.isError &&
    templates.length > 0 &&
    filtered.length === 0;

  const projectionNote = !reportTemplatesService.fixtureMode
    ? templatesQuery.data?.legacyProjection
      ? 'Legacy GET /api/ha-reports?repType=TEMPLATE returns TEMPLATE rows without a dedicated templates contract — bound and tenant scope are not verified. Create/generate and /api/ha-reports/templates CRUD remain unavailable (GAP-BE-09).'
      : 'Inventory via GET /api/ha-reports?repType=TEMPLATE. Governed generation and template builder remain fail-closed until REP contracts land.'
    : null;

  if (!canManage) {
    return (
      <section className="rpt-page" aria-label="Report templates">
        <header className="rpt-header">
          <div className="rpt-header__identity">
            <span className="rpt-header__mark">
              <ClipboardList size={18} aria-hidden="true" />
            </span>
            <div className="rpt-header__copy">
              <div className="rpt-header__eyebrow">
                <span>REPORT TEMPLATES</span>
                <span className="rpt-header__badge">STAGING CANDIDATE</span>
              </div>
              <h1>Report Templates</h1>
              <p className="rpt-header__job">{REPORT_TEMPLATES_JOB_SENTENCE}</p>
            </div>
          </div>
        </header>
        <div className="rpt-empty" role="status">
          <CircleSlash2 size={30} />
          <strong>Report templates access restricted</strong>
          <span>Required permission: SOC Manager or Platform Administrator.</span>
        </div>
      </section>
    );
  }

  return (
    <section
      className="rpt-page"
      aria-label="Report templates"
      data-template-create={reportTemplatesService.fixtureMode ? 'fixture' : 'fail-closed'}
    >
      <header className="rpt-header">
        <div className="rpt-header__identity">
          <span className="rpt-header__mark">
            <ClipboardList size={18} aria-hidden="true" />
          </span>
          <div className="rpt-header__copy">
            <div className="rpt-header__eyebrow">
              <span>REPORT TEMPLATES</span>
              <span className="rpt-header__badge">STAGING CANDIDATE</span>
            </div>
            <h1>Report Templates</h1>
            <p className="rpt-header__job">{REPORT_TEMPLATES_JOB_SENTENCE}</p>
            {projectionNote && (
              <p className="rpt-page__projection-note" role="note">
                {projectionNote}
              </p>
            )}
          </div>
        </div>
        <div className="rpt-header__actions">
          <button
            className="rpt-button"
            type="button"
            disabled
            title={GENERATE_FROM_TEMPLATE_FAIL_CLOSED_TITLE}
            data-testid="templates-generate-fail-closed"
          >
            Generate report
          </button>
          <button
            className="rpt-button rpt-button--primary"
            type="button"
            disabled={!reportTemplatesService.fixtureMode}
            title={
              reportTemplatesService.fixtureMode
                ? 'Fixture-only create — no production template is persisted'
                : CREATE_TEMPLATE_FAIL_CLOSED_TITLE
            }
            data-testid="templates-create-fail-closed"
          >
            <Plus size={14} />
            New template
          </button>
        </div>
      </header>

      <p className="rpt-page__meta">
        <Link to={ROUTES.DASHBOARDS}>Dashboards</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.DASHBOARD_STUDIO}>Studio</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.REPORTS_SCHEDULED}>Scheduled Reports</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.REPORTS_SITREP}>SITREP</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.COMPLIANCE}>Compliance</Link>
        <span aria-hidden="true">·</span>
        <span className="rpt-page__access">SOC Manager · Platform Administrator</span>
      </p>

      {reportTemplatesService.fixtureMode && (
        <div className="rpt-trust">
          <ShieldCheck size={13} />
          <strong>Design fixture:</strong> fictional template definitions are enabled for visual
          review. Production never receives these records.
        </div>
      )}

      {!reportTemplatesService.fixtureMode && (
        <div className="rpt-trust" data-testid="templates-create-fail-closed-banner">
          <ShieldCheck size={13} />
          <strong>Create / generate fail-closed:</strong> Canonical template builder and governed
          generation remain unavailable (GAP-BE-09 / REP). Listing legacy TEMPLATE rows does not
          imply generation success.
        </div>
      )}

      {showEmptyHonesty && (
        <div
          className="templates-empty-honesty"
          role="status"
          data-testid="templates-empty-honesty"
        >
          <strong>No report templates in authorized inventory.</strong>
          <span>
            An empty templates list does not imply reporting is healthy — seed or create definitions
            when the builder contract is available. Scheduled Reports handles delivery schedules;
            Studio authors dashboards, not SOC communications.
          </span>
        </div>
      )}

      <div className="rpt-toolbar" aria-label="Template filters">
        <label className="rpt-search">
          <Search size={13} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates, owner, or type…"
            aria-label="Search report templates"
          />
        </label>
        <select
          className="rpt-select"
          value={facet}
          onChange={(event) => setFacet(event.target.value as typeof facet)}
          aria-label="Template type"
        >
          <option value="all">All types</option>
          {Object.entries(typeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          className="rpt-icon-button"
          type="button"
          aria-label="Refresh template inventory"
          onClick={() => templatesQuery.refetch()}
        >
          <RefreshCw size={13} />
        </button>
        {templates.length > 0 && (
          <span className="rpt-inline-stats" aria-label="Template inventory counts">
            <span>{templates.length} loaded</span>
            <span>{published} published</span>
            <span>{drafts} draft</span>
            <span data-tone={managed ? undefined : 'warning'}>{managed} managed</span>
          </span>
        )}
        <span className="rpt-toolbar__end">
          Snapshot {formatDate(templatesQuery.data?.snapshotAt)} ·{' '}
          {templatesQuery.data?.tenantScoped
            ? 'authorized tenant scope'
            : 'scope not proven'}
        </span>
      </div>

      <main className="rpt-main" data-drawer={Boolean(selected)}>
        <section className="rpt-results rpt-inventory">
          <div className="rpt-results-head">
            <div>
              <strong>Report templates</strong>
              <span>{filtered.length} shown</span>
            </div>
            <span>
              {templatesQuery.data?.bounded
                ? 'Bounded projection'
                : 'Legacy endpoint · bound not reported'}
            </span>
          </div>

          {templatesQuery.isLoading ? (
            <div className="rpt-empty" role="status">
              <FileText size={28} />
              <strong>Loading template inventory</strong>
              <span>Retrieving authorized TEMPLATE rows from /api/ha-reports.</span>
            </div>
          ) : templatesQuery.isError ? (
            <div className="rpt-empty rpt-empty--error" role="alert">
              <AlertTriangle size={28} />
              <strong>Template inventory unavailable</strong>
              <span>
                {templatesQuery.error instanceof Error
                  ? templatesQuery.error.message
                  : 'The template inventory could not be loaded.'}
              </span>
              <button
                className="rpt-button"
                type="button"
                onClick={() => templatesQuery.refetch()}
              >
                Retry
              </button>
            </div>
          ) : showFilterEmpty ? (
            <div className="rpt-empty" role="status">
              <Search size={28} />
              <strong>No templates match these filters</strong>
              <span>Clear search or type filters — inventory itself is not empty.</span>
              <button
                className="rpt-button"
                type="button"
                onClick={() => {
                  setQuery('');
                  setFacet('all');
                }}
              >
                Clear filters
              </button>
            </div>
          ) : filtered.length === 0 ? null : (
            <TemplateTable
              rows={filtered}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(id)}
            />
          )}
        </section>

        {selected && (
          <aside className="rpt-drawer" aria-label="Template context">
            <header className="rpt-drawer__head">
              <div>
                <strong>{selected.name}</strong>
                <small>
                  {typeLabels[selected.type]} · {selected.id}
                </small>
              </div>
              <button
                className="rpt-icon-button"
                type="button"
                aria-label="Close template context"
                onClick={() => setSelectedId(undefined)}
              >
                ×
              </button>
            </header>
            <div className="rpt-drawer__scroll">
              <div className="rpt-drawer__meta">
                <span className="rpt-badge">{selected.type}</span>
                <span className="rpt-badge" data-state={selected.status}>
                  {selected.status}
                </span>
                {selected.managed && <span className="rpt-badge">managed</span>}
              </div>
              <section className="rpt-card">
                <h3>Template definition</h3>
                <p>{selected.description}</p>
                <dl>
                  <div>
                    <dt>Owner</dt>
                    <dd>{selected.owner}</dd>
                  </div>
                  <div>
                    <dt>Version</dt>
                    <dd>v{selected.version}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{formatDate(selected.updatedAt)}</dd>
                  </div>
                  <div>
                    <dt>Redaction</dt>
                    <dd>{selected.redactionProfile}</dd>
                  </div>
                </dl>
              </section>
              <div className="rpt-notice">
                Listing a TEMPLATE row is not generation success. Authoritative builder, approval,
                signed download, and delivery require the canonical reporting backend contract.
              </div>
              <div className="rpt-drawer__actions" style={{ marginTop: 9 }}>
                <button
                  className="rpt-button"
                  type="button"
                  disabled
                  title={GENERATE_FROM_TEMPLATE_FAIL_CLOSED_TITLE}
                >
                  Generate
                </button>
                <button
                  className="rpt-button rpt-button--primary"
                  type="button"
                  disabled
                  title={CREATE_TEMPLATE_FAIL_CLOSED_TITLE}
                >
                  Edit template
                </button>
              </div>
            </div>
          </aside>
        )}
      </main>

      <div className="rpt-status">
        <span>
          <ShieldCheck size={11} />
          No report is distributed without explicit authorization
        </span>
        <strong>
          {reportTemplatesService.fixtureMode
            ? 'Fixture lifecycle · no messages sent'
            : 'Canonical generation contract pending · template list is inventory only'}
        </strong>
        <span>
          {templatesQuery.data?.bounded ? 'Bounded inventory' : 'Legacy compatibility mode'}
        </span>
      </div>
      <StatusDock
        className="rpt-status-dock"
        sseConnected={reportTemplatesService.fixtureMode || eps.connected}
        eps={reportTemplatesService.fixtureMode ? 0 : eps.eps}
        mode="historical"
        lastUpdated={
          templatesQuery.dataUpdatedAt
            ? new Date(templatesQuery.dataUpdatedAt)
            : undefined
        }
      />
    </section>
  );
}

function TemplateTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: ReportTemplate[];
  selectedId?: string;
  onSelect: (id: string) => void;
}): JSX.Element {
  return (
    <div className="rpt-table-wrap">
      <table className="rpt-table">
        <colgroup>
          <col style={{ width: '36%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: 34 }} />
        </colgroup>
        <thead>
          <tr>
            <th>Template</th>
            <th>Type</th>
            <th>Owner</th>
            <th>Updated</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              tabIndex={0}
              data-selected={row.id === selectedId}
              onClick={() => onSelect(row.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(row.id);
                }
              }}
            >
              <td>
                <div className="rpt-cell-title">
                  <FileText size={14} />
                  <div>
                    <strong>{row.name}</strong>
                    <small>
                      {row.managed ? 'Managed · ' : ''}
                      {row.description}
                    </small>
                  </div>
                </div>
              </td>
              <td>{typeLabels[row.type]}</td>
              <td>{row.owner}</td>
              <td className="rpt-mono">{formatDate(row.updatedAt)}</td>
              <td>
                <span className="rpt-badge" data-state={row.status}>
                  {row.status}
                </span>
              </td>
              <td>›</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
