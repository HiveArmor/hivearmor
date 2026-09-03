import { useMemo, useRef, useState } from 'react';

import {
  AlertTriangle, CheckCircle2, ChevronRight, FileCode2, FileUp,
  GitCompareArrows, Import, ShieldCheck, XCircle,
} from 'lucide-react';

import { detectionRulesFixtureMode } from './detectionRules.service';
import type { DetectionRule } from './detectionRules.types';

import { HaModal } from '@/components/ha-modal/HaModal';

interface DetectionImportPanelProps {
  existingRules: DetectionRule[];
  onClose: () => void;
  onStaged: (message: string) => void;
}

type ImportStep = 'select' | 'validate' | 'review';

interface ImportCandidate {
  index: number;
  title: string;
  sigmaId: string | null;
  valid: boolean;
  duplicate: boolean;
  issue: string | null;
}

function parseCandidates(content: string, existingRules: DetectionRule[]): ImportCandidate[] {
  return content.split(/^---\s*$/m).map((document) => document.trim()).filter(Boolean).map((document, index) => {
    const title = /^title:\s*(.+)$/m.exec(document)?.[1]?.trim() ?? `Untitled rule ${index + 1}`;
    const sigmaId = /^id:\s*(.+)$/m.exec(document)?.[1]?.trim() ?? null;
    const hasDetection = /^detection:\s*$/m.test(document);
    const hasCondition = /^\s+condition:\s*.+$/m.test(document);
    const duplicate = existingRules.some((rule) => rule.sigmaRuleId === sigmaId || rule.ruleName.toLowerCase() === title.toLowerCase());
    const issue = !/^title:\s*.+$/m.test(document) ? 'Missing title' : !hasDetection ? 'Missing detection block' : !hasCondition ? 'Missing condition' : null;
    return { index: index + 1, title, sigmaId, valid: !issue, duplicate, issue };
  });
}

export default function DetectionImportPanel({ existingRules, onClose, onStaged }: DetectionImportPanelProps): JSX.Element {
  const [step, setStep] = useState<ImportStep>('select');
  const [format, setFormat] = useState<'sigma' | 'native'>('sigma');
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [activateAfterReview, setActivateAfterReview] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const candidates = useMemo(() => parseCandidates(content, existingRules), [content, existingRules]);
  const valid = candidates.filter((candidate) => candidate.valid);
  const duplicates = candidates.filter((candidate) => candidate.duplicate);
  const invalid = candidates.filter((candidate) => !candidate.valid);

  const readFile = (file?: File): void => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setContent(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(file);
  };

  const stage = (): void => {
    if (!detectionRulesFixtureMode) return;
    onStaged(`${valid.length} fictional ${format === 'sigma' ? 'Sigma' : 'native'} rule${valid.length === 1 ? '' : 's'} staged for review. No production content changed.`);
    onClose();
  };

  return (
    <HaModal isOpen onClose={onClose} title="Import and stage rules" width={720} className="detection-import">
        <div className="detection-import__intro"><span><Import size={17} /></span><div><small>DETECTION CONTENT</small><p>Validate content, review conflicts, then stage an auditable change set.</p></div></div>
        <nav aria-label="Rule import progress"><button type="button" aria-current={step === 'select' ? 'step' : undefined} onClick={() => setStep('select')}><span>1</span><div><strong>Select</strong><small>format and content</small></div></button><button type="button" disabled={!content.trim()} aria-current={step === 'validate' ? 'step' : undefined} onClick={() => setStep('validate')}><span>2</span><div><strong>Validate</strong><small>syntax and conflicts</small></div></button><button type="button" disabled={!valid.length} aria-current={step === 'review' ? 'step' : undefined} onClick={() => setStep('review')}><span>3</span><div><strong>Review</strong><small>scope and activation</small></div></button></nav>

        <main>
          {step === 'select' && <section className="detection-import__select"><h3>Content format</h3><div className="detection-import__formats"><button type="button" aria-pressed={format === 'sigma'} onClick={() => setFormat('sigma')}><FileCode2 size={18} /><span><strong>Sigma YAML</strong><small>Community or Detection-as-Code documents</small></span></button><button type="button" aria-pressed={format === 'native'} onClick={() => setFormat('native')}><ShieldCheck size={18} /><span><strong>HiveArmor native</strong><small>Versioned correlation-rule bundle</small></span></button></div><h3>Rule content</h3><div className="detection-import__drop"><FileUp size={24} /><strong>{fileName ?? 'Choose a YAML file or bundle'}</strong><span>Up to 50 documents · validation occurs before staging</span><button type="button" onClick={() => inputRef.current?.click()}>Choose file</button><input ref={inputRef} type="file" accept=".yml,.yaml,.json" onChange={(event) => readFile(event.target.files?.[0])} /></div><label><span>Or paste content</span><textarea value={content} onChange={(event) => { setContent(event.target.value); setFileName(null); }} placeholder="title: Suspicious behavior&#10;id: 00000000-0000-0000-0000-000000000000&#10;detection:&#10;  selection:&#10;    event.action: process_start&#10;  condition: selection" /></label></section>}
          {step === 'validate' && <section className="detection-import__validate"><div className="detection-import__summary"><article data-tone="healthy"><CheckCircle2 size={18} /><div><strong>{valid.length}</strong><span>valid documents</span></div></article><article data-tone="warning"><GitCompareArrows size={18} /><div><strong>{duplicates.length}</strong><span>existing conflicts</span></div></article><article data-tone="critical"><XCircle size={18} /><div><strong>{invalid.length}</strong><span>blocked documents</span></div></article></div><div className="detection-import__candidate-list"><header><strong>Validation results</strong><span>{candidates.length} documents · local structural validation</span></header>{candidates.length ? candidates.map((candidate) => <div key={candidate.index}><span data-status={candidate.valid ? candidate.duplicate ? 'warning' : 'healthy' : 'critical'}>{candidate.valid ? candidate.duplicate ? <GitCompareArrows size={14} /> : <CheckCircle2 size={14} /> : <XCircle size={14} />}</span><div><strong>{candidate.title}</strong><code>{candidate.sigmaId ?? 'No upstream ID'}</code></div><em>{candidate.issue ?? (candidate.duplicate ? 'Review existing rule conflict' : 'Ready for authoritative validation')}</em></div>) : <div className="detection-state"><AlertTriangle size={28} /><h2>No rule documents found</h2><p>Return to Select and provide YAML or a native bundle.</p></div>}</div><div className="detection-contract-warning"><AlertTriangle size={14} /><span><strong>Structural preview only.</strong> DET-012 <code>/import/validate</code> exists on the backend; this panel still performs browser-side structure checks before staging.</span></div></section>}
          {step === 'review' && <section className="detection-import__review"><div className="detection-import__review-callout"><ShieldCheck size={22} /><div><strong>Staged review protects active detections</strong><p>Importing creates a review set. It does not overwrite managed content or activate schedules until an authorized analyst approves the final diff.</p></div></div><dl><div><dt>Eligible documents</dt><dd>{valid.length}</dd></div><div><dt>Existing conflicts</dt><dd>{duplicates.length}</dd></div><div><dt>Target scope</dt><dd>All authorized tenants</dd></div><div><dt>Format</dt><dd>{format === 'sigma' ? 'Sigma YAML' : 'HiveArmor native'}</dd></div><div><dt>Activation</dt><dd>{activateAfterReview ? 'Request activation after approval' : 'Keep staged rules disabled'}</dd></div></dl><label className="detection-import__activation"><input type="checkbox" checked={activateAfterReview} onChange={(event) => setActivateAfterReview(event.target.checked)} /><span><strong>Request activation after approval</strong><small>Approval still requires authoritative validation, permission and impact review.</small></span></label>{!detectionRulesFixtureMode && <div className="detection-contract-warning"><AlertTriangle size={14} /><span><strong>Live import submit not wired.</strong> DET-012 <code>/import/*</code> endpoints exist and are authorized, but this panel does not yet POST structured <code>sigmaFiles</code> through validate → preview → execute.</span></div>}</section>}
        </main>

        <footer><span>{step === 'select' ? 'Content remains in this browser until validation.' : step === 'validate' ? `${valid.length} eligible · ${invalid.length} blocked` : 'No active rules will be overwritten.'}</span><div><button type="button" onClick={onClose}>Cancel</button>{step !== 'select' && <button type="button" onClick={() => setStep(step === 'review' ? 'validate' : 'select')}>Back</button>}{step === 'select' && <button type="button" className="detection-primary-button" disabled={!content.trim()} onClick={() => setStep('validate')}>Validate content <ChevronRight size={14} /></button>}{step === 'validate' && <button type="button" className="detection-primary-button" disabled={!valid.length} onClick={() => setStep('review')}>Review change set <ChevronRight size={14} /></button>}{step === 'review' && <button type="button" className="detection-primary-button" disabled={!detectionRulesFixtureMode || !valid.length} title={detectionRulesFixtureMode ? 'Stage fictional content' : 'DET-012 import execute exists, but this panel does not yet submit structured sigmaFiles'} onClick={stage}>Stage {valid.length} rules</button>}</div></footer>
    </HaModal>
  );
}
