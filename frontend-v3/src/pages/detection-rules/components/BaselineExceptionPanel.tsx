/**
 * Baseline anomaly exception authoring — binds ruleId to baseline:anomaly (DET-FP).
 */

import { useCallback, useEffect, useState } from 'react';

import {
  AlertTriangle, LoaderCircle, Plus, Power, Save, ShieldAlert, SlidersHorizontal, Trash2, X,
} from 'lucide-react';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import {
  BASELINE_ANOMALY_RULE_ID,
  BASELINE_CONDITION_FIELD_OPTIONS,
  EXCEPTION_OPERATOR_OPTIONS,
  listExceptions,
  previewExceptionImpact,
  saveException,
  setExceptionActive,
  validateExceptionConditions,
  type DetectionException,
  type ExceptionCondition,
  type ExceptionPreviewResult,
} from '@/services/detectionException.service';

const EMPTY_CONDITION: ExceptionCondition = {
  field: 'host.name',
  operator: 'is',
  value: '',
};

const FIELD_OPTIONS = BASELINE_CONDITION_FIELD_OPTIONS.map((item) => ({
  value: item.value,
  label: item.label,
}));

const OPERATOR_OPTIONS = EXCEPTION_OPERATOR_OPTIONS.map((item) => ({
  value: item.value,
  label: item.label,
}));

export interface BaselineExceptionPanelProps {
  /** Analyst+ may preview/save drafts */
  canDraft: boolean;
  /** SOC Manager+ may activate/deactivate */
  canActivate: boolean;
  draftDeniedTitle: string;
  activateDeniedTitle: string;
}

export function BaselineExceptionPanel({
  canDraft,
  canActivate,
  draftDeniedTitle,
  activateDeniedTitle,
}: BaselineExceptionPanelProps): JSX.Element {
  const [conditions, setConditions] = useState<ExceptionCondition[]>([{ ...EMPTY_CONDITION }]);
  const [title, setTitle] = useState('Baseline anomaly exception');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<ExceptionPreviewResult | null>(null);
  const [exceptions, setExceptions] = useState<DetectionException[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    try {
      setExceptions(await listExceptions(BASELINE_ANOMALY_RULE_ID));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load baseline exceptions.');
    }
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const updateCondition = useCallback((index: number, patch: Partial<ExceptionCondition>) => {
    setConditions((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    setPreview(null);
  }, []);

  const runPreview = useCallback(async () => {
    if (!canDraft) return;
    const validationError = validateExceptionConditions(conditions);
    if (validationError) {
      setError(validationError);
      return;
    }
    const valid = conditions.filter((item) => item.field.trim() && item.value.trim());
    setLoading(true);
    setError(null);
    try {
      setPreview(await previewExceptionImpact(BASELINE_ANOMALY_RULE_ID, valid));
    } catch (caught) {
      setPreview(null);
      setError(caught instanceof Error ? caught.message : 'Exception preview failed.');
    } finally {
      setLoading(false);
    }
  }, [canDraft, conditions]);

  const runSave = useCallback(async () => {
    if (!canDraft) return;
    const validationError = validateExceptionConditions(conditions);
    if (validationError) {
      setError(validationError);
      return;
    }
    const valid = conditions.filter((item) => item.field.trim() && item.value.trim());
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const created = await saveException(BASELINE_ANOMALY_RULE_ID, title, reason, valid);
      setMessage(`Saved draft baseline exception #${created.id}. Activate requires SOC Manager.`);
      setConditions([{ ...EMPTY_CONDITION }]);
      setReason('');
      await refreshList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to save baseline exception.');
    } finally {
      setSaving(false);
    }
  }, [canDraft, conditions, reason, refreshList, title]);

  const toggleActive = useCallback(async (exception: DetectionException) => {
    if (!canActivate) return;
    setTogglingId(exception.id);
    setError(null);
    setMessage(null);
    try {
      const updated = await setExceptionActive(BASELINE_ANOMALY_RULE_ID, exception.id, !exception.active);
      setMessage(updated.active
        ? `Baseline exception #${updated.id} activated (STAGING — sync lag typically ≤60s).`
        : `Baseline exception #${updated.id} deactivated.`);
      await refreshList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to update baseline exception.');
    } finally {
      setTogglingId(null);
    }
  }, [canActivate, refreshList]);

  return (
    <section className="detection-tuning detection-baseline-tuning" aria-label="Baseline anomaly exception authoring">
      <header className="detection-tuning__header">
        <SlidersHorizontal size={14} aria-hidden="true" />
        <div>
          <strong>Baseline anomaly exceptions</strong>
          <small>
            Author suppressions for statistical baseline anomalies without editing YAML.
            Bound to synthetic <code>{BASELINE_ANOMALY_RULE_ID}</code>.
          </small>
        </div>
        <span className="detection-baseline-tuning__badge" title="Synthetic engine ruleId">
          {BASELINE_ANOMALY_RULE_ID}
        </span>
      </header>

      <p className="detection-tuning__honesty" role="status">
        <ShieldAlert size={13} aria-hidden="true" />
        <span>
          STAGING CANDIDATE — <strong>active</strong> exceptions sync via config plugin to
          {' '}<code>rules/exceptions/exceptions.yaml</code> and suppress baseline anomaly alerts
          pre-emit (engine key <code>{BASELINE_ANOMALY_RULE_ID}</code>).
          Recommended condition fields: <code>host.name</code>, <code>user.name</code>,
          {' '}<code>dataSource</code>, <code>action</code> with operators
          {' '}<code>is</code> / <code>is_not</code> / <code>contains</code> / <code>starts_with</code> /
          {' '}<code>ends_with</code> / <code>in</code>.
          Draft/inactive rows never suppress. Typical sync lag {'≤'}60s.
        </span>
      </p>

      <div className="detection-tuning__meta">
        <label>
          <span>Bound ruleId</span>
          <input
            value={BASELINE_ANOMALY_RULE_ID}
            readOnly
            aria-label="Baseline exception ruleId"
            className="detection-baseline-tuning__bound"
          />
        </label>
        <label>
          <span>Title</span>
          <input
            value={title}
            disabled={!canDraft || loading || saving}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Baseline exception title"
          />
        </label>
        <label>
          <span>Reason</span>
          <input
            value={reason}
            disabled={!canDraft || loading || saving}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this baseline FP suppressed?"
            aria-label="Baseline exception reason"
          />
        </label>
      </div>

      <div className="detection-tuning__conditions" data-testid="baseline-exception-conditions">
        {conditions.map((condition, index) => (
          <div key={`baseline-cond-${index}`} className="detection-tuning__row">
            <HaCompactSelect
              layout="stacked"
              label="Field"
              ariaLabel={`Baseline exception field ${index + 1}`}
              value={condition.field}
              disabled={!canDraft || loading || saving}
              onChange={(value) => updateCondition(index, { field: value })}
              options={FIELD_OPTIONS}
            />
            <HaCompactSelect
              layout="stacked"
              label="Operator"
              ariaLabel={`Baseline exception operator ${index + 1}`}
              value={condition.operator}
              disabled={!canDraft || loading || saving}
              onChange={(value) => updateCondition(index, { operator: value })}
              options={OPERATOR_OPTIONS}
            />
            <label>
              <span>Value</span>
              <input
                value={condition.value}
                disabled={!canDraft || loading || saving}
                onChange={(event) => updateCondition(index, { value: event.target.value })}
                placeholder="approved-scanner"
                aria-label={`Baseline exception value ${index + 1}`}
              />
            </label>
            <button
              type="button"
              className="detection-tuning__remove"
              disabled={!canDraft || loading || saving || conditions.length === 1}
              aria-label={`Remove baseline condition ${index + 1}`}
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
          disabled={!canDraft || loading || saving}
          title={canDraft ? 'Add baseline exception condition' : draftDeniedTitle}
          onClick={() => setConditions((current) => [...current, { ...EMPTY_CONDITION }])}
        >
          <Plus size={13} /> Add condition
        </button>
        <button
          type="button"
          disabled={!canDraft || loading || saving}
          title={canDraft ? 'Preview baseline exception impact' : draftDeniedTitle}
          onClick={() => void runPreview()}
        >
          {loading ? <LoaderCircle size={14} className="detection-spin" /> : <SlidersHorizontal size={14} />}
          {loading ? 'Previewing…' : 'Preview impact'}
        </button>
        <button
          type="button"
          className="detection-primary-button"
          disabled={!canDraft || loading || saving}
          title={canDraft ? 'Save baseline exception draft' : draftDeniedTitle}
          onClick={() => void runSave()}
          data-testid="baseline-exception-save"
        >
          {saving ? <LoaderCircle size={14} className="detection-spin" /> : <Save size={14} />}
          {saving ? 'Saving…' : 'Save draft'}
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

      {message && (
        <div className="detection-tuning__message" role="status">
          <span>{message}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setMessage(null)}>
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
              <AlertTriangle size={13} /> High-impact baseline exception — elevated approval recommended.
            </p>
          )}
          {preview.falseNegativeRiskPrompts.length > 0 && (
            <ul>
              {preview.falseNegativeRiskPrompts.map((prompt) => (
                <li key={prompt}>{prompt}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="detection-tuning__list" aria-label="Baseline-scoped exceptions" data-testid="baseline-exception-list">
        <header>
          <strong>Baseline-scoped exceptions</strong>
          <small>{exceptions.length} with ruleId {BASELINE_ANOMALY_RULE_ID}</small>
        </header>
        {exceptions.length === 0 ? (
          <p className="detection-tuning__empty">No baseline exceptions yet.</p>
        ) : (
          <ul>
            {exceptions.map((exception) => (
              <li key={String(exception.id)} data-active={exception.active}>
                <div>
                  <strong>
                    {exception.title}
                    <span className="detection-baseline-tuning__chip">baseline</span>
                  </strong>
                  <small>
                    #{exception.id} · {exception.status}
                    {exception.conditions[0]
                      ? ` · ${exception.conditions[0].field} ${exception.conditions[0].operator} ${exception.conditions[0].value}`
                      : ''}
                  </small>
                </div>
                <button
                  type="button"
                  disabled={!canActivate || togglingId === exception.id}
                  title={canActivate
                    ? (exception.active ? 'Deactivate baseline exception' : 'Activate baseline exception')
                    : activateDeniedTitle}
                  onClick={() => void toggleActive(exception)}
                >
                  {togglingId === exception.id
                    ? <LoaderCircle size={13} className="detection-spin" />
                    : <Power size={13} />}
                  {exception.active ? 'Disable' : 'Enable'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
