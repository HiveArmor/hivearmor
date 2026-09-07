/**
 * DET-FP-002 — compact detection-exception draft from Analyst Queue / alerts triage.
 * Prefills host.name, user.name, and ruleId. Analyst+ save draft; SOC Manager+ activate.
 */

import { useCallback, useEffect, useState } from 'react';

import { AlertTriangle, LoaderCircle, Power, Save, ShieldAlert, SlidersHorizontal } from 'lucide-react';

import {
  listExceptions,
  prefillExceptionDraftFromAlert,
  saveException,
  setExceptionActive,
  validateExceptionConditions,
  type DetectionException,
  type ExceptionDraftAlertSource,
} from '@/services/detectionException.service';

import './AlertExceptionDraftPanel.css';

export interface AlertExceptionDraftPanelProps {
  alert: ExceptionDraftAlertSource;
  canDraft: boolean;
  canActivate: boolean;
  draftDeniedTitle: string;
  activateDeniedTitle: string;
}

export function AlertExceptionDraftPanel({
  alert,
  canDraft,
  canActivate,
  draftDeniedTitle,
  activateDeniedTitle,
}: AlertExceptionDraftPanelProps): JSX.Element {
  const seed = prefillExceptionDraftFromAlert(alert);
  const [title, setTitle] = useState(seed.title);
  const [reason, setReason] = useState(seed.reason);
  const [hostName, setHostName] = useState(seed.hostName ?? '');
  const [userName, setUserName] = useState(seed.userName ?? '');
  const [exceptions, setExceptions] = useState<DetectionException[]>([]);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const next = prefillExceptionDraftFromAlert(alert);
    setTitle(next.title);
    setReason(next.reason);
    setHostName(next.hostName ?? '');
    setUserName(next.userName ?? '');
    setError(null);
    setMessage(null);
  }, [alert]);

  const refreshList = useCallback(async () => {
    if (!seed.ruleId) {
      setExceptions([]);
      return;
    }
    try {
      setExceptions(await listExceptions(seed.ruleId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load exceptions.');
    }
  }, [seed.ruleId]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const runSave = useCallback(async () => {
    if (!canDraft) return;
    if (!seed.ruleId) {
      setError('This alert has no detection ruleId, so an exception cannot be saved.');
      return;
    }
    const conditions = [];
    if (hostName.trim()) conditions.push({ field: 'host.name', operator: 'is', value: hostName.trim() });
    if (userName.trim()) conditions.push({ field: 'user.name', operator: 'is', value: userName.trim() });
    const validationError = validateExceptionConditions(conditions);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const created = await saveException(seed.ruleId, title, reason, conditions);
      setMessage(`Saved draft exception #${created.id}. Activate requires SOC Manager.`);
      await refreshList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to save exception.');
    } finally {
      setSaving(false);
    }
  }, [canDraft, hostName, reason, refreshList, seed.ruleId, title, userName]);

  const toggleActive = useCallback(async (exception: DetectionException) => {
    if (!canActivate || !seed.ruleId) return;
    setTogglingId(exception.id);
    setError(null);
    setMessage(null);
    try {
      const updated = await setExceptionActive(seed.ruleId, exception.id, !exception.active);
      setMessage(updated.active
        ? `Exception #${updated.id} activated (STAGING — sync lag typically ≤60s).`
        : `Exception #${updated.id} deactivated.`);
      await refreshList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to update exception.');
    } finally {
      setTogglingId(null);
    }
  }, [canActivate, refreshList, seed.ruleId]);

  return (
    <section className="aq-exception" aria-label="Detection exception draft">
      <header className="aq-exception__header">
        <SlidersHorizontal size={14} aria-hidden="true" />
        <div>
          <strong>Detection exception draft</strong>
          <small>Prefill host, user, and ruleId from this alert. Analysts save drafts; SOC Managers activate.</small>
        </div>
      </header>

      <p className="aq-exception__honesty" role="status">
        <ShieldAlert size={13} aria-hidden="true" />
        <span>
          STAGING CANDIDATE — draft exceptions never suppress. Activation requires SOC Manager
          or Platform Administrator. Typical engine sync lag {'≤'}60s.
        </span>
      </p>

      <div className="aq-exception__meta">
        <label>
          <span>Rule ID</span>
          <input value={seed.ruleId ?? ''} readOnly aria-label="Exception ruleId" />
        </label>
        <label>
          <span>Title</span>
          <input
            value={title}
            disabled={!canDraft || saving}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Exception title"
          />
        </label>
        <label>
          <span>host.name</span>
          <input
            value={hostName}
            disabled={!canDraft || saving}
            onChange={(event) => setHostName(event.target.value)}
            placeholder="Prefill from alert host"
            aria-label="Exception host.name"
          />
        </label>
        <label>
          <span>user.name</span>
          <input
            value={userName}
            disabled={!canDraft || saving}
            onChange={(event) => setUserName(event.target.value)}
            placeholder="Prefill from alert user"
            aria-label="Exception user.name"
          />
        </label>
        <label>
          <span>Reason</span>
          <input
            value={reason}
            disabled={!canDraft || saving}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this false positive suppressed?"
            aria-label="Exception reason"
          />
        </label>
      </div>

      <div className="aq-exception__actions">
        <button
          type="button"
          className="aq-exception__primary"
          disabled={!canDraft || saving || !seed.ruleId}
          title={canDraft ? (seed.ruleId ? 'Save exception draft' : 'Alert has no ruleId') : draftDeniedTitle}
          onClick={() => void runSave()}
          data-testid="aq-exception-save"
        >
          {saving ? <LoaderCircle size={14} className="aq-exception__spin" /> : <Save size={14} />}
          {saving ? 'Saving…' : 'Save draft'}
        </button>
      </div>

      {error && (
        <div className="aq-exception__error" role="alert">
          <AlertTriangle size={13} />
          <span>{error}</span>
        </div>
      )}

      {message && (
        <div className="aq-exception__message" role="status">
          <span>{message}</span>
        </div>
      )}

      <div className="aq-exception__list" aria-label="Saved exceptions for this rule" data-testid="aq-exception-list">
        <header>
          <strong>Saved exceptions</strong>
          <small>{seed.ruleId ? `${exceptions.length} for ${seed.ruleId}` : 'No ruleId on this alert'}</small>
        </header>
        {!seed.ruleId ? (
          <p className="aq-exception__empty">Exception save requires a detection ruleId on the alert.</p>
        ) : exceptions.length === 0 ? (
          <p className="aq-exception__empty">No persisted exceptions yet.</p>
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
                    ? <LoaderCircle size={13} className="aq-exception__spin" />
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
