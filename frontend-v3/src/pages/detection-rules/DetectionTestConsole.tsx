import { useEffect, useMemo, useRef, useState } from 'react';

import { Editor } from '@monaco-editor/react';
import {
  AlertTriangle, CheckCircle2, CircleSlash2, Clock3, Code2,
  FileJson, FlaskConical, Play, Square, TestTube2, XCircle,
} from 'lucide-react';

import { DET_011_VALIDATE_PREVIEW } from './detectionRules.capabilities';
import { detectionRulesFixtureMode, previewRuleDraft, testDetectionSandbox } from './detectionRules.service';
import type { DetectionRule, DetectionSandboxResult, RulePreviewResult } from './detectionRules.types';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { defineHiveArmorMonacoTheme } from '@/lib/monacoTheme';
import { foundationDetectionSampleEvents } from '@/pages/detection-rules/detectionRules.fixtures';
import { useThemeStore } from '@/store/theme.store';

interface DetectionTestConsoleProps {
  rules: DetectionRule[];
  initialRuleId?: DetectionRule['id'];
}

const BLANK_EVENT = '{\n  \n}';

export default function DetectionTestConsole({ rules, initialRuleId }: DetectionTestConsoleProps): JSX.Element {
  const theme = useThemeStore((state) => state.theme);
  const initialRule = rules.find((rule) => rule.id === initialRuleId) ?? rules[0];
  const [ruleId, setRuleId] = useState(initialRule ? String(initialRule.id) : '');
  const [ruleYaml, setRuleYaml] = useState(initialRule?.ruleDefinition ?? '');
  const [eventId, setEventId] = useState(foundationDetectionSampleEvents[0]?.id ?? 'blank');
  const [eventJson, setEventJson] = useState(foundationDetectionSampleEvents[0]?.json ?? BLANK_EVENT);
  const [result, setResult] = useState<DetectionSandboxResult | null>(null);
  const [previewResult, setPreviewResult] = useState<RulePreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewRange, setPreviewRange] = useState('4h');
  const controllerRef = useRef<AbortController | null>(null);
  const isSigma = /^\s*(?:#.*\n)*title:/m.test(ruleYaml) && /^detection:\s*$/m.test(ruleYaml);

  const ruleOptions = useMemo(() => rules.slice(0, 100).map((rule) => ({ value: String(rule.id), label: rule.ruleName })), [rules]);
  const sampleOptions = useMemo(() => [
    { value: 'blank', label: 'Blank JSON event' },
    ...foundationDetectionSampleEvents.map((event) => ({ value: event.id, label: event.label })),
  ], []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const selectRule = (value: string): void => {
    setRuleId(value);
    const rule = rules.find((item) => String(item.id) === value);
    setRuleYaml(rule?.ruleDefinition ?? '');
    setResult(null);
    setPreviewResult(null);
    setError(null);
  };

  const selectEvent = (value: string): void => {
    setEventId(value);
    setEventJson(foundationDetectionSampleEvents.find((event) => event.id === value)?.json ?? BLANK_EVENT);
    setResult(null);
    setError(null);
  };

  const validation = useMemo(() => {
    const diagnostics: Array<{ tone: 'ok' | 'warning' | 'error'; text: string }> = [];
    if (!ruleYaml.trim()) diagnostics.push({ tone: 'error', text: 'Rule definition is required.' });
    else if (isSigma) {
      diagnostics.push({ tone: ruleYaml.includes('detection:') ? 'ok' : 'error', text: ruleYaml.includes('detection:') ? 'Sigma detection block found' : 'Missing detection block' });
      diagnostics.push({ tone: ruleYaml.includes('condition:') ? 'ok' : 'error', text: ruleYaml.includes('condition:') ? 'Sigma condition path found' : 'Missing condition path' });
    } else {
      diagnostics.push({ tone: /\b(?:celExists|equals|oneOf|contains|regexMatch|inCIDR)\s*\(/.test(ruleYaml) ? 'ok' : 'error', text: /\b(?:celExists|equals|oneOf|contains|regexMatch|inCIDR)\s*\(/.test(ruleYaml) ? 'Native CEL helper found' : 'No supported CEL helper found' });
      diagnostics.push({ tone: ruleYaml.split('(').length === ruleYaml.split(')').length ? 'ok' : 'error', text: ruleYaml.split('(').length === ruleYaml.split(')').length ? 'CEL grouping is balanced' : 'CEL grouping is not balanced' });
    }
    try {
      const parsed = JSON.parse(eventJson) as unknown;
      diagnostics.push({ tone: parsed && typeof parsed === 'object' ? 'ok' : 'warning', text: parsed && typeof parsed === 'object' ? 'Event JSON is valid' : 'Event should be a JSON object' });
    } catch {
      diagnostics.push({ tone: 'error', text: 'Event JSON is invalid' });
    }
    return diagnostics;
  }, [eventJson, isSigma, ruleYaml]);

  const selectedRule = rules.find((item) => String(item.id) === ruleId);

  const runTest = async (): Promise<void> => {
    if (validation.some((diagnostic) => diagnostic.tone === 'error')) {
      setError('Resolve validation errors before running the sandbox.');
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setResult(null);
    setPreviewResult(null);
    setError(null);
    try {
      setResult(await testDetectionSandbox(ruleYaml, eventJson, controller.signal));
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') setError('Test cancelled. No alerts or actions were created.');
      else setError(caught instanceof Error ? caught.message : 'The sandbox test failed.');
    } finally {
      setRunning(false);
    }
  };

  const runHistoricalPreview = async (): Promise<void> => {
    if (!DET_011_VALIDATE_PREVIEW) return;
    if (previewing) {
      controllerRef.current?.abort();
      return;
    }
    if (!ruleYaml.trim()) {
      setError('A rule definition is required for historical preview.');
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPreviewing(true);
    setResult(null);
    setPreviewResult(null);
    setError(null);
    try {
      const draft: Partial<DetectionRule> = {
        id: selectedRule?.id,
        ruleName: selectedRule?.ruleName ?? 'Test console preview',
        ruleDefinition: ruleYaml,
        dataTypes: selectedRule?.dataTypes ?? ['Log'],
        severity: selectedRule?.severity ?? 'medium',
        ruleActive: false,
      };
      setPreviewResult(await previewRuleDraft(draft, previewRange, controller.signal));
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') setError('Historical preview cancelled. No alerts or actions were created.');
      else setError(caught instanceof Error ? caught.message : 'Historical preview failed.');
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <section className="detection-test-console" aria-label="Detection rule test console">
      <div className="detection-test-console__controls">
        <div><FlaskConical size={15} /><span><strong>Single-event sandbox</strong><small>In-memory evaluation · no alert side effects</small></span></div>
        <HaCompactSelect ariaLabel="Detection rule" value={ruleId} onChange={selectRule} options={ruleOptions.length ? ruleOptions : [{ value: '', label: 'No rules available' }]} />
        <HaCompactSelect ariaLabel="Sample test event" value={eventId} onChange={selectEvent} options={sampleOptions} />
        <HaCompactSelect
          ariaLabel="Historical preview range"
          value={previewRange}
          onChange={setPreviewRange}
          options={[
            { value: '4h', label: 'Preview · 4h' },
            { value: '24h', label: 'Preview · 24h' },
            { value: '7d', label: 'Preview · 7d' },
          ]}
        />
        <button
          type="button"
          className="detection-test-console__history"
          disabled={!DET_011_VALIDATE_PREVIEW || running}
          title={DET_011_VALIDATE_PREVIEW ? 'Run DET-011 historical preview against indexed events' : 'DET-011 historical preview is not exposed by the backend'}
          onClick={() => void runHistoricalPreview()}
        >
          <Clock3 size={14} /> {previewing ? 'Cancel preview' : 'Historical preview'}
        </button>
        {running ? <button type="button" className="detection-test-console__cancel" onClick={() => controllerRef.current?.abort()}><Square size={13} /> Cancel</button> : <button type="button" className="detection-primary-button" onClick={() => void runTest()} disabled={previewing}><Play size={14} /> Run test</button>}
      </div>

      <div className="detection-test-console__boundary" role="status"><TestTube2 size={14} /><strong>Safe test boundary.</strong><span>{detectionRulesFixtureMode ? 'Fictional event samples are isolated from production metrics.' : isSigma ? 'The authoritative Sigma evaluator creates no alerts, incidents, notifications, or response actions.' : DET_011_VALIDATE_PREVIEW ? 'Native CEL single-event sandbox is limited; use Historical preview for authoritative DET-011 dry-run against indexed events.' : 'Native CEL single-event execution requires the event-processor sandbox contract.'}</span></div>

      <div className="detection-test-console__workspace">
        <section className="detection-test-editor"><header><div><Code2 size={14} /><strong>Detection definition</strong></div><span>{isSigma ? 'YAML · Sigma-compatible' : 'HiveArmor CEL · normalized fields'}</span></header><div><Editor height="100%" language={isSigma ? 'yaml' : 'javascript'} value={ruleYaml} onChange={(value) => { setRuleYaml(value ?? ''); setResult(null); setPreviewResult(null); }} beforeMount={defineHiveArmorMonacoTheme} theme={`hivearmor-${theme}`} options={{ automaticLayout: true, minimap: { enabled: false }, fontSize: 12, lineHeight: 18, lineNumbersMinChars: 3, renderLineHighlight: 'none', scrollBeyondLastLine: false, wordWrap: 'on', tabSize: 2, padding: { top: 8, bottom: 8 } }} /></div></section>
        <section className="detection-test-editor"><header><div><FileJson size={14} /><strong>Test event</strong></div><span>JSON · bounded single record</span></header><div><Editor height="100%" language="json" value={eventJson} onChange={(value) => { setEventJson(value ?? ''); setResult(null); }} beforeMount={defineHiveArmorMonacoTheme} theme={`hivearmor-${theme}`} options={{ automaticLayout: true, minimap: { enabled: false }, fontSize: 12, lineHeight: 18, lineNumbersMinChars: 3, renderLineHighlight: 'none', scrollBeyondLastLine: false, wordWrap: 'on', tabSize: 2, padding: { top: 8, bottom: 8 } }} /></div></section>
        <aside className="detection-test-result" aria-live="polite">
          <header><div><strong>Evaluation</strong><span>validation and match trace</span></div>{(running || previewing) && <span className="detection-test-result__running">{previewing ? 'Previewing' : 'Running'}</span>}</header>
          <section><h3>Preflight</h3><div className="detection-test-diagnostics">{validation.map((diagnostic) => <div key={diagnostic.text} data-tone={diagnostic.tone}>{diagnostic.tone === 'ok' ? <CheckCircle2 size={13} /> : diagnostic.tone === 'error' ? <XCircle size={13} /> : <AlertTriangle size={13} />}<span>{diagnostic.text}</span></div>)}</div></section>
          {error && <section className="detection-test-result__error"><AlertTriangle size={16} /><p>{error}</p></section>}
          {(running || previewing) && <section className="detection-test-result__progress"><span /><span /><span /><p>{previewing ? 'Scanning the bounded historical window…' : 'Evaluating normalized fields and condition paths…'}</p></section>}
          {!running && !previewing && !result && !previewResult && !error && <section className="detection-test-result__empty"><CircleSlash2 size={28} /><strong>No test has run</strong><p>Review preflight diagnostics, then run this definition against the selected event or historical window.</p></section>}
          {result && <section className="detection-test-result__outcome" data-matched={result.matched}>{result.matched ? <CheckCircle2 size={28} /> : <CircleSlash2 size={28} />}<strong>{result.matched ? 'Event matched' : 'No match'}</strong><p>{result.explanation}</p><dl><div><dt>Duration</dt><dd>{result.durationMs || '<1'} ms</dd></div><div><dt>Fields evaluated</dt><dd>{result.evaluatedFields || 'Unavailable'}</dd></div></dl>{result.matchedFields.length > 0 && <div className="detection-test-result__fields"><span>Matched fields</span>{result.matchedFields.map((field) => <code key={field}>{field}</code>)}</div>}{result.warnings.map((warning) => <div key={warning} className="detection-test-result__warning"><AlertTriangle size={12} /> {warning}</div>)}</section>}
          {previewResult?.available && (
            <section className="detection-test-result__outcome" data-matched={(previewResult.matchCount ?? 0) > 0}>
              <FlaskConical size={28} />
              <strong>Historical preview</strong>
              <p>{previewResult.warning ?? 'Bounded DET-011 dry-run completed. No alerts were created.'}</p>
              <dl>
                <div><dt>Matches</dt><dd>{previewResult.matchCount}</dd></div>
                <div><dt>Duration</dt><dd>{previewResult.durationMs} ms</dd></div>
                <div><dt>Events scanned</dt><dd>{previewResult.eventsScanned?.toLocaleString() ?? 'Unavailable'}</dd></div>
                <div><dt>Source coverage</dt><dd>{previewResult.sourceCompleteness == null ? 'Unavailable' : `${previewResult.sourceCompleteness}%`}</dd></div>
              </dl>
              {previewResult.samples.length > 0 && (
                <div className="detection-test-result__fields">
                  <span>Sample matches</span>
                  {previewResult.samples.slice(0, 5).map((sample) => <code key={sample.id}>{sample.summary}</code>)}
                </div>
              )}
            </section>
          )}
          <footer><span><CheckCircle2 size={12} /> No alerts created</span><span><CheckCircle2 size={12} /> No actions executed</span></footer>
        </aside>
      </div>
    </section>
  );
}
