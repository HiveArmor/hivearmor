import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, BarChart3, CheckCircle2, ChevronRight, Database,
  Layers3, Search, ShieldCheck, Target, X,
} from 'lucide-react';

import { DET_014_DISABLED_TITLE } from './detectionRules.capabilities';
import { detectionRulesFixtureMode } from './detectionRules.service';
import type { DetectionRule } from './detectionRules.types';
import { fetchCoverage } from './services/detection.service';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';

interface DetectionCoverageViewProps {
  rules: DetectionRule[];
  onOpenRule: (rule: DetectionRule) => void;
}

interface TechniqueGroup {
  id: string;
  name: string;
  tactic: string;
  rules: DetectionRule[];
  activeRules: DetectionRule[];
  dataTypes: string[];
  readiness: 'ready' | 'degraded' | 'inactive';
  mappedCount: number;
}

const TACTIC_ORDER = [
  'Reconnaissance', 'Resource Development', 'Initial Access', 'Execution', 'Persistence',
  'Privilege Escalation', 'Defense Evasion', 'Credential Access', 'Discovery',
  'Lateral Movement', 'Collection', 'Command and Control', 'Exfiltration', 'Impact',
];

const PLATFORM_OPTIONS = [
  { value: 'all', label: 'All telemetry' },
  { value: 'Endpoint', label: 'Endpoint' },
  { value: 'Identity', label: 'Identity' },
  { value: 'Network', label: 'Network' },
  { value: 'Cloud', label: 'Cloud' },
];

const MODE_OPTIONS = [
  { value: 'enabled', label: 'Enabled coverage' },
  { value: 'installed', label: 'All installed rules' },
];

export default function DetectionCoverageView({ rules, onOpenRule }: DetectionCoverageViewProps): JSX.Element {
  const [platform, setPlatform] = useState('all');
  const [mode, setMode] = useState<'enabled' | 'installed'>('enabled');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<TechniqueGroup | null>(null);
  const coverageQuery = useQuery({
    queryKey: ['detection-coverage'],
    queryFn: ({ signal }) => fetchCoverage(undefined, signal),
    enabled: !detectionRulesFixtureMode,
    staleTime: 60_000,
  });

  const techniques = useMemo<TechniqueGroup[]>(() => {
    if (coverageQuery.data) {
      const loweredQuery = query.toLowerCase();
      return coverageQuery.data.matrix.flatMap((tactic) => tactic.techniques.map((technique) => {
        const mappedRules = rules.filter((rule) => rule.techniqueId === technique.techniqueId);
        const activeRules = mappedRules.filter((rule) => rule.ruleActive);
        return {
          id: technique.techniqueId,
          name: technique.techniqueName,
          tactic: tactic.tacticName,
          rules: mappedRules,
          activeRules,
          dataTypes: [...new Set(mappedRules.flatMap((rule) => rule.dataTypes))],
          readiness: technique.status === 'covered' ? 'ready' as const : technique.status === 'partial' ? 'degraded' as const : 'inactive' as const,
          mappedCount: technique.ruleCount,
        };
      })).filter((technique) => {
        if (mode === 'enabled' && technique.readiness === 'inactive') return false;
        if (platform !== 'all' && technique.dataTypes.length && !technique.dataTypes.includes(platform)) return false;
        return !loweredQuery || [technique.id, technique.name, technique.tactic, ...technique.rules.map((rule) => rule.ruleName)].some((value) => value.toLowerCase().includes(loweredQuery));
      });
    }
    const groups = new Map<string, DetectionRule[]>();
    rules.forEach((rule) => {
      if (!rule.techniqueId) return;
      if (platform !== 'all' && !rule.dataTypes.includes(platform)) return;
      if (query && ![rule.techniqueId, rule.techniqueName, rule.tactic, rule.ruleName].some((value) => value?.toLowerCase().includes(query.toLowerCase()))) return;
      groups.set(rule.techniqueId, [...(groups.get(rule.techniqueId) ?? []), rule]);
    });
    return [...groups.entries()].map(([id, mappedRules]) => {
      const activeRules = mappedRules.filter((rule) => rule.ruleActive);
      const degraded = activeRules.some((rule) => rule.health === 'failed' || rule.health === 'warning');
      const readiness: TechniqueGroup['readiness'] = !activeRules.length ? 'inactive' : degraded ? 'degraded' : 'ready';
      return {
        id,
        name: mappedRules[0].techniqueName ?? 'Technique',
        tactic: mappedRules[0].tactic ?? 'Unmapped',
        rules: mappedRules,
        activeRules,
        dataTypes: [...new Set(mappedRules.flatMap((rule) => rule.dataTypes))],
        readiness,
        mappedCount: mappedRules.length,
      };
    }).filter((technique) => mode === 'installed' || technique.activeRules.length > 0);
  }, [coverageQuery.data, mode, platform, query, rules]);

  const coveredTactics = new Set(techniques.filter((technique) => technique.activeRules.length).map((technique) => technique.tactic)).size;
  const ready = techniques.filter((technique) => technique.readiness === 'ready').length;
  const degraded = techniques.filter((technique) => technique.readiness === 'degraded').length;
  const inactive = techniques.filter((technique) => technique.readiness === 'inactive').length;
  const priorityGaps = techniques.filter((technique) => technique.readiness !== 'ready').sort((left, right) => right.rules.filter((rule) => rule.severity === 'critical' || rule.severity === 'high').length - left.rules.filter((rule) => rule.severity === 'critical' || rule.severity === 'high').length);

  return (
    <section className="detection-coverage" aria-label="MITRE ATT&CK detection coverage">
      <div className="detection-coverage__controls">
        <label className="detection-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find tactic, technique, or rule…" aria-label="Search ATT&CK coverage" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear coverage search"><X size={13} /></button>}</label>
        <HaCompactSelect ariaLabel="Coverage mode" value={mode} onChange={(value) => setMode(value as typeof mode)} options={MODE_OPTIONS} />
        <HaCompactSelect ariaLabel="Telemetry platform" value={platform} onChange={setPlatform} options={PLATFORM_OPTIONS} />
        <div className="detection-coverage__framework"><Target size={14} /><span>Enterprise ATT&amp;CK</span><strong>v16</strong></div>
      </div>

      {coverageQuery.isLoading && <div className="detection-section-loading" role="status">Loading authoritative ATT&amp;CK coverage…</div>}
      {coverageQuery.isError && <div className="detection-inline-warning" role="alert"><AlertTriangle size={14} /> Authoritative coverage is unavailable. The loaded rule projection is shown instead.</div>}

      <div className="detection-coverage__kpis">
        <article><span><Layers3 size={14} /> Covered tactics</span><strong>{coveredTactics}/14</strong><small>at least one enabled rule</small></article>
        <article data-tone="healthy"><span><ShieldCheck size={14} /> Ready techniques</span><strong>{ready}</strong><small>enabled and healthy telemetry</small></article>
        <article data-tone="warning"><span><AlertTriangle size={14} /> Degraded techniques</span><strong>{degraded || '—'}</strong><small>delayed or failed execution</small></article>
        <article><span><BarChart3 size={14} /> Installed but inactive</span><strong>{inactive || '—'}</strong><small>visible in installed mode</small></article>
      </div>

      <div className="detection-coverage__workspace" data-detail-open={Boolean(selected)}>
        <div className="detection-coverage__matrix-wrap">
          <div className="detection-coverage__matrix-title"><div><strong>ATT&amp;CK coverage matrix</strong><span>Rule mapping and current data readiness are separate signals</span></div><div className="detection-coverage__legend"><span data-readiness="ready">Ready</span><span data-readiness="degraded">Degraded</span><span data-readiness="inactive">Inactive</span></div></div>
          <div className="detection-coverage__matrix" role="region" aria-label="Scrollable ATT&CK tactic matrix" tabIndex={0}>
            {TACTIC_ORDER.map((tactic) => {
              const tacticTechniques = techniques.filter((technique) => technique.tactic === tactic);
              return <section key={tactic} className="detection-coverage__tactic"><header><span>{tactic}</span><strong>{tacticTechniques.length}</strong></header><div>{tacticTechniques.length ? tacticTechniques.map((technique) => <button key={technique.id} type="button" data-readiness={technique.readiness} aria-label={`${technique.id} ${technique.name}, ${technique.readiness}`} onClick={() => setSelected(technique)}><code>{technique.id}</code><strong>{technique.name}</strong><span>{technique.mappedCount} mapped</span></button>) : <p>No mapped rules</p>}</div></section>;
            })}
          </div>
        </div>

        <aside className="detection-coverage__priorities" aria-label="Coverage priorities">
          <header><div><strong>Coverage priorities</strong><span>Mapped content needing attention</span></div><AlertTriangle size={15} /></header>
          <div>{priorityGaps.length ? priorityGaps.slice(0, 8).map((technique) => <button key={technique.id} type="button" onClick={() => setSelected(technique)}><span data-readiness={technique.readiness}><Database size={13} /></span><div><code>{technique.id}</code><strong>{technique.name}</strong><small>{technique.readiness === 'inactive' ? 'No enabled rule' : 'Execution or telemetry degraded'}</small></div><ChevronRight size={14} /></button>) : <div className="detection-coverage__clear"><CheckCircle2 size={28} /><strong>No mapped coverage gaps</strong><span>Current filtered techniques are ready.</span></div>}</div>
        </aside>

        {selected && <aside className="detection-coverage-detail" aria-label="Technique coverage detail">
          <header><div><small>TECHNIQUE COVERAGE</small><h2>{selected.id} · {selected.name}</h2><span>{selected.tactic}</span></div><button type="button" onClick={() => setSelected(null)} aria-label="Close technique detail"><X size={15} /></button></header>
          <section className="detection-coverage-detail__summary"><div><small>READINESS</small><strong data-readiness={selected.readiness}>{selected.readiness}</strong></div><div><small>MAPPED RULES</small><strong>{selected.mappedCount}</strong></div></section>
          <section><h3>Required telemetry</h3>{selected.dataTypes.length ? <div className="detection-drawer__chips">{selected.dataTypes.map((dataType) => <span key={dataType}>{dataType}</span>)}</div> : <p>Telemetry requirements are not reported by the current coverage projection.</p>}<p>Coverage and recent detection activity are separate from source readiness. Source completeness remains visible only when the backend reports it.</p></section>
          <section><h3>Mapped rules</h3><div className="detection-coverage-detail__rules">{selected.rules.length ? selected.rules.map((rule) => <button key={rule.id} type="button" onClick={() => onOpenRule(rule)}><span data-active={rule.ruleActive}>{rule.ruleActive ? 'Active' : 'Inactive'}</span><div><strong>{rule.ruleName}</strong><small>{rule.health ?? 'unknown'}{rule.dataTypes.length ? ` · ${rule.dataTypes.join(', ')}` : ''}</small></div><ChevronRight size={14} /></button>) : <p>Mapped rule detail is outside the loaded inventory page.</p>}</div></section>
          <footer><button type="button" disabled title={DET_014_DISABLED_TITLE}>Find available content</button><button type="button" onClick={() => selected.rules[0] && onOpenRule(selected.rules[0])}>Open mapped rule <ChevronRight size={14} /></button></footer>
        </aside>}
      </div>
    </section>
  );
}
