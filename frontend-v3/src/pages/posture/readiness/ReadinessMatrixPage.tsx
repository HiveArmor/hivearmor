/**
 * ReadinessMatrixPage — Detection Coverage hub (Prompt 29 / Wave B2).
 *
 * Route stays /posture/readiness (nav: Detection Coverage).
 * Production: GET /api/mitre/coverage + /rules + /coverage/export.
 * Empty HTTP 200 is not a missing contract and not an API error.
 */

import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Crosshair,
  Download,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { StatusDock } from '@/components/status-dock';
import { ROUTES } from '@/constants/routes.constants';
import { useEpsStream } from '@/hooks/useEpsStream';
import { mitreService } from '@/services/mitre.service';
import type { TechniqueCoverageDTO } from '@/types/mitre.types';

import './ReadinessMatrixPage.css';

/** Bundle-visible job sentence — MITRE detection coverage, not CIS SCA or framework assurance. */
export const POSTURE_DETECTION_COVERAGE_JOB_SENTENCE =
  'Detection coverage — review MITRE ATT&CK techniques mapped from correlation rules, active rule counts, and coverage gaps across authorized detections. Rule editing lives on Detection Rules; CIS host checks live on CIS Benchmark; framework assurance lives on Compliance.';

function coverageBand(activeCount: number): 'none' | 'low' | 'medium' | 'high' {
  if (activeCount === 0) return 'none';
  if (activeCount <= 2) return 'low';
  if (activeCount <= 5) return 'medium';
  return 'high';
}

function TechniqueRulesDrawer({
  technique,
  onClose,
}: {
  technique: TechniqueCoverageDTO;
  onClose: () => void;
}): JSX.Element {
  const rulesQuery = useQuery({
    queryKey: ['mitreRules', technique.technique],
    queryFn: () => mitreService.getRulesByTechnique(technique.technique),
    staleTime: 20_000,
  });

  const rules = rulesQuery.data ?? [];
  const rulesErrorText =
    rulesQuery.error instanceof Error
      ? rulesQuery.error.message
      : 'The rule projection for this technique could not be loaded.';

  return (
    <HaDrawer
      isOpen
      onClose={onClose}
      title={technique.technique}
      subtitle={`${technique.activeCount} active · ${technique.ruleCount} total mapped rules`}
      width={480}
    >
      <div className="rdn-drawer">
        <section className="rdn-drawer__card">
          <header>
            <Crosshair size={15} aria-hidden="true" />
            <div>
              <strong>Technique coverage</strong>
              <span>Correlation rules that report this MITRE technique id</span>
            </div>
          </header>
          <p className="rdn-drawer__hint">
            Coverage is a mapping projection from authorized detections — not proof that every ATT&amp;CK
            technique is monitored in production.
          </p>
        </section>

        {rulesQuery.isLoading && (
          <div className="rdn-drawer__state" role="status">
            <Loader2 size={22} className="rdn-spin" aria-hidden="true" />
            <span>Loading mapped rules…</span>
          </div>
        )}

        {rulesQuery.isError && (
          <div className="rdn-drawer__state" role="alert">
            <AlertTriangle size={22} aria-hidden="true" />
            <strong>Rule projection unavailable</strong>
            <span>{rulesErrorText}</span>
          </div>
        )}

        {!rulesQuery.isLoading && !rulesQuery.isError && rules.length === 0 && (
          <div className="rdn-drawer__state" role="status">
            <strong>No rules returned for this technique</strong>
            <span>
              The coverage cell reported mappings, but the rules query returned an empty list. Confirm
              correlation-rule technique tags on Detection Rules.
            </span>
          </div>
        )}

        {!rulesQuery.isLoading && !rulesQuery.isError && rules.length > 0 && (
          <ul className="rdn-rule-list" aria-label={`Rules for ${technique.technique}`}>
            {rules.map((rule) => (
              <li key={rule.id} className="rdn-rule-row">
                <span className="rdn-rule-row__name">{rule.name}</span>
                <span className="rdn-rule-row__status" data-active={rule.active ? 'true' : 'false'}>
                  {rule.active ? 'Active' : 'Inactive'}
                </span>
              </li>
            ))}
          </ul>
        )}

        <nav className="rdn-pivots" aria-label="Coverage pivots">
          <Link to={ROUTES.DETECTION_RULES}>
            Open Detection Rules
            <Link2 size={11} aria-hidden="true" />
          </Link>
        </nav>
      </div>
    </HaDrawer>
  );
}

export function ReadinessMatrixPage(): JSX.Element {
  const [selectedTechnique, setSelectedTechnique] = useState<TechniqueCoverageDTO | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const eps = useEpsStream();

  const coverageQuery = useQuery({
    queryKey: ['mitreCoverage'],
    queryFn: mitreService.getCoverage,
    staleTime: 20_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const coverage = useMemo(() => coverageQuery.data ?? [], [coverageQuery.data]);
  const hasCoverage = coverage.length > 0;
  const techniquesWithActive = useMemo(
    () => coverage.filter((tech) => tech.activeCount >= 1).length,
    [coverage],
  );
  const uncoveredTechniques = useMemo(
    () => coverage.filter((tech) => tech.activeCount === 0).length,
    [coverage],
  );

  const showEmptyHonesty =
    !coverageQuery.isLoading && !coverageQuery.isError && coverage.length === 0;
  const errorText =
    coverageQuery.error instanceof Error
      ? coverageQuery.error.message
      : 'The detection coverage source could not be loaded.';
  const forbidden = /403|forbidden|permission/i.test(errorText);

  const handleExport = async () => {
    if (!hasCoverage || isExporting) return;
    setIsExporting(true);
    setExportFailed(false);
    try {
      const blob = await mitreService.exportCoverage();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mitre-coverage.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fail closed — no fake CSV, no customer/export context in console.
      setExportFailed(true);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section
      className="rdn-page"
      aria-label="Detection Coverage"
      data-testid="detection-coverage-page"
    >
      <header className="rdn-header">
        <div className="rdn-header__identity">
          <span className="rdn-header__mark">
            <Crosshair size={19} aria-hidden="true" />
          </span>
          <div>
            <div className="rdn-header__eyebrow">
              <span>POSTURE</span>
              <span className="rdn-header__badge">STAGING CANDIDATE</span>
            </div>
            <h1>Detection Coverage</h1>
            <p className="rdn-header__job">{POSTURE_DETECTION_COVERAGE_JOB_SENTENCE}</p>
            {exportFailed && (
              <p className="rdn-page__projection-note" role="note">
                CSV export failed. HiveArmor will not invent a coverage file.
              </p>
            )}
          </div>
        </div>
        <div className="rdn-header__actions">
          {hasCoverage && (
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={isExporting || coverageQuery.isFetching}
              aria-label="Export MITRE coverage CSV"
            >
              <Download size={14} aria-hidden="true" />
              {isExporting ? 'Exporting…' : 'Export CSV'}
            </button>
          )}
          <button
            type="button"
            onClick={() => void coverageQuery.refetch()}
            disabled={coverageQuery.isFetching}
            aria-label="Refresh detection coverage"
          >
            <RefreshCw
              size={14}
              className={coverageQuery.isFetching ? 'rdn-spin' : undefined}
              aria-hidden="true"
            />
          </button>
        </div>
      </header>

      <p className="rdn-page__meta">
        <Link to={ROUTES.DASHBOARD}>Mission Control</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.DETECTION_RULES}>Detection Rules</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.CIS_BENCHMARK}>CIS Benchmark</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.COMPLIANCE}>Compliance</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.VULNERABILITIES}>Vulnerabilities</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.EXPOSURE}>Exposure</Link>
        <span aria-hidden="true">·</span>
        <span className="rdn-page__access">Analyst · SOC Manager · Platform Administrator</span>
      </p>

      {showEmptyHonesty && (
        <div
          className="detection-coverage-empty-honesty readiness-empty-honesty"
          role="status"
          data-testid="detection-coverage-empty-honesty"
        >
          <strong>No technique coverage projected</strong>
          <span>
            No correlation rules currently report a MITRE technique id. This is an empty technique
            projection — not proof of full ATT&amp;CK coverage, not a missing API contract, and not an
            ingest failure. Map technique ids on Detection Rules to populate this matrix.
          </span>
          <Link to={ROUTES.DETECTION_RULES}>Open Detection Rules</Link>
        </div>
      )}

      {hasCoverage && (
        <div className="rdn-inline-stats" aria-label="Detection coverage summary">
          <span>
            <ShieldCheck size={11} aria-hidden="true" />
            {coverage.length.toLocaleString()} techniques with mapped rules
          </span>
          <span data-tone="positive">
            {techniquesWithActive.toLocaleString()} with ≥1 active rule
          </span>
          <span data-tone={uncoveredTechniques > 0 ? 'warning' : undefined}>
            {uncoveredTechniques.toLocaleString()} uncovered (0 active)
          </span>
        </div>
      )}

      {coverageQuery.isFetching && coverageQuery.data && (
        <div className="rdn-refreshing" role="status">
          <RefreshCw size={12} className="rdn-spin" aria-hidden="true" />
          Refreshing the coverage projection without clearing loaded techniques…
        </div>
      )}

      {coverageQuery.isError && !coverageQuery.data ? (
        <div className="rdn-state" role="alert">
          <AlertTriangle size={28} aria-hidden="true" />
          <strong>
            {forbidden ? 'Detection coverage access denied' : 'Coverage projection unavailable'}
          </strong>
          <span>
            {forbidden
              ? 'Required permission: Analyst, SOC Manager, or Platform Administrator.'
              : errorText}
          </span>
          {!forbidden && (
            <button type="button" onClick={() => void coverageQuery.refetch()}>
              Retry coverage
            </button>
          )}
        </div>
      ) : coverageQuery.isLoading && !coverageQuery.data ? (
        <div className="rdn-state" role="status">
          <Loader2 size={28} className="rdn-spin" aria-hidden="true" />
          <strong>Loading detection coverage…</strong>
          <span>Fetching MITRE technique projections from authorized correlation rules.</span>
        </div>
      ) : showEmptyHonesty ? (
        <main className="rdn-matrix coverage-inventory" aria-label="Detection coverage matrix">
          <div className="rdn-matrix__placeholder" role="presentation">
            <Crosshair size={32} aria-hidden="true" />
            <p>Matrix workspace reserved — populate technique tags on correlation rules to project coverage cells.</p>
          </div>
        </main>
      ) : (
        <main className="rdn-matrix coverage-inventory" aria-label="Detection coverage matrix">
          <div className="rdn-matrix__grid">
            {coverage.map((tech) => {
              const selected = selectedTechnique?.technique === tech.technique;
              return (
                <button
                  key={tech.technique}
                  type="button"
                  className="rdn-cell"
                  data-band={coverageBand(tech.activeCount)}
                  data-selected={selected ? 'true' : 'false'}
                  aria-pressed={selected}
                  aria-label={`${tech.technique}: ${tech.activeCount} active of ${tech.ruleCount} rules`}
                  onClick={() => setSelectedTechnique(tech)}
                >
                  <span className="rdn-cell__id">{tech.technique}</span>
                  <span className="rdn-cell__counts">
                    {tech.activeCount} / {tech.ruleCount}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="rdn-legend" aria-label="Coverage legend">
            <span data-band="none">0 active</span>
            <span data-band="low">1–2 active</span>
            <span data-band="medium">3–5 active</span>
            <span data-band="high">6+ active</span>
          </p>
        </main>
      )}

      <StatusDock
        className="rdn-status-dock"
        sseConnected={eps.connected}
        eps={eps.eps}
        mode="historical"
        lastUpdated={
          coverageQuery.dataUpdatedAt ? new Date(coverageQuery.dataUpdatedAt) : undefined
        }
      />

      {selectedTechnique && (
        <TechniqueRulesDrawer
          technique={selectedTechnique}
          onClose={() => setSelectedTechnique(null)}
        />
      )}
    </section>
  );
}
