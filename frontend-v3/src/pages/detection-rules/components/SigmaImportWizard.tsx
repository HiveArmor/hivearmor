/**
 * SigmaImportWizard — 3-step wizard (upload → preview conversions → execute import)
 * with file upload, candidate list, field mapping display (Sprint 47 DET-012)
 */

import { useCallback, useRef, useState } from 'react';

import { AlertTriangle, CheckCircle2, FileUp, RefreshCw, Upload, X } from 'lucide-react';

import { importExecute, importPreview, importValidate } from '@/pages/detection-rules/services/detection.service';
import type {
  ConvertedRule,
  FieldMapping,
  ImportCandidate,
  ImportExecuteResult,
  ImportRuleStatus,
} from '@/pages/detection-rules/types/detection.types';

interface SigmaImportWizardProps {
  onClose: () => void;
  onComplete: (message: string) => void;
}

type WizardStep = 'upload' | 'preview' | 'execute';

export function SigmaImportWizard({ onClose, onComplete }: SigmaImportWizardProps): JSX.Element {
  const [step, setStep] = useState<WizardStep>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [convertedRules, setConvertedRules] = useState<ConvertedRule[]>([]);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<ImportExecuteResult | null>(null);
  const [importStatus, setImportStatus] = useState<ImportRuleStatus>('draft');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    setFiles(selected);
    setError(null);
  }, []);

  const handleValidate = useCallback(async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setError(null);
    try {
      const result = await importValidate(files);
      setCandidates(result.rules);
      setSelectedIds(new Set(result.rules.filter((r) => r.compatible).map((r) => r.sigmaId)));
      if (result.errors.length > 0) {
        setError(`${result.errors.length} file(s) had validation errors.`);
      }
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed.');
    } finally {
      setIsProcessing(false);
    }
  }, [files]);

  const handlePreview = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setIsProcessing(true);
    setError(null);
    try {
      const result = await importPreview(ids);
      setConvertedRules(result.rules);
      setMappings(result.mappings);
      setUnmapped(result.unmapped);
      setStep('execute');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed.');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedIds]);

  const handleExecute = useCallback(async () => {
    const ids = convertedRules.map((r) => r.sigmaId);
    if (ids.length === 0) return;
    setIsProcessing(true);
    setError(null);
    try {
      const result = await importExecute({ rules: ids, importAsStatus: importStatus });
      setImportResult(result);
      onComplete(`${result.summary.imported} rules imported successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setIsProcessing(false);
    }
  }, [convertedRules, importStatus, onComplete]);

  const toggleCandidate = useCallback((sigmaId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sigmaId)) next.delete(sigmaId);
      else next.add(sigmaId);
      return next;
    });
  }, []);

  return (
    <div className="sigma-import-wizard" role="dialog" aria-modal="true" aria-label="Sigma import wizard">
      <header className="sigma-import-wizard__header">
        <div>
          <Upload size={16} />
          <h2>Import Sigma Rules</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close import wizard">
          <X size={16} />
        </button>
      </header>

      <nav className="sigma-import-wizard__steps" aria-label="Import steps">
        <button type="button" aria-current={step === 'upload' ? 'step' : undefined} disabled>
          <span>1</span> Upload
        </button>
        <button type="button" aria-current={step === 'preview' ? 'step' : undefined} disabled>
          <span>2</span> Preview
        </button>
        <button type="button" aria-current={step === 'execute' ? 'step' : undefined} disabled>
          <span>3</span> Import
        </button>
      </nav>

      {error && (
        <div className="sigma-import-wizard__error" role="alert">
          <AlertTriangle size={14} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}

      {step === 'upload' && (
        <section className="sigma-import-wizard__upload">
          <div className="sigma-import-wizard__dropzone">
            <FileUp size={32} />
            <p>Drop Sigma YAML files here or click to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".yml,.yaml"
              multiple
              onChange={handleFileSelect}
              aria-label="Select Sigma YAML files"
            />
          </div>
          {files.length > 0 && (
            <div className="sigma-import-wizard__file-list">
              <strong>{files.length} file{files.length > 1 ? 's' : ''} selected</strong>
              <ul>
                {files.map((f) => <li key={f.name}>{f.name} <small>{(f.size / 1024).toFixed(1)} KB</small></li>)}
              </ul>
            </div>
          )}
          <footer>
            <button type="button" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="detection-primary-button"
              onClick={() => void handleValidate()}
              disabled={files.length === 0 || isProcessing}
            >
              {isProcessing ? <><RefreshCw size={14} className="detection-spin" /> Validating…</> : 'Validate files'}
            </button>
          </footer>
        </section>
      )}

      {step === 'preview' && (
        <section className="sigma-import-wizard__preview">
          <div className="sigma-import-wizard__candidates">
            <strong>{candidates.length} rules found</strong>
            <ul>
              {candidates.map((c) => (
                <li key={c.sigmaId} data-compatible={c.compatible}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.sigmaId)}
                      onChange={() => toggleCandidate(c.sigmaId)}
                      disabled={!c.compatible}
                    />
                    <div>
                      <strong>{c.title}</strong>
                      <small>{c.severity} · {c.mitreTechniques.join(', ') || 'No MITRE'}</small>
                      {!c.compatible && <em>{c.issues.join('; ')}</em>}
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <footer>
            <button type="button" onClick={() => setStep('upload')}>Back</button>
            <button
              type="button"
              className="detection-primary-button"
              onClick={() => void handlePreview()}
              disabled={selectedIds.size === 0 || isProcessing}
            >
              {isProcessing ? <><RefreshCw size={14} className="detection-spin" /> Converting…</> : `Preview ${selectedIds.size} rules`}
            </button>
          </footer>
        </section>
      )}

      {step === 'execute' && !importResult && (
        <section className="sigma-import-wizard__execute">
          <div className="sigma-import-wizard__converted">
            <strong>{convertedRules.length} rules converted</strong>
            <ul>
              {convertedRules.map((r) => (
                <li key={r.sigmaId}>
                  <strong>{r.name}</strong>
                  <code>{r.expression.slice(0, 80)}{r.expression.length > 80 ? '…' : ''}</code>
                </li>
              ))}
            </ul>
          </div>

          {mappings.length > 0 && (
            <div className="sigma-import-wizard__mappings">
              <strong>Field mappings ({mappings.length})</strong>
              <table>
                <thead><tr><th>Sigma field</th><th>ECS field</th></tr></thead>
                <tbody>
                  {mappings.map((m) => (
                    <tr key={m.sigmaField}>
                      <td><code>{m.sigmaField}</code></td>
                      <td><code>{m.ecsField}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {unmapped.length > 0 && (
            <div className="sigma-import-wizard__unmapped">
              <AlertTriangle size={14} />
              <span>Unmapped fields: {unmapped.join(', ')}</span>
            </div>
          )}

          <div className="sigma-import-wizard__import-options">
            <label>
              <span>Import as:</span>
              <select
                value={importStatus}
                onChange={(e) => setImportStatus(e.target.value as ImportRuleStatus)}
              >
                <option value="draft">Draft (requires review)</option>
                <option value="active">Active (immediately executing)</option>
              </select>
            </label>
          </div>

          <footer>
            <button type="button" onClick={() => setStep('preview')}>Back</button>
            <button
              type="button"
              className="detection-primary-button"
              onClick={() => void handleExecute()}
              disabled={isProcessing}
            >
              {isProcessing ? <><RefreshCw size={14} className="detection-spin" /> Importing…</> : `Import ${convertedRules.length} rules`}
            </button>
          </footer>
        </section>
      )}

      {step === 'execute' && importResult && (
        <section className="sigma-import-wizard__result">
          <CheckCircle2 size={28} />
          <h3>Import Complete</h3>
          <dl>
            <div><dt>Imported</dt><dd>{importResult.summary.imported}</dd></div>
            <div><dt>Failed</dt><dd>{importResult.summary.failed}</dd></div>
            <div><dt>Total</dt><dd>{importResult.summary.total}</dd></div>
          </dl>
          <footer>
            <button type="button" className="detection-primary-button" onClick={onClose}>
              Close
            </button>
          </footer>
        </section>
      )}
    </div>
  );
}
