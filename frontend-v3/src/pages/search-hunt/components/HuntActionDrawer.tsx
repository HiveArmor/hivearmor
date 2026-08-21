import { useEffect, useRef, useState } from 'react';

import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, ShieldCheck, X } from 'lucide-react';

import { executeHuntAction, searchHuntFixtureMode } from '../searchHunt.service';
import type { HuntActionRequest } from '../searchHunt.types';

interface HuntActionDrawerProps {
  mode: HuntActionRequest['type'] | null;
  eventIds: string[];
  searchId: string;
  onClose: () => void;
}

const labels: Record<HuntActionRequest['type'], { title: string; action: string; description: string }> = {
  add_evidence: { title: 'Add evidence to incident', action: 'Add evidence', description: 'Attach authorized immutable event references to an existing incident.' },
  create_investigation: { title: 'Create investigation', action: 'Create investigation', description: 'Start a collaborative investigation with the selected events as its initial scope.' },
  create_incident: { title: 'Create incident', action: 'Create incident', description: 'Promote the selected events into a tracked incident after backend authorization.' },
};

export function HuntActionDrawer({ mode, eventIds, searchId, onClose }: HuntActionDrawerProps): JSX.Element | null {
  const [title, setTitle] = useState('');
  const [incidentId, setIncidentId] = useState('');
  const [reason, setReason] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const mutation = useMutation({ mutationFn: executeHuntAction });

  useEffect(() => {
    if (!mode) return;
    setTitle(mode === 'create_incident' ? 'Hunt investigation — suspicious activity' : 'Threat hunt follow-up');
    setIncidentId('');
    setReason('');
    mutation.reset();
    closeRef.current?.focus();
  // mutation is intentionally excluded; reset identity changes between renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  if (!mode) return null;
  const copy = labels[mode];
  const valid = eventIds.length > 0 && reason.trim().length >= 8 && (mode !== 'add_evidence' || incidentId.trim().length > 0) && (mode === 'add_evidence' || title.trim().length > 0);

  const submit = (): void => {
    mutation.mutate({ type: mode, eventIds, searchId, title: title.trim() || undefined, incidentId: incidentId.trim() || undefined, reason: reason.trim() });
  };

  return (
    <aside className="hunt-action-drawer" role="dialog" aria-modal="true" aria-labelledby="hunt-action-title">
      <header><div><span>INVESTIGATION WORKFLOW</span><h2 id="hunt-action-title">{copy.title}</h2></div><button ref={closeRef} type="button" onClick={onClose} aria-label={`Close ${copy.title}`}><X size={17} /></button></header>
      <div className="hunt-action-drawer__body">
        {searchHuntFixtureMode && <div className="hunt-action-notice"><ShieldCheck size={15} /><span><strong>Simulation only.</strong> No incident or evidence is changed in fixture mode.</span></div>}
        <p>{copy.description}</p>
        <div className="hunt-action-scope"><strong>{eventIds.length}</strong><span>selected event{eventIds.length === 1 ? '' : 's'}</span><small>Server revalidates tenant, permissions, retention, and snapshot membership.</small></div>
        {mode === 'add_evidence' ? <label><span>Incident ID</span><input value={incidentId} onChange={(event) => setIncidentId(event.target.value)} placeholder="INC-2026-00418" autoFocus /></label> : <label><span>{mode === 'create_incident' ? 'Incident title' : 'Investigation name'}</span><input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></label>}
        <label><span>Analyst reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe why these events belong in this workflow…" rows={4} /></label>
        <div className="hunt-action-guardrails"><strong>Before execution</strong><ul><li>Only event references from this authorized search snapshot are submitted.</li><li>Field-level redactions and chain-of-custody metadata remain intact.</li><li>The backend returns an audit ID for every successful mutation.</li></ul></div>
        {mutation.isError && <div className="hunt-action-error" role="alert">The workflow could not be completed. No partial success was reported.</div>}
        {mutation.data && <div className="hunt-action-success" role="status"><CheckCircle2 size={16} /><span><strong>Workflow completed</strong><small>{mutation.data.targetId} · {mutation.data.auditId}</small></span></div>}
      </div>
      <footer><button type="button" className="hunt-button hunt-button--primary" disabled={!valid || mutation.isPending || mutation.isSuccess} onClick={submit}>{mutation.isPending ? 'Submitting…' : copy.action}</button><button type="button" className="hunt-button" onClick={onClose}>{mutation.isSuccess ? 'Done' : 'Cancel'}</button></footer>
    </aside>
  );
}
