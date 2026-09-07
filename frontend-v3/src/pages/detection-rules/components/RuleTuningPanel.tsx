/**
 * Rule tuning panel — exception / suppression impact preview (DET-FP loop, Now-scope UI).
 * Wired to POST /api/ha-detection-rules/{id}/exceptions/preview with fixture fallback.
 */

import { useCallback, useState } from 'react';

import { AlertTriangle, LoaderCircle, Plus, ShieldAlert, SlidersHorizontal, Trash2, X } from 'lucide-react';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import {
  previewExceptionImpact,
  type ExceptionCondition,
  type ExceptionPreviewResult,
} from '@/services/detectionException.service';

const OPERATOR_OPTIONS = [
  { value: 'is', label: 'is' },
  { value: 'is_not', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'in', label: 'in' },
];

const EMPTY_CONDITION: ExceptionCondition = { field: 'host.name', operator: 'is', value: '' };

export interface RuleTuningPanelProps {
  ruleId: string | number;
  ruleName: string;
  canManage: boolean;
  manageDeniedTitle: string;
}

export function RuleTuningPanel({
  ruleId,
  ruleName,
  canManage,
  manageDeniedTitle,
}: RuleTuningPanelProps): JSX.Element {
  const [conditions, setConditions] = useState<ExceptionCondition[]>([{ ...EMPTY_CONDITION }]);
  const [preview, setPreview] = useState<ExceptionPreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateCondition = useCallback((index: number, patch: Partial<ExceptionCondition>) => {
    setConditions((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    setPreview(null);
  }, []);

  const runPreview = useCallback(async () => {
    if (!canManage) return;
    const valid = conditions.filter((item) => item.field.trim() && item.value.trim());
    if (!valid.length) {
      setError('Add at least one field/operator/value condition before previewing impact.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setPreview(await previewExceptionImpact(ruleId, valid));
    } catch (caught) {
      setPreview(null);
      setError(caught instanceof Error ? caught.message : 'Exception preview failed.');
    } finally {
      setLoading(false);
    }
  }, [canManage, conditions, ruleId]);

  return (
    <section className="detection-tuning" aria-label="Rule tuning">
      <header className="detection-tuning__header">
        <SlidersHorizontal size={14} aria-hidden="true" />
        <div>
          <strong>Exception tuning</strong>
          <small>Preview FP suppression impact for {ruleName}. Nothing is persisted from this panel.</small>
        </div>
      </header>

      <p className="detection-tuning__honesty" role="status">
        <ShieldAlert size={13} aria-hidden="true" />
        <span>
          STAGING CANDIDATE — exception <em>activate</em> remains deferred (DET-FP-001). This panel only runs
          read-only impact preview.
        </span>
      </p>

      <div className="detection-tuning__conditions">
        {conditions.map((condition, index) => (
          <div key={`cond-${index}`} className="detection-tuning__row">
            <label>
              <span>Field</span>
              <input
                value={condition.field}
                disabled={!canManage || loading}
                onChange={(event) => updateCondition(index, { field: event.target.value })}
                placeholder="host.name"
                aria-label={`Exception field ${index + 1}`}
              />
            </label>
            <HaCompactSelect
              layout="stacked"
              label="Operator"
              ariaLabel={`Exception operator ${index + 1}`}
              value={condition.operator}
              disabled={!canManage || loading}
              onChange={(value) => updateCondition(index, { operator: value })}
              options={OPERATOR_OPTIONS}
            />
            <label>
              <span>Value</span>
              <input
                value={condition.value}
                disabled={!canManage || loading}
                onChange={(event) => updateCondition(index, { value: event.target.value })}
                placeholder="approved-scanner"
                aria-label={`Exception value ${index + 1}`}
              />
            </label>
            <button
              type="button"
              className="detection-tuning__remove"
              disabled={!canManage || loading || conditions.length === 1}
              aria-label={`Remove condition ${index + 1}`}
              onClick={() => {
                setConditions((current) => current.filter((_, i) => i !== index));
                setPreview(null);
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <div className="detection-tuning__actions">
        <button
          type="button"
          disabled={!canManage || loading}
          title={canManage ? 'Add exception condition' : manageDeniedTitle}
          onClick={() => setConditions((current) => [...current, { ...EMPTY_CONDITION }])}
        >
          <Plus size={13} /> Add condition
        </button>
        <button
          type="button"
          className="detection-primary-button"
          disabled={!canManage || loading}
          title={canManage ? 'Preview exception impact' : manageDeniedTitle}
          onClick={() => void runPreview()}
        >
          {loading ? <LoaderCircle size={14} className="detection-spin" /> : <SlidersHorizontal size={14} />}
          {loading ? 'Previewing…' : 'Preview impact'}
        </button>
      </div>

      {error && (
        <div className="detection-tuning__error" role="alert">
          <AlertTriangle size={13} />
          <span>{error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}>
            <X size={12} />
          </button>
        </div>
      )}

      {preview && (
        <div className="detection-tuning__result" data-high-impact={preview.highImpactWarning}>
          <p className="detection-tuning__mode">{preview.honesty}</p>
          <dl>
            <div>
              <dt>Matching alerts</dt>
              <dd>{preview.matchingHistoricalAlerts.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Projected reduction</dt>
              <dd>{preview.projectedVolumeReduction}%</dd>
            </div>
            <div>
              <dt>Approval</dt>
              <dd>{preview.approvalRequired ? 'Required' : 'Not required'}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{preview.mode}</dd>
            </div>
          </dl>
          {preview.highImpactWarning && (
            <p className="detection-tuning__warn">
              <AlertTriangle size={13} /> High-impact exception — elevated approval recommended.
            </p>
          )}
          {preview.falseNegativeRiskPrompts.length > 0 && (
            <ul>
              {preview.falseNegativeRiskPrompts.map((prompt) => (
                <li key={prompt}>{prompt}</li>
              ))}
            </ul>
          )}
          {preview.affectedTechniques.length > 0 && (
            <div className="detection-drawer__chips" aria-label="Affected MITRE techniques">
              {preview.affectedTechniques.map((technique) => (
                <span key={technique.techniqueId}>
                  {technique.techniqueId}
                  {technique.techniqueName ? ` · ${technique.techniqueName}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
