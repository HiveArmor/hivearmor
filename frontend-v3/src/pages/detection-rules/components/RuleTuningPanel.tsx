/**
 * Rule tuning panel — exception preview + persist/activate (DET-FP-001).
 */

import { useCallback, useEffect, useState } from 'react';

import {
  AlertTriangle, LoaderCircle, Plus, Power, Save, ShieldAlert, SlidersHorizontal, Trash2, X,
} from 'lucide-react';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import {
  listExceptions,
  previewExceptionImpact,
  saveException,
  setExceptionActive,
  type DetectionException,
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
  /** Analyst+ may preview/save drafts */
  canDraft: boolean;
  /** SOC Manager+ may activate/deactivate */
  canActivate: boolean;
  draftDeniedTitle: string;
  activateDeniedTitle: string;
}

export function RuleTuningPanel({
  ruleId,
  ruleName,
  canDraft,
  canActivate,
  draftDeniedTitle,
  activateDeniedTitle,
}: RuleTuningPanelProps): JSX.Element {
  const [conditions, setConditions] = useState<ExceptionCondition[]>([{ ...EMPTY_CONDITION }]);
  const [title, setTitle] = useState(`Exception · ${ruleName}`);
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
      setExceptions(await listExceptions(ruleId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load exceptions.');
    }
  }, [ruleId]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const updateCondition = useCallback((index: number, patch: Partial<ExceptionCondition>) => {
    setConditions((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    setPreview(null);
  }, []);

  const runPreview = useCallback(async () => {
    if (!canDraft) return;
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
  }, [canDraft, conditions, ruleId]);

  const runSave = useCallback(async () => {
    if (!canDraft) return;
    const valid = conditions.filter((item) => item.field.trim() && item.value.trim());
    if (!valid.length) {
      setError('Add at least one condition before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const created = await saveException(ruleId, title, reason, valid);
      setMessage(`Saved draft exception #${created.id}. Activate requires SOC Manager.`);
      await refreshList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to save exception.');
    } finally {
      setSaving(false);
    }
  }, [canDraft, conditions, reason, refreshList, ruleId, title]);

  const toggleActive = useCallback(async (exception: DetectionException) => {
    if (!canActivate) return;
    setTogglingId(exception.id);
    setError(null);
    setMessage(null);
    try {
      const updated = await setExceptionActive(ruleId, exception.id, !exception.active);
      setMessage(updated.active
        ? `Exception #${updated.id} activated (STAGING — runtime enforcement may lag).`
        : `Exception #${updated.id} deactivated.`);
      await refreshList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to update exception.');
    } finally {
      setTogglingId(null);
    }
  }, [canActivate, refreshList, ruleId]);

  return (
    <section className="detection-tuning" aria-label="Rule tuning">
      <header className="detection-tuning__header">
        <SlidersHorizontal size={14} aria-hidden="true" />
        <div>
          <strong>Exception tuning</strong>
          <small>Preview FP impact, save drafts, and activate suppressions for {ruleName}.</small>
        </div>
      </header>

      <p className="detection-tuning__honesty" role="status">
        <ShieldAlert size={13} aria-hidden="true" />
        <span>
          STAGING CANDIDATE — <strong>active</strong> exceptions are enforced by the correlation engine
          (pre-alert suppress via config sync → <code>rules/exceptions/exceptions.yaml</code>).
          Covers CEL single-rule, sequence, graph-offense, and baseline anomaly
          (synthetic <code>ruleId=baseline:anomaly</code> + host/user/dataSource/action conditions);
          shared <code>exceptionsSuppressed</code> counter.
          Draft/inactive rows never suppress. Typical sync lag {'<='}60s.
          Risk scoring is suppressed before score add.
          Pipeline health shows last exception load and suppressed counts when EP is reachable.
        </span>
      </p>

      <div className="detection-tuning__meta">
        <label>
          <span>Title</span>
          <input
            value={title}
            disabled={!canDraft || loading || saving}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Exception title"
          />
        </label>
        <label>
          <span>Reason</span>
          <input
            value={reason}
            disabled={!canDraft || loading || saving}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this false positive suppressed?"
            aria-label="Exception reason"
          />
        </label>
      </div>

      <div className="detection-tuning__conditions">
        {conditions.map((condition, index) => (
          <div key={`cond-${index}`} className="detection-tuning__row">
            <label>
              <span>Field</span>
              <input
                value={condition.field}
                disabled={!canDraft || loading || saving}
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
                aria-label={`Exception value ${index + 1}`}
              />
            </label>
            <button
              type="button"
              className="detection-tuning__remove"
              disabled={!canDraft || loading || saving || conditions.length === 1}
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
          disabled={!canDraft || loading || saving}
          title={canDraft ? 'Add exception condition' : draftDeniedTitle}
          onClick={() => setConditions((current) => [...current, { ...EMPTY_CONDITION }])}
        >
          <Plus size={13} /> Add condition
        </button>
        <button
          type="button"
          disabled={!canDraft || loading || saving}
          title={canDraft ? 'Preview exception impact' : draftDeniedTitle}
          onClick={() => void runPreview()}
        >
          {loading ? <LoaderCircle size={14} className="detection-spin" /> : <SlidersHorizontal size={14} />}
          {loading ? 'Previewing…' : 'Preview impact'}
        </button>
        <button
          type="button"
          className="detection-primary-button"
          disabled={!canDraft || loading || saving}
          title={canDraft ? 'Save exception draft' : draftDeniedTitle}
          onClick={() => void runSave()}
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
        </div>
      )}

      <div className="detection-tuning__list" aria-label="Saved exceptions">
        <header>
          <strong>Saved exceptions</strong>
          <small>{exceptions.length} for this rule</small>
        </header>
        {exceptions.length === 0 ? (
          <p className="detection-tuning__empty">No persisted exceptions yet.</p>
        ) : (
          <ul>
            {exceptions.map((exception) => (
              <li key={String(exception.id)} data-active={exception.active}>
                <div>
                  <strong>{exception.title}</strong>
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
                    ? (exception.active ? 'Deactivate exception' : 'Activate exception')
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
