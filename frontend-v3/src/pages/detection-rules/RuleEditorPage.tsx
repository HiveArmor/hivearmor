import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Monaco } from '@monaco-editor/react';
import { Editor } from '@monaco-editor/react';
import {
  AlertTriangle, ArrowLeft, Braces, Check, CheckCircle2, ChevronRight, Clock3,
  Code2, Copy, Database, FileClock, FlaskConical, GitCompare, History, Info,
  LoaderCircle, Play, Radio, RotateCcw, Save, Send, Settings2, ShieldCheck,
  TestTube2, XCircle, Zap,
} from 'lucide-react';
import type * as monacoEditor from 'monaco-editor';
import { useNavigate, useParams } from 'react-router-dom';

import {
  DATA_TYPE_OPTIONS, NEW_RULE_TEMPLATE, RULE_LOOKBACK_OPTIONS, RULE_SCHEDULE_OPTIONS,
  RULE_SEVERITY_OPTIONS, RULE_SUPPRESSION_OPTIONS, RULE_TACTIC_OPTIONS,
} from './detectionRules.constants';
import {
  createRule, detectionRulesFixtureMode, fetchRule, fetchRuleVersions, previewRuleDraft,
  publishRule, rollbackRuleVersion, updateRule, validateRuleDraft,
} from './detectionRules.service';
import type {
  DetectionRule, DetectionRuleVersion, RuleAuthoringDiagnostic, RulePreviewResult,
  RuleValidationResult,
} from './detectionRules.types';
import { buildRuleClientValidation } from './detectionRules.validation';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { HaModal } from '@/components/ha-modal/HaModal';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { useEpsStream } from '@/hooks/useEpsStream';
import { defineHiveArmorMonacoTheme } from '@/lib/monacoTheme';
import { useAuthStore } from '@/store/auth.store';
import { useThemeStore } from '@/store/theme.store';

import './RuleEditorPage.css';

type InspectorView = 'validation' | 'preview' | 'history';

function formatTime(value?: string | null): string {
  if (!value) return 'Not yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString();
}

function diagnosticIcon(severity: RuleAuthoringDiagnostic['severity']): JSX.Element {
  if (severity === 'error') return <XCircle size={14} />;
  if (severity === 'warning') return <AlertTriangle size={14} />;
  return <Info size={14} />;
}

export function RuleEditorPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const theme = useThemeStore((state) => state.theme);
  const user = useAuthStore((state) => state.user);
  const epsStream = useEpsStream();
  const isNew = !id;
  const routeId = id;
  const roles = user?.roles ?? [];
  const canManage = roles.includes('ROLE_ADMIN') || roles.includes('ROLE_SOC_MANAGER');

  const [ruleName, setRuleName] = useState(isNew ? 'New detection rule' : '');
  const [description, setDescription] = useState('');
  const [ruleActive, setRuleActive] = useState(false);
  const [dataTypes, setDataTypes] = useState<string[]>(isNew ? ['Endpoint'] : []);
  const [sigmaRuleId, setSigmaRuleId] = useState('');
  const [severity, setSeverity] = useState<NonNullable<DetectionRule['severity']>>('medium');
  const [tactic, setTactic] = useState('Execution');
  const [techniqueId, setTechniqueId] = useState('T1059.001');
  const [schedule, setSchedule] = useState('Every 5m');
  const [lookback, setLookback] = useState('10m');
  const [threshold, setThreshold] = useState(1);
  const [suppressionDuration, setSuppressionDuration] = useState('Off');
  const [groupBy, setGroupBy] = useState('host.name, user.name');
  const [responseMode, setResponseMode] = useState<NonNullable<DetectionRule['responseMode']>>('alert-only');
  const [ruleDefinition, setRuleDefinition] = useState(isNew ? NEW_RULE_TEMPLATE : '');

  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [inspectorView, setInspectorView] = useState<InspectorView>('validation');
  const [validationResult, setValidationResult] = useState<RuleValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [previewRange, setPreviewRange] = useState('24h');
  const [previewResult, setPreviewResult] = useState<RulePreviewResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [versions, setVersions] = useState<DetectionRuleVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<DetectionRuleVersion | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<DetectionRuleVersion | null>(null);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const completionRef = useRef<monacoEditor.IDisposable | null>(null);
  const originalData = useRef<DetectionRule | null>(null);
  const validationAbortRef = useRef<AbortController | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);

  const buildDraft = useCallback((active = ruleActive): DetectionRule => ({
    id: routeId ?? 0,
    ruleName: ruleName.trim(),
    description: description.trim(),
    ruleActive: active,
    dataTypes,
    sigmaRuleId: sigmaRuleId.trim() || null,
    severity,
    tactic,
    category: tactic,
    techniqueId: techniqueId.trim(),
    techniqueName: originalData.current?.techniqueName,
    schedule,
    lookback,
    threshold,
    suppressionDuration,
    groupBy: groupBy.split(',').map((value) => value.trim()).filter(Boolean),
    deduplicateBy: originalData.current?.deduplicateBy ?? ['event.id'],
    responseMode,
    ruleDefinition,
    lastModified: originalData.current?.lastModified ?? '',
    origin: originalData.current?.origin ?? 'custom',
    version: originalData.current?.version ?? 1,
    updatedBy: originalData.current?.updatedBy,
  }), [dataTypes, description, groupBy, lookback, responseMode, routeId, ruleActive, ruleDefinition, ruleName, schedule, severity, sigmaRuleId, suppressionDuration, tactic, techniqueId, threshold]);

  const clientValidation = useMemo(() => buildRuleClientValidation(buildDraft()), [buildDraft]);
  const effectiveValidation = validationResult ?? clientValidation;
  const errorCount = effectiveValidation.diagnostics.filter((item) => item.severity === 'error').length;
  const warningCount = effectiveValidation.diagnostics.filter((item) => item.severity === 'warning').length;

  const isDirty = useMemo(() => {
    if (isLoading) return false;
    if (!originalData.current) return true;
    const current = buildDraft();
    const original = originalData.current;
    return JSON.stringify({
      ruleName: current.ruleName, description: current.description, ruleActive: current.ruleActive,
      dataTypes: current.dataTypes, sigmaRuleId: current.sigmaRuleId, severity: current.severity,
      tactic: current.tactic, techniqueId: current.techniqueId, schedule: current.schedule,
      lookback: current.lookback, threshold: current.threshold, suppressionDuration: current.suppressionDuration,
      groupBy: current.groupBy, responseMode: current.responseMode, ruleDefinition: current.ruleDefinition,
    }) !== JSON.stringify({
      ruleName: original.ruleName, description: original.description ?? '', ruleActive: original.ruleActive,
      dataTypes: original.dataTypes, sigmaRuleId: original.sigmaRuleId, severity: original.severity ?? 'medium',
      tactic: original.tactic ?? original.category ?? 'Execution', techniqueId: original.techniqueId ?? '',
      schedule: original.schedule ?? 'Every 5m', lookback: original.lookback ?? '10m', threshold: original.threshold ?? 1,
      suppressionDuration: original.suppressionDuration ?? 'Off', groupBy: original.groupBy ?? [],
      responseMode: original.responseMode ?? 'alert-only', ruleDefinition: original.ruleDefinition ?? '',
    });
  }, [buildDraft, isLoading]);

  const applyRule = useCallback((rule: DetectionRule): void => {
    originalData.current = rule;
    setRuleName(rule.ruleName);
    setDescription(rule.description ?? '');
    setRuleActive(rule.ruleActive);
    setDataTypes(rule.dataTypes);
    setSigmaRuleId(rule.sigmaRuleId ?? '');
    setSeverity(rule.severity ?? 'medium');
    setTactic(rule.tactic ?? rule.category ?? 'Execution');
    setTechniqueId(rule.techniqueId ?? '');
    setSchedule(rule.schedule ?? 'Every 5m');
    setLookback(rule.lookback ?? '10m');
    setThreshold(rule.threshold ?? 1);
    setSuppressionDuration(rule.suppressionDuration ?? 'Off');
    setGroupBy((rule.groupBy ?? []).join(', '));
    setResponseMode(rule.responseMode ?? 'alert-only');
    setRuleDefinition(rule.ruleDefinition ?? '');
  }, []);

  useEffect(() => {
    if (isNew || routeId == null) return;
    const controller = new AbortController();
    const load = async (): Promise<void> => {
      setIsLoading(true);
      setLoadError(null);
      try {
        applyRule(await fetchRule(routeId, controller.signal));
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'The rule could not be loaded.');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [applyRule, isNew, routeId]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const handler = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  useEffect(() => () => {
    validationAbortRef.current?.abort();
    previewAbortRef.current?.abort();
    completionRef.current?.dispose();
  }, []);

  const loadVersions = useCallback(async (): Promise<void> => {
    if (routeId == null || isNew || versionsLoading) return;
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      setVersions(await fetchRuleVersions(routeId));
    } catch (error) {
      setVersionsError(error instanceof Error ? error.message : 'Version history is unavailable.');
    } finally {
      setVersionsLoading(false);
    }
  }, [isNew, routeId, versionsLoading]);

  useEffect(() => {
    if (inspectorView === 'history' && versions.length === 0) void loadVersions();
  }, [inspectorView, loadVersions, versions.length]);

  const runValidation = useCallback(async (): Promise<RuleValidationResult> => {
    validationAbortRef.current?.abort();
    const controller = new AbortController();
    validationAbortRef.current = controller;
    setIsValidating(true);
    setInspectorView('validation');
    try {
      const result = await validateRuleDraft(buildDraft(), controller.signal);
      setValidationResult(result);
      return result;
    } finally {
      setIsValidating(false);
    }
  }, [buildDraft]);

  const runPreview = useCallback(async (): Promise<void> => {
    if (isPreviewing) {
      previewAbortRef.current?.abort();
      return;
    }
    const preflight = buildRuleClientValidation(buildDraft());
    setValidationResult(preflight);
    if (!preflight.valid) {
      setInspectorView('validation');
      setActionMessage('Resolve blocking validation errors before running a historical preview.');
      return;
    }
    const controller = new AbortController();
    previewAbortRef.current = controller;
    setIsPreviewing(true);
    setInspectorView('preview');
    setPreviewResult(null);
    try {
      setPreviewResult(await previewRuleDraft(buildDraft(), previewRange, controller.signal));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setActionMessage(error instanceof Error ? error.message : 'Preview failed.');
    } finally {
      setIsPreviewing(false);
    }
  }, [buildDraft, isPreviewing, previewRange]);

  const saveRule = useCallback(async (publish: boolean): Promise<void> => {
    if (!canManage) return;
    setActionMessage(null);
    let validation = buildRuleClientValidation(buildDraft(publish ? true : ruleActive));
    setValidationResult(validation);
    setInspectorView('validation');
    if (!validation.valid) {
      setActionMessage('Resolve blocking validation errors before saving.');
      return;
    }
    if (publish) {
      try {
        validation = await runValidation();
      } catch (error) {
        setActionMessage(error instanceof Error ? error.message : 'Authoritative validation failed.');
        return;
      }
      if (!validation.authoritative || !validation.valid) {
        setActionMessage(validation.authoritative ? 'Resolve validation errors before publishing.' : 'Run DET-011 authoritative validation before publishing.');
        return;
      }
    }
    setIsSaving(true);
    try {
      const draft = buildDraft(publish ? true : ruleActive);
      const { id: draftId, ...newRuleData } = draft;
      const draftSaved = isNew ? await createRule(newRuleData) : await updateRule(routeId as string, draft);
      const saved = publish ? await publishRule(draftSaved.id) : draftSaved;
      void draftId;
      applyRule(saved);
      setActionMessage(publish ? 'Rule published and enabled.' : 'Draft revision saved.');
      if (isNew) navigate(`/detection-rules/${saved.id}/edit`, { replace: true });
      if (publish) setRuleActive(true);
      setVersions([]);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'The rule could not be saved.');
    } finally {
      setIsSaving(false);
    }
  }, [applyRule, buildDraft, canManage, isNew, navigate, routeId, ruleActive, runValidation]);

  const navigateBack = (): void => {
    if (isDirty) setShowDiscardModal(true);
    else navigate('/detection-rules');
  };

  const revealDiagnostic = (diagnostic: RuleAuthoringDiagnostic): void => {
    if (!diagnostic.line) return;
    editorRef.current?.setPosition({ lineNumber: diagnostic.line, column: diagnostic.column ?? 1 });
    editorRef.current?.revealLineInCenter(diagnostic.line);
    editorRef.current?.focus();
  };

  const insertSnippet = (snippet: string): void => {
    const editor = editorRef.current;
    const selection = editor?.getSelection();
    if (!editor || !selection) return;
    editor.executeEdits('hivearmor-rule-assistant', [{ range: selection, text: snippet, forceMoveMarkers: true }]);
    editor.focus();
  };

  const handleEditorMount = (editor: monacoEditor.editor.IStandaloneCodeEditor, monaco: Monaco): void => {
    editorRef.current = editor;
    defineHiveArmorMonacoTheme(monaco);
    monaco.editor.setTheme(`hivearmor-${theme}`);
    completionRef.current?.dispose();
    completionRef.current = monaco.languages.registerCompletionItemProvider('javascript', {
      triggerCharacters: ['.', '('],
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
        const items = [
          ['event.action', 'equals(event.action, "process_start")', 'Compare normalized event action'],
          ['process.name', 'equals(process.name, "powershell.exe")', 'Compare normalized process name'],
          ['process.command_line', 'contains(process.command_line, "-enc")', 'CEL string containment helper'],
          ['user.name', 'equals(user.name, "svc-account")', 'Compare normalized identity name'],
          ['source.ip', 'inCIDR(source.ip, "198.51.100.0/24")', 'Match a normalized source address range'],
          ['celExists', 'celExists(event.action)', 'Guard a normalized field before evaluation'],
        ];
        return { suggestions: items.map(([label, insertText, detail]) => ({ label, insertText, detail, range, kind: monaco.languages.CompletionItemKind.Field })) };
      },
    });
  };

  const toggleDataType = (dataType: string): void => {
    setDataTypes((current) => current.includes(dataType) ? current.filter((item) => item !== dataType) : [...current, dataType]);
    setValidationResult(null);
  };

  const restoreVersion = async (): Promise<void> => {
    if (!rollbackTarget || routeId == null) return;
    try {
      applyRule(await rollbackRuleVersion(routeId, rollbackTarget.versionNum));
      setRollbackTarget(null);
      setVersions([]);
      setActionMessage(`Version ${rollbackTarget.versionNum} restored as a new revision.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'The version could not be restored.');
    }
  };

  const copyDefinition = async (): Promise<void> => {
    await navigator.clipboard.writeText(ruleDefinition);
    setCopyState('copied');
    window.setTimeout(() => setCopyState('idle'), 1400);
  };

  const handleKeyboard = (event: React.KeyboardEvent<HTMLElement>): void => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void runValidation();
    }
  };

  if (isLoading) return <section className="rule-editor-page"><div className="rule-editor-state"><LoaderCircle className="rule-editor-spin" size={26} /><strong>Loading rule workspace</strong><span>Retrieving the bounded definition and metadata projection…</span></div></section>;
  if (loadError) return <section className="rule-editor-page"><div className="rule-editor-state" data-tone="error"><XCircle size={30} /><strong>Rule definition unavailable</strong><span>{loadError}</span><button type="button" onClick={() => navigate('/detection-rules')}>Back to detection rules</button></div></section>;

  const sourceLabel = originalData.current?.origin === 'managed' ? 'Managed content' : 'Custom rule';

  return (
    <section className="rule-editor-page" onKeyDown={handleKeyboard}>
      <header className="rule-editor-identity">
        <div className="rule-editor-identity__title">
          <button type="button" onClick={navigateBack} aria-label="Back to detection rules"><ArrowLeft size={17} /></button>
          <span><Zap size={19} /></span>
          <div><small>DETECTION ENGINEERING</small><h1>{isNew ? 'Create detection rule' : ruleName}</h1><p>{isNew ? 'New custom content' : `${sourceLabel} · ${routeId} · v${originalData.current?.version ?? 1}`}</p></div>
        </div>
        <div className="rule-editor-identity__actions">
          <span className="rule-editor-save-state" data-dirty={isDirty}>{isDirty ? 'Unsaved changes' : 'Saved'} </span>
          <button type="button" onClick={() => { setInspectorView('history'); void loadVersions(); }} disabled={isNew}><History size={14} /> History</button>
          <button type="button" disabled={isNew || isDirty} onClick={() => navigate(`/detection-rules/${routeId}/test`)} title={isDirty ? 'Save changes before opening the test console' : undefined}><TestTube2 size={14} /> Test</button>
          <button type="button" onClick={() => void runValidation()} disabled={isValidating}><ShieldCheck size={14} /> {isValidating ? 'Validating…' : 'Validate'}</button>
          <button type="button" onClick={() => void saveRule(false)} disabled={!canManage || isSaving || !isDirty}><Save size={14} /> Save draft</button>
          <button className="rule-editor-primary" type="button" onClick={() => void saveRule(true)} disabled={!canManage || isSaving}><Send size={14} /> {originalData.current?.origin === 'managed' ? 'Publish override' : 'Publish'}</button>
        </div>
      </header>

      {detectionRulesFixtureMode && <div className="detection-page__fixture"><span><strong>Design fixture:</strong> fictional rule content, validation, preview, and history are enabled.</span><span>Production never receives these records.</span></div>}
      {!canManage && <div className="rule-editor-notice" data-tone="warning"><AlertTriangle size={14} /><span><strong>Read-only role.</strong> Detection Manager or Administrator permission is required to save or publish changes.</span></div>}
      {originalData.current?.origin === 'managed' && <div className="rule-editor-notice"><Info size={14} /><span><strong>Managed detection.</strong> Publishing preserves the upstream definition and creates an auditable local override.</span></div>}
      {actionMessage && <div className="rule-editor-message" role="status"><Radio size={13} /><span>{actionMessage}</span><button type="button" onClick={() => setActionMessage(null)} aria-label="Dismiss message"><XCircle size={13} /></button></div>}

      <nav className="rule-editor-progress" aria-label="Rule authoring workflow">
        <button type="button" aria-current="step"><span>1</span><strong>Define</strong><small>metadata and logic</small></button>
        <button type="button" data-state={errorCount ? 'blocked' : 'ready'} onClick={() => setInspectorView('validation')}><span>2</span><strong>Validate</strong><small>{errorCount ? `${errorCount} blocking` : warningCount ? `${warningCount} warnings` : 'ready'}</small></button>
        <button type="button" data-state={previewResult?.available ? 'ready' : 'idle'} onClick={() => setInspectorView('preview')}><span>3</span><strong>Preview</strong><small>{previewResult?.available ? `${previewResult.matchCount} matches` : 'not run'}</small></button>
        <button type="button" data-state={effectiveValidation.authoritative && effectiveValidation.valid ? 'ready' : 'idle'} onClick={() => setInspectorView('validation')}><span>4</span><strong>Publish</strong><small>{effectiveValidation.authoritative && effectiveValidation.valid ? 'eligible' : 'validation required'}</small></button>
      </nav>

      <main className="rule-editor-workspace">
        <aside className="rule-editor-setup" aria-label="Rule configuration">
          <header><div><Settings2 size={15} /><strong>Rule setup</strong></div><span>{dataTypes.length} sources</span></header>
          <div className="rule-editor-setup__scroll">
            <fieldset><legend>Identity</legend>
              <label><span>Rule name <em>required</em></span><input value={ruleName} onChange={(event) => { setRuleName(event.target.value); setValidationResult(null); }} maxLength={200} disabled={!canManage} /></label>
              <label><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Threat behavior, intent, and analyst value" disabled={!canManage} /></label>
              <label className="rule-editor-toggle"><span><strong>Rule enabled</strong><small>Active rules generate alerts on schedule.</small></span><input type="checkbox" checked={ruleActive} onChange={(event) => setRuleActive(event.target.checked)} disabled={!canManage} /></label>
            </fieldset>

            <fieldset><legend>Detection context</legend>
              <div className="rule-editor-field-row"><HaCompactSelect layout="stacked" label="Severity" ariaLabel="Rule severity" value={severity} onChange={(value) => setSeverity(value)} disabled={!canManage} options={RULE_SEVERITY_OPTIONS.map((option) => ({ value: option, label: option === 'info' ? 'Informational' : option }))} /><HaCompactSelect layout="stacked" label="Tactic" ariaLabel="ATT&CK tactic" value={tactic} onChange={setTactic} disabled={!canManage} options={RULE_TACTIC_OPTIONS.map((option) => ({ value: option, label: option }))} /></div>
              <label><span>ATT&amp;CK technique</span><input value={techniqueId} onChange={(event) => setTechniqueId(event.target.value.toUpperCase())} placeholder="T1059.001" disabled={!canManage} /></label>
              <label><span>Sigma rule ID</span><input value={sigmaRuleId} onChange={(event) => setSigmaRuleId(event.target.value)} placeholder="Optional upstream UUID" disabled={!canManage} /></label>
              <div className="rule-editor-data-types"><span>Normalized data sources <em>required</em></span><div>{DATA_TYPE_OPTIONS.map((option) => <button type="button" key={option} aria-pressed={dataTypes.includes(option)} onClick={() => toggleDataType(option)} disabled={!canManage}>{dataTypes.includes(option) && <Check size={11} />}{option}</button>)}</div></div>
            </fieldset>

            <fieldset><legend>Execution policy</legend>
              <div className="rule-editor-field-row"><HaCompactSelect layout="stacked" label="Run interval" ariaLabel="Rule run interval" value={schedule} onChange={setSchedule} disabled={!canManage} options={RULE_SCHEDULE_OPTIONS.map((option) => ({ value: option, label: option }))} /><HaCompactSelect layout="stacked" label="Lookback" ariaLabel="Rule lookback" value={lookback} onChange={setLookback} disabled={!canManage} options={RULE_LOOKBACK_OPTIONS.map((option) => ({ value: option, label: option }))} /></div>
              <div className="rule-editor-field-row"><label><span>Alert threshold</span><input type="number" min="1" max="10000" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} disabled={!canManage} /></label><HaCompactSelect layout="stacked" label="Suppression" ariaLabel="Alert suppression" value={suppressionDuration} onChange={setSuppressionDuration} disabled={!canManage} options={RULE_SUPPRESSION_OPTIONS.map((option) => ({ value: option, label: option }))} /></div>
              <label><span>Group matching events by</span><input value={groupBy} onChange={(event) => setGroupBy(event.target.value)} placeholder="host.name, user.name" disabled={!canManage} /><small>Comma-separated normalized fields.</small></label>
            </fieldset>

            <fieldset><legend>Alert output</legend>
              <label className="rule-editor-radio"><input type="radio" name="response-mode" checked={responseMode === 'alert-only'} onChange={() => setResponseMode('alert-only')} disabled={!canManage} /><span><strong>Create alert only</strong><small>Analyst triage decides incident escalation.</small></span></label>
              <label className="rule-editor-radio"><input type="radio" name="response-mode" checked={responseMode === 'create-incident'} onChange={() => setResponseMode('create-incident')} disabled={!canManage} /><span><strong>Create incident</strong><small>Open an incident for every eligible alert group.</small></span></label>
              <div className="rule-editor-disabled-action"><Zap size={13} /><span><strong>Response actions</strong><small>No connector action configured · approval required</small></span><ChevronRight size={13} /></div>
            </fieldset>
          </div>
        </aside>

        <section className="rule-editor-definition" aria-label="Detection definition editor">
          <header><div><Code2 size={15} /><span><strong>Detection definition</strong><small>HiveArmor CEL · normalized fields</small></span></div><div><span className="rule-editor-diagnostic-count" data-tone={errorCount ? 'error' : warningCount ? 'warning' : 'ready'}>{errorCount ? `${errorCount} errors` : warningCount ? `${warningCount} warnings` : 'Preflight ready'}</span><button type="button" onClick={() => void copyDefinition()}>{copyState === 'copied' ? <Check size={13} /> : <Copy size={13} />}{copyState === 'copied' ? 'Copied' : 'Copy'}</button></div></header>
          <div className="rule-editor-monaco">
            <Editor height="100%" language="javascript" value={ruleDefinition} onChange={(value) => { setRuleDefinition(value ?? ''); setValidationResult(null); setPreviewResult(null); }} onMount={handleEditorMount} beforeMount={defineHiveArmorMonacoTheme} theme={`hivearmor-${theme}`} options={{ automaticLayout: true, minimap: { enabled: false }, fontSize: 12, lineHeight: 19, lineNumbersMinChars: 3, scrollBeyondLastLine: false, wordWrap: 'on', tabSize: 2, insertSpaces: true, renderLineHighlight: 'line', padding: { top: 9, bottom: 9 }, readOnly: !canManage, quickSuggestions: true, suggestOnTriggerCharacters: true, folding: true }} />
          </div>
          <footer><span><Braces size={13} /> Field assistant</span><button type="button" onClick={() => insertSnippet('\n&& celExists(process.name)\n&& equals(process.name, "powershell.exe")')}>process.name</button><button type="button" onClick={() => insertSnippet('\n&& celExists(user.name)\n&& equals(user.name, "svc-account")')}>user.name</button><button type="button" onClick={() => insertSnippet('\n&& celExists(source.ip)\n&& inCIDR(source.ip, "198.51.100.0/24")')}>source.ip</button><button type="button" onClick={() => insertSnippet('\n&& contains(process.command_line, "-enc")')}>contains()</button><span className="rule-editor-shortcut">Validate <kbd>⌘</kbd><kbd>Enter</kbd></span></footer>
        </section>

        <aside className="rule-editor-inspector" aria-label="Rule readiness inspector">
          <header><div role="tablist" aria-label="Inspector views"><button type="button" role="tab" aria-selected={inspectorView === 'validation'} onClick={() => setInspectorView('validation')}><ShieldCheck size={13} /> Validation</button><button type="button" role="tab" aria-selected={inspectorView === 'preview'} onClick={() => setInspectorView('preview')}><FlaskConical size={13} /> Preview</button><button type="button" role="tab" aria-selected={inspectorView === 'history'} disabled={isNew} onClick={() => setInspectorView('history')}><FileClock size={13} /> History</button></div></header>

          {inspectorView === 'validation' && <div className="rule-editor-inspector__scroll">
            <section className="rule-editor-readiness" data-valid={effectiveValidation.valid}><div>{isValidating ? <LoaderCircle className="rule-editor-spin" size={22} /> : effectiveValidation.valid ? <CheckCircle2 size={22} /> : <XCircle size={22} />}<span><strong>{isValidating ? 'Validating definition' : effectiveValidation.valid ? 'Definition is structurally ready' : 'Blocking issues found'}</strong><small>{effectiveValidation.authoritative ? effectiveValidation.engineVersion : 'Client preflight · authoritative validation pending'}</small></span></div><button type="button" onClick={() => void runValidation()} disabled={isValidating}>{isValidating ? 'Running…' : 'Run validation'}</button></section>
            {!effectiveValidation.available && <section className="rule-editor-contract-state"><AlertTriangle size={14} /><p><strong>Authoritative validation unavailable.</strong> The editor is showing local structural checks. Publishing stays blocked until DET-011 <code>/validate</code> responds.</p></section>}
            {effectiveValidation.available && !effectiveValidation.authoritative && <section className="rule-editor-contract-state"><AlertTriangle size={14} /><p><strong>Client preflight only.</strong> Run DET-011 authoritative validation before publishing.</p></section>}
            <section className="rule-editor-checks"><h2>Readiness</h2><div><span data-state={ruleName.trim().length >= 3 ? 'ready' : 'blocked'}>{ruleName.trim().length >= 3 ? <Check size={12} /> : <XCircle size={12} />} Metadata</span><span data-state={dataTypes.length ? 'ready' : 'blocked'}>{dataTypes.length ? <Check size={12} /> : <XCircle size={12} />} Data sources</span><span data-state={errorCount ? 'blocked' : 'ready'}>{errorCount ? <XCircle size={12} /> : <Check size={12} />} Syntax</span><span data-state={techniqueId.match(/^T\d{4}(?:\.\d{3})?$/) ? 'ready' : 'warning'}><Check size={12} /> ATT&amp;CK mapping</span><span data-state={previewResult?.available ? 'ready' : 'idle'}>{previewResult?.available ? <Check size={12} /> : <Clock3 size={12} />} Historical preview</span></div></section>
            <section className="rule-editor-diagnostics"><h2>Diagnostics <span>{effectiveValidation.diagnostics.length}</span></h2>{effectiveValidation.diagnostics.length === 0 ? <div className="rule-editor-empty"><CheckCircle2 size={22} /><strong>No structural diagnostics</strong><span>Run authoritative validation before publishing.</span></div> : effectiveValidation.diagnostics.map((diagnostic) => <button type="button" key={diagnostic.id} data-severity={diagnostic.severity} onClick={() => revealDiagnostic(diagnostic)}><span>{diagnosticIcon(diagnostic.severity)}</span><div><strong>{diagnostic.code}</strong><p>{diagnostic.message}</p><small>{diagnostic.path}{diagnostic.line ? ` · line ${diagnostic.line}` : ''} · {diagnostic.source}</small></div>{diagnostic.line && <ChevronRight size={13} />}</button>)}</section>
            <section className="rule-editor-source-readiness"><h2>Field and source readiness</h2><div><span>Normalized field coverage</span><strong>{effectiveValidation.fieldCoverage == null ? 'Not calculated' : `${effectiveValidation.fieldCoverage}%`}</strong></div><div className="rule-editor-coverage-bar"><i style={{ '--coverage': `${effectiveValidation.fieldCoverage ?? 0}%` } as React.CSSProperties} /></div>{dataTypes.map((dataType) => <div className="rule-editor-source-row" key={dataType}><Database size={13} /><span><strong>{dataType}</strong><small>Present · refreshed 2m ago</small></span><CheckCircle2 size={13} /></div>)}</section>
          </div>}

          {inspectorView === 'preview' && <div className="rule-editor-inspector__scroll">
            <section className="rule-editor-preview-controls"><div><strong>Historical preview</strong><small>No alerts, incidents, or response actions are created.</small></div><HaCompactSelect layout="stacked" label="Range" ariaLabel="Historical preview range" value={previewRange} onChange={setPreviewRange} options={[{ value: '4h', label: 'Last 4 hours' }, { value: '24h', label: 'Last 24 hours' }, { value: '7d', label: 'Last 7 days' }]} /><button type="button" className="rule-editor-primary" onClick={() => void runPreview()}>{isPreviewing ? <><XCircle size={14} /> Cancel preview</> : <><Play size={14} /> Run preview</>}</button></section>
            {isPreviewing && <section className="rule-editor-preview-running"><LoaderCircle className="rule-editor-spin" size={24} /><strong>Scanning the bounded historical window</strong><span>Results are isolated from production metrics.</span></section>}
            {!isPreviewing && !previewResult && <section className="rule-editor-empty rule-editor-empty--large"><FlaskConical size={28} /><strong>Preview has not run</strong><span>Estimate alert volume and inspect representative matches before publishing.</span></section>}
            {!isPreviewing && previewResult && !previewResult.available && <section className="rule-editor-contract-state"><AlertTriangle size={14} /><p><strong>Historical preview unavailable.</strong> {previewResult.warning}</p></section>}
            {!isPreviewing && previewResult?.available && <>
              <section className="rule-editor-preview-metrics"><div><span>Matches</span><strong>{previewResult.matchCount}</strong></div><div><span>Events scanned</span><strong>{previewResult.eventsScanned?.toLocaleString() ?? 'Unavailable'}</strong></div><div><span>Duration</span><strong>{previewResult.durationMs} ms</strong></div><div><span>Source coverage</span><strong>{previewResult.sourceCompleteness == null ? 'Unavailable' : `${previewResult.sourceCompleteness}%`}</strong></div></section>
              <section className="rule-editor-preview-chart"><h2>Expected detections <span>{previewRange}</span></h2><div>{previewResult.histogram.map((bucket) => <i key={bucket.label} title={`${bucket.label}: ${bucket.count}`} style={{ '--preview-height': `${Math.max(7, bucket.count * 13)}%` } as React.CSSProperties}><span /></i>)}</div><footer><span>00:00</span><span>12:00</span><span>Now</span></footer></section>
              <section className="rule-editor-preview-samples"><h2>Representative matches <span>{previewResult.samples.length}</span></h2>{previewResult.samples.map((sample) => <button type="button" key={sample.id}><span><strong>{sample.summary}</strong><small>{sample.entity} · {formatTime(sample.timestamp)}</small></span><ChevronRight size={13} /></button>)}</section>
              <section className="rule-editor-safe-boundary"><ShieldCheck size={14} /><span><strong>Preview boundary preserved</strong><small>No alerts created · no actions executed</small></span></section>
            </>}
          </div>}

          {inspectorView === 'history' && <div className="rule-editor-inspector__scroll">
            <section className="rule-editor-history-header"><div><strong>Version history</strong><small>Immutable revisions and rollback points</small></div><button type="button" onClick={() => void loadVersions()} disabled={versionsLoading}><RotateCcw size={13} /> Refresh</button></section>
            {versionsLoading && <section className="rule-editor-preview-running"><LoaderCircle className="rule-editor-spin" size={23} /><strong>Loading revisions</strong></section>}
            {versionsError && <section className="rule-editor-contract-state"><AlertTriangle size={14} /><p>{versionsError}</p></section>}
            {!versionsLoading && !versionsError && versions.map((version, index) => <article className="rule-editor-version" key={version.id} data-selected={selectedVersion?.id === version.id}><header><span>v{version.versionNum}</span><div><strong>{index === 0 ? 'Current published revision' : version.changeNote || 'Rule definition updated'}</strong><small>{version.changedBy} · {formatTime(version.changedAt)}</small></div></header><p>{version.changeNote || 'No change note was recorded.'}</p><footer><button type="button" onClick={() => setSelectedVersion(selectedVersion?.id === version.id ? null : version)}><GitCompare size={13} /> {selectedVersion?.id === version.id ? 'Hide snapshot' : 'Inspect snapshot'}</button>{index > 0 && <button type="button" onClick={() => setRollbackTarget(version)} disabled={!canManage}><RotateCcw size={13} /> Restore</button>}</footer>{selectedVersion?.id === version.id && <pre>{version.ruleSnapshot.slice(0, 900)}</pre>}</article>)}
            {!versionsLoading && !versionsError && versions.length === 0 && <section className="rule-editor-empty rule-editor-empty--large"><FileClock size={28} /><strong>No revisions available</strong><span>History begins after the first saved version.</span></section>}
          </div>}
        </aside>
      </main>

      <div className="rule-editor-operation-bar"><span><ShieldCheck size={13} /> {effectiveValidation.authoritative ? 'Authoritative validation' : 'Client preflight'}: <strong>{effectiveValidation.valid ? 'ready' : `${errorCount} blocking`}</strong></span><span><Database size={13} /> {dataTypes.length || 0} data sources</span><span><Clock3 size={13} /> {schedule} · {lookback} lookback</span><span className="rule-editor-operation-bar__right">{previewResult?.available ? `Preview ${previewResult.matchCount} matches · ${previewResult.durationMs} ms` : 'Preview not run'}</span></div>
      <div className="detection-status rule-editor-status"><StatusDock sseConnected={epsStream.connected} eps={epsStream.eps} mode="live" /><span>Rule authoring · {isDirty ? 'unsaved draft' : `saved v${originalData.current?.version ?? 1}`}</span></div>

      <HaModal isOpen={showDiscardModal} onClose={() => setShowDiscardModal(false)} title="Leave without saving?" width={460} className="rule-editor-confirm-modal">
        <div className="rule-editor-modal"><p>Your unsaved rule changes will be lost.</p><footer><button type="button" onClick={() => setShowDiscardModal(false)}>Keep editing</button><button type="button" data-tone="danger" onClick={() => navigate('/detection-rules')}>Discard changes</button></footer></div>
      </HaModal>
      <HaModal isOpen={rollbackTarget != null} onClose={() => setRollbackTarget(null)} title={`Restore version ${rollbackTarget?.versionNum ?? ''}?`} width={480} className="rule-editor-confirm-modal">
        <div className="rule-editor-modal"><p>The selected snapshot will be restored as a new auditable revision. Existing history is preserved.</p><footer><button type="button" onClick={() => setRollbackTarget(null)}>Cancel</button><button type="button" className="rule-editor-primary" onClick={() => void restoreVersion()}>Restore version</button></footer></div>
      </HaModal>
    </section>
  );
}
