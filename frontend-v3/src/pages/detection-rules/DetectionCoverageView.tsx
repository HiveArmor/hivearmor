/**
 * DetectionCoverageView — live MITRE ATT&CK coverage heatmap.
 * Production: GET /api/mitre/coverage + GET /api/mitre/rules?techniqueId=
 * Fixture: inventory projection with an honest unused-API banner.
 */

import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, BarChart3, CheckCircle2, ChevronRight, Download,
  Layers3, RefreshCw, Search, ShieldCheck, Target, X,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { DET_014_DISABLED_TITLE } from './detectionRules.capabilities';
import { detectionRulesFixtureMode } from './detectionRules.service';
import { DETECTION_ENGINE_LABELS, type DetectionRule } from './detectionRules.types';
import {
  MITRE_TACTIC_ORDER,
  type MitreHeatmapCell,
  buildMitreHeatmap,
  coverageFromInventoryRules,
  parseTechniqueId,
  tacticHintsFromInventory,
  techniqueNamesFromInventory,
} from './mitreHeatmap';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { ROUTES } from '@/constants/routes.constants';
import { mitreService } from '@/services/mitre.service';
import type { RuleRefDTO } from '@/types/mitre.types';

interface DetectionCoverageViewProps {
  rules: DetectionRule[];
  onOpenRule: (rule: DetectionRule) => void;
}

const MODE_OPTIONS = [
  { value: 'enabled', label: 'Active coverage' },
  { value: 'installed', label: 'All mapped techniques' },
];

function matchesQuery(cell: MitreHeatmapCell, query: string): boolean {
  if (!query) return true;
  const haystack = `${cell.techniqueId} ${cell.techniqueName} ${cell.tactic}`.toLowerCase();
  return haystack.includes(query);
}

function TechniqueRulesPanel({
  cell,
  fixtureMode,
  inventoryRules,
  onClose,
  onOpenRule,
}: {
  cell: MitreHeatmapCell;
  fixtureMode: boolean;
  inventoryRules: DetectionRule[];
  onClose: () => void;
  onOpenRule: (rule: DetectionRule) => void;
}): JSX.Element {
  const rulesQuery = useQuery({
    queryKey: ['mitreRules', cell.techniqueId],
    queryFn: () => mitreService.getRulesByTechnique(cell.techniqueId),
    enabled: !fixtureMode,
    staleTime: 20_000,
  });

  const fixtureRules = useMemo(
    () => inventoryRules.filter((rule) => parseTechniqueId(rule.techniqueId ?? '') === cell.techniqueId),
    [cell.techniqueId, inventoryRules],
  );

  const apiRules: RuleRefDTO[] = rulesQuery.data ?? [];
  const inventoryMatch = fixtureRules[0];

  return (
    <aside className="detection-coverage-detail" aria-label="Technique coverage detail">
      <header>
        <div>
          <small>TECHNIQUE COVERAGE</small>
          <h2>{cell.techniqueId} · {cell.techniqueName}</h2>
          <span>{cell.tactic}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close technique detail"><X size={15} /></button>
      </header>
      <section className="detection-coverage-detail__summary">
        <div>
          <small>ACTIVE RULES</small>
          <strong data-band={cell.band}>{cell.activeCount}</strong>
        </div>
        <div>
          <small>MAPPED RULES</small>
          <strong>{cell.ruleCount}</strong>
        </div>
      </section>
      <section>
        <h3>Coverage honesty</h3>
        <p>
          This cell is a mapping projection from correlation-rule technique tags
          {fixtureMode ? ' in the design fixture inventory' : ' via GET /api/mitre/coverage'}
          . It is not proof of full ATT&amp;CK coverage and not a navigator of every Enterprise technique.
        </p>
      </section>
      <section>
        <h3>Mapped rules</h3>
        {fixtureMode ? (
          <div className="detection-coverage-detail__rules">
            {fixtureRules.length ? fixtureRules.map((rule) => (
              <button key={String(rule.id)} type="button" onClick={() => onOpenRule(rule)}>
                <span data-active={rule.ruleActive}>{rule.ruleActive ? 'Active' : 'Inactive'}</span>
                <div>
                  <strong>{rule.ruleName}</strong>
                  <small>{DETECTION_ENGINE_LABELS[rule.engine ?? 'cel']}{rule.dataTypes.length ? ` · ${rule.dataTypes.join(', ')}` : ''}</small>
                </div>
                <ChevronRight size={14} />
              </button>
            )) : <p>No fixture inventory rules match this technique id.</p>}
          </div>
        ) : rulesQuery.isLoading ? (
          <p role="status">Loading mapped rules from GET /api/mitre/rules…</p>
        ) : rulesQuery.isError ? (
          <p role="alert">Mapped rules could not be loaded. HiveArmor will not invent a rule list.</p>
        ) : apiRules.length ? (
          <ul className="detection-coverage-detail__rules" aria-label={`Rules for ${cell.techniqueId}`}>
            {apiRules.map((rule) => (
              <li key={rule.id}>
                <span data-active={rule.active}>{rule.active ? 'Active' : 'Inactive'}</span>
                <div>
                  <strong>{rule.name}</strong>
                  <small>Correlation rule {rule.id}</small>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>The coverage cell reported mappings, but GET /api/mitre/rules returned an empty list.</p>
        )}
      </section>
      <footer>
        <button type="button" disabled title={DET_014_DISABLED_TITLE}>Find available content</button>
        <button type="button" disabled={!inventoryMatch} onClick={() => inventoryMatch && onOpenRule(inventoryMatch)}>
          Open mapped rule <ChevronRight size={14} />
        </button>
      </footer>
    </aside>
  );
}

export default function DetectionCoverageView({ rules, onOpenRule }: DetectionCoverageViewProps): JSX.Element {
  const [mode, setMode] = useState<'enabled' | 'installed'>('installed');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MitreHeatmapCell | null>(null);
  const [exportFailed, setExportFailed] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const coverageQuery = useQuery({
    queryKey: ['mitreCoverage'],
    queryFn: mitreService.getCoverage,
    enabled: !detectionRulesFixtureMode,
    staleTime: 20_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const heatmap = useMemo(() => {
    if (detectionRulesFixtureMode) {
      return buildMitreHeatmap(coverageFromInventoryRules(rules), {
        tacticHints: tacticHintsFromInventory(rules),
        techniqueNames: techniqueNamesFromInventory(rules),
      });
    }
    return buildMitreHeatmap(coverageQuery.data ?? []);
  }, [coverageQuery.data, rules]);

  const visibleColumns = useMemo(() => heatmap.columns.map((column) => ({
    ...column,
    cells: column.cells.filter((cell) => {
      if (mode === 'enabled' && cell.activeCount === 0) return false;
      return matchesQuery(cell, query.trim().toLowerCase());
    }),
  })), [heatmap.columns, mode, query]);

  const visibleCells = visibleColumns.flatMap((column) => column.cells);
  const showEmptyHonesty = detectionRulesFixtureMode
    ? heatmap.mappedTechniques === 0
    : !coverageQuery.isLoading && !coverageQuery.isError && heatmap.mappedTechniques === 0;
  const errorText = coverageQuery.error instanceof Error
    ? coverageQuery.error.message
    : 'The MITRE coverage source could not be loaded.';
  const forbidden = /403|forbidden|permission/i.test(errorText);
  const liveLoading = !detectionRulesFixtureMode && coverageQuery.isLoading && !coverageQuery.data;
  const liveError = !detectionRulesFixtureMode && coverageQuery.isError && !coverageQuery.data;

  const handleExport = async () => {
    if (detectionRulesFixtureMode || isExporting) return;
    setIsExporting(true);
    setExportFailed(false);
    try {
      const blob = await mitreService.exportCoverage();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'mitre-coverage.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportFailed(true);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className="detection-coverage" aria-label="MITRE ATT&CK detection coverage" data-testid="detection-mitre-heatmap">
      {detectionRulesFixtureMode && (
        <div className="detection-contract-warning" role="status" data-testid="detection-mitre-api-unused">
          <AlertTriangle size={14} />
          <span>
            <strong>Design fixture:</strong> this heatmap is projected from fictional detection inventory.
            Live GET /api/mitre/coverage and GET /api/mitre/rules are unused.
          </span>
        </div>
      )}

      <div className="detection-coverage__controls">
        <label className="detection-search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find tactic or technique…" aria-label="Search ATT&CK coverage" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear coverage search"><X size={13} /></button>}
        </label>
        <HaCompactSelect ariaLabel="Coverage mode" value={mode} onChange={(value) => setMode(value as typeof mode)} options={MODE_OPTIONS} />
        {!detectionRulesFixtureMode && heatmap.mappedTechniques > 0 && (
          <button type="button" className="detection-coverage__export" onClick={() => void handleExport()} disabled={isExporting || coverageQuery.isFetching} aria-label="Export MITRE coverage CSV">
            <Download size={14} /> {isExporting ? 'Exporting…' : 'Export CSV'}
          </button>
        )}
        {!detectionRulesFixtureMode && (
          <button type="button" className="detection-coverage__refresh" onClick={() => void coverageQuery.refetch()} disabled={coverageQuery.isFetching} aria-label="Refresh MITRE coverage">
            <RefreshCw size={14} className={coverageQuery.isFetching ? 'detection-spin' : undefined} />
          </button>
        )}
        <div className="detection-coverage__framework">
          <Target size={14} />
          <span>Enterprise ATT&amp;CK</span>
          <strong>mapped rules</strong>
        </div>
        <Link className="detection-coverage__ueba-link" to={ROUTES.UEBA_RISK} data-testid="coverage-ueba-link">
          UEBA baselines
        </Link>
      </div>

      {exportFailed && (
        <div className="detection-contract-warning" role="note">CSV export failed. HiveArmor will not invent a coverage file.</div>
      )}

      {!liveLoading && (
      <div className="detection-coverage__kpis">
        <article>
          <span><Layers3 size={14} /> Covered tactics</span>
          <strong>{heatmap.coveredTactics}/{MITRE_TACTIC_ORDER.length}</strong>
          <small>at least one active mapped rule</small>
        </article>
        <article data-tone="healthy">
          <span><ShieldCheck size={14} /> Active techniques</span>
          <strong>{heatmap.activeTechniques}</strong>
          <small>techniques with ≥1 active rule</small>
        </article>
        <article data-tone="warning">
          <span><AlertTriangle size={14} /> Inactive mapped</span>
          <strong>{heatmap.inactiveTechniques || '—'}</strong>
          <small>mapped with 0 active rules</small>
        </article>
        <article>
          <span><BarChart3 size={14} /> Mapped techniques</span>
          <strong>{heatmap.mappedTechniques || '—'}</strong>
          <small>from coverage projection — not full ATT&amp;CK</small>
        </article>
      </div>
      )}

      {liveLoading && <div className="detection-section-loading" role="status">Loading MITRE coverage from GET /api/mitre/coverage…</div>}
      {liveError && (
        <div className="detection-contract-warning" role="alert">
          <AlertTriangle size={14} />
          <span>
            {forbidden
              ? 'Detection coverage access denied. Required permission: Analyst, SOC Manager, or Platform Administrator.'
              : errorText}
          </span>
          {!forbidden && <button type="button" onClick={() => void coverageQuery.refetch()}>Retry coverage</button>}
        </div>
      )}

      {showEmptyHonesty && (
        <div className="detection-page__honesty" role="status" data-testid="detection-mitre-empty-honesty">
          <strong>No technique coverage projected.</strong>
          <span>
            No correlation rules currently report a MITRE technique id. This is an empty mapping projection — not proof of full ATT&amp;CK coverage, not a missing API contract, and not an ingest failure.
          </span>
        </div>
      )}

      {!liveLoading && !liveError && (
      <div className="detection-coverage__workspace" data-detail-open={Boolean(selected)}>
        <div className="detection-coverage__matrix-wrap">
          <div className="detection-coverage__matrix-title">
            <div>
              <strong>ATT&amp;CK coverage heatmap</strong>
              <span>Cells are mapped techniques from the coverage API, not an invented full-matrix navigator</span>
            </div>
            <div className="detection-coverage__legend">
              <span data-band="none">0 active</span>
              <span data-band="low">1–2 active</span>
              <span data-band="medium">3–5 active</span>
              <span data-band="high">6+ active</span>
            </div>
          </div>
          <div
            className="detection-coverage__matrix"
            role="region"
            aria-label="Scrollable ATT&CK tactic heatmap"
            tabIndex={0}
            data-unmapped={heatmap.hasUnmapped ? 'true' : 'false'}
          >
            {visibleColumns.map((column) => (
              <section key={column.tactic} className="detection-coverage__tactic">
                <header>
                  <span>{column.tactic}</span>
                  <strong>{column.cells.length}</strong>
                </header>
                <div>
                  {column.cells.length ? column.cells.map((cell) => (
                    <button
                      key={cell.techniqueId}
                      type="button"
                      data-band={cell.band}
                      data-selected={selected?.techniqueId === cell.techniqueId ? 'true' : 'false'}
                      aria-pressed={selected?.techniqueId === cell.techniqueId}
                      aria-label={`${cell.techniqueId} ${cell.techniqueName}, ${cell.activeCount} active of ${cell.ruleCount} mapped`}
                      onClick={() => setSelected(cell)}
                    >
                      <code>{cell.techniqueId}</code>
                      <strong>{cell.techniqueName}</strong>
                      <span>{cell.activeCount}/{cell.ruleCount} active</span>
                    </button>
                  )) : <p>No mapped rules</p>}
                </div>
              </section>
            ))}
          </div>
        </div>

        <aside className="detection-coverage__priorities" aria-label="Coverage priorities">
          <header>
            <div>
              <strong>Inactive mappings</strong>
              <span>Techniques with rules tagged but none active</span>
            </div>
            <AlertTriangle size={15} />
          </header>
          <div>
            {visibleCells.filter((cell) => cell.activeCount === 0).length ? visibleCells.filter((cell) => cell.activeCount === 0).slice(0, 8).map((cell) => (
              <button key={cell.techniqueId} type="button" onClick={() => setSelected(cell)}>
                <span data-band={cell.band}><Target size={13} /></span>
                <div>
                  <code>{cell.techniqueId}</code>
                  <strong>{cell.techniqueName}</strong>
                  <small>{cell.ruleCount} mapped · 0 active</small>
                </div>
                <ChevronRight size={14} />
              </button>
            )) : (
              <div className="detection-coverage__clear">
                <CheckCircle2 size={28} />
                <strong>{heatmap.mappedTechniques === 0 ? 'No mapped techniques' : 'No inactive mappings in this filter'}</strong>
                <span>{heatmap.mappedTechniques === 0 ? 'Tag technique ids on detection rules to project cells.' : 'Filtered techniques currently have at least one active rule.'}</span>
              </div>
            )}
          </div>
        </aside>

        {selected && (
          <TechniqueRulesPanel
            cell={selected}
            fixtureMode={detectionRulesFixtureMode}
            inventoryRules={rules}
            onClose={() => setSelected(null)}
            onOpenRule={onOpenRule}
          />
        )}
      </div>
      )}
    </section>
  );
}
