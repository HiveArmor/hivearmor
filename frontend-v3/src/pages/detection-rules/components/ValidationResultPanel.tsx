/**
 * ValidationResultPanel — Errors (red), warnings (yellow), complexity badge (Sprint 47 DET-011)
 */

import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

import type { ComplexityLevel, ValidationResult } from '@/pages/detection-rules/types/detection.types';

interface ValidationResultPanelProps {
  result: ValidationResult | null;
  isValidating?: boolean;
}

const COMPLEXITY_LABELS: Record<ComplexityLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export function ValidationResultPanel({
  result,
  isValidating = false,
}: ValidationResultPanelProps): JSX.Element {
  if (isValidating) {
    return (
      <section className="validation-result-panel" aria-label="Validation results" data-state="loading">
        <div className="validation-result-panel__loading">
          <span className="detection-spin" />
          <strong>Validating rule definition…</strong>
        </div>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="validation-result-panel" aria-label="Validation results" data-state="empty">
        <div className="validation-result-panel__empty">
          <Info size={20} />
          <p>Run validation to check the rule definition.</p>
        </div>
      </section>
    );
  }

  const errorCount = result.errors.length;
  const warningCount = result.warnings.length;

  return (
    <section className="validation-result-panel" aria-label="Validation results" data-valid={result.valid}>
      <header className="validation-result-panel__header">
        <div className="validation-result-panel__status">
          {result.valid ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          <strong>{result.valid ? 'Valid' : 'Invalid'}</strong>
          <span>
            {errorCount > 0 && <em data-tone="error">{errorCount} error{errorCount > 1 ? 's' : ''}</em>}
            {warningCount > 0 && <em data-tone="warning">{warningCount} warning{warningCount > 1 ? 's' : ''}</em>}
          </span>
        </div>
        <span
          className="validation-complexity-badge"
          data-level={result.complexity.level}
          title={`Complexity score: ${result.complexity.score}`}
        >
          {COMPLEXITY_LABELS[result.complexity.level]}
        </span>
      </header>

      {result.errors.length > 0 && (
        <div className="validation-result-panel__errors" role="list" aria-label="Validation errors">
          {result.errors.map((error, index) => (
            <div key={index} className="validation-item" data-severity="error" role="listitem">
              <XCircle size={14} />
              <div>
                <strong>{error.field}</strong>
                <span>{error.message}</span>
                {(error.line != null) && (
                  <small>Line {error.line}{error.column != null ? `, col ${error.column}` : ''}</small>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="validation-result-panel__warnings" role="list" aria-label="Validation warnings">
          {result.warnings.map((warning, index) => (
            <div key={index} className="validation-item" data-severity="warning" role="listitem">
              <AlertTriangle size={14} />
              <div>
                <strong>{warning.field}</strong>
                <span>{warning.message}</span>
                <small>{warning.suggestion}</small>
              </div>
            </div>
          ))}
        </div>
      )}

      {result.complexity.factors.length > 0 && (
        <div className="validation-result-panel__complexity">
          <strong>Complexity factors</strong>
          <ul>
            {result.complexity.factors.map((factor, index) => (
              <li key={index}>
                <span>{factor.factor}</span>
                <strong>+{factor.score}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
