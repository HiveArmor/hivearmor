/** Governed policy and delegated-authority editor — RESP-020. */
import { useEffect, useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Gavel,
  KeyRound,
  LockKeyhole,
  Save,
  Send,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import {
  RESP_020_DISABLED_TITLE,
  RESP_020_GOVERNANCE,
} from './response.capabilities';
import type {
  ResponseAuthorityDelegateSaveRequest,
  ResponseAuthorityPolicySaveRequest,
} from './response.types';
import {
  fetchResponseGovernance,
  fixtureMode,
  saveResponseAuthorityDelegate,
  saveResponseAuthorityPolicy,
} from './responsePlaybooks.service';

import { AccessDeniedState } from '@/components/access-denied-state/AccessDeniedState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaButton } from '@/components/ha-button/HaButton';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useAuthStore } from '@/store/auth.store';
import './ResponseAuthorityEditorPage.css';

type EditorKind = 'policy' | 'delegation';

const defaultPolicy: ResponseAuthorityPolicySaveRequest = {
  name: '', actionCategory: 'ENDPOINT', riskFloor: 'HIGH', tenantScope: 'All authorized tenants',
  requiredApprovals: 2, approverGroups: ['SOC Managers'], selfApprovalAllowed: false,
  changeWindow: 'Any time', rollbackRequired: true, status: 'MONITOR', changeReason: '', publish: false,
};

const defaultDelegation = (): ResponseAuthorityDelegateSaveRequest => ({
  principal: '', principalType: 'GROUP', authorityTier: 2, actionScopes: ['Endpoint'],
  tenantScope: 'All authorized tenants', validFrom: new Date().toISOString(),
  validUntil: new Date(Date.now() + 24 * 60 * 60_000).toISOString(), emergencyAccess: false,
  status: 'INACTIVE', changeReason: '', publish: false,
});

function localDateTime(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function ResponseAuthorityEditorPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id?: string }>();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const epsStream = useEpsStream();
  const kind: EditorKind = location.pathname.includes('/delegations/') ? 'delegation' : 'policy';
  const isNew = !id;
  const canManage = user?.roles?.some((role) => role === 'ROLE_ADMIN' || role === 'ROLE_SOC_MANAGER') ?? false;
  const [policy, setPolicy] = useState<ResponseAuthorityPolicySaveRequest>(defaultPolicy);
  const [delegation, setDelegation] = useState<ResponseAuthorityDelegateSaveRequest>(defaultDelegation);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const governanceQuery = useQuery({
    queryKey: ['response-governance', 'editor', kind, id],
    queryFn: () => fetchResponseGovernance({ state: 'ALL', risk: 'ALL', limit: 1 }),
    enabled: canManage,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!id || !governanceQuery.data) return;
    if (kind === 'policy') {
      const current = governanceQuery.data.policies.find((item) => item.id === id);
      if (!current) return;
      setPolicy({
        id: current.id, expectedVersion: current.version, name: current.name,
        actionCategory: current.actionCategory, riskFloor: current.riskFloor,
        tenantScope: current.tenantScope, requiredApprovals: current.requiredApprovals,
        approverGroups: current.approverGroups, selfApprovalAllowed: current.selfApprovalAllowed,
        changeWindow: current.changeWindow, rollbackRequired: current.rollbackRequired,
        status: current.status, changeReason: '', publish: false,
      });
    } else {
      const current = governanceQuery.data.delegates.find((item) => item.id === id);
      if (!current) return;
      setDelegation({
        id: current.id, expectedVersion: current.version, principal: current.principal,
        principalType: current.principalType, authorityTier: current.authorityTier,
        actionScopes: current.actionScopes, tenantScope: current.tenantScope,
        validFrom: current.validFrom, validUntil: current.validUntil,
        emergencyAccess: current.emergencyAccess, status: current.status,
        changeReason: '', publish: false,
      });
    }
  }, [governanceQuery.data, id, kind]);

  const errors = useMemo(() => {
    const next: string[] = [];
    if (kind === 'policy') {
      if (policy.name.trim().length < 4) next.push('Policy name must contain at least 4 characters.');
      if (!policy.approverGroups.length) next.push('At least one eligible approver group is required.');
      if (policy.requiredApprovals > policy.approverGroups.length) next.push('Required approvals cannot exceed the configured approver groups.');
      if (policy.selfApprovalAllowed && policy.riskFloor !== 'LOW') next.push('Self approval is unsafe for medium, high, or critical response authority.');
      if (policy.changeReason.trim().length < 12) next.push('A 12-character audit rationale is required.');
    } else {
      if (delegation.principal.trim().length < 3) next.push('A user or group principal is required.');
      if (!delegation.actionScopes.length) next.push('Select at least one governed action scope.');
      if (new Date(delegation.validUntil) <= new Date(delegation.validFrom)) next.push('Delegation expiry must be after its start time.');
      if (delegation.emergencyAccess && delegation.authorityTier < 3) next.push('Emergency authority requires Tier 3.');
      if (delegation.changeReason.trim().length < 12) next.push('A 12-character audit rationale is required.');
    }
    return next;
  }, [delegation, kind, policy]);

  const mutation = useMutation({
    mutationFn: async (publish: boolean) => kind === 'policy'
      ? saveResponseAuthorityPolicy({ ...policy, publish })
      : saveResponseAuthorityDelegate({ ...delegation, publish }),
    onSuccess: async (_, publish) => {
      await queryClient.invalidateQueries({ queryKey: ['response-governance'] });
      setSavedMessage(publish ? 'Published with an immutable audit record.' : 'Draft saved.');
      window.setTimeout(() => navigate('/response/authority?view=policies'), 650);
    },
  });

  if (!canManage) return <section className="gov-edit-page gov-edit-page--center"><AccessDeniedState message="Response governance editing requires SOC Manager or Platform Administrator authority." /></section>;
  if (!fixtureMode && !RESP_020_GOVERNANCE) {
    return (
      <section className="gov-edit-page gov-edit-page--center">
        <ErrorState title="Governance editor unavailable" message={RESP_020_DISABLED_TITLE} onRetry={() => navigate('/response/authority')} />
      </section>
    );
  }
  if (governanceQuery.isError) return <section className="gov-edit-page gov-edit-page--center"><ErrorState title="Could not load governance configuration" message={governanceQuery.error instanceof Error ? governanceQuery.error.message : 'Unexpected error'} onRetry={() => governanceQuery.refetch()} /></section>;

  const title = kind === 'policy' ? `${isNew ? 'Create' : 'Edit'} authority policy` : `${isNew ? 'Create' : 'Edit'} delegation`;
  const changeReason = kind === 'policy' ? policy.changeReason : delegation.changeReason;

  return (
    <section className="gov-edit-page" data-fixture={fixtureMode || undefined}>
      <header className="gov-edit-header">
        <button type="button" className="gov-edit-back" onClick={() => navigate('/response/authority?view=policies')} aria-label="Back to response governance"><ArrowLeft size={17} /></button>
        <span className="gov-edit-mark">{kind === 'policy' ? <Gavel size={18} /> : <KeyRound size={18} />}</span>
        <div><span>Response governance</span><h1>{title}</h1></div>
        <em>{isNew ? 'NEW' : `VERSION ${kind === 'policy' ? policy.expectedVersion ?? '—' : delegation.expectedVersion ?? '—'}`}</em>
        <div className="gov-edit-header__actions">
          <HaButton className="gov-edit-action" variant="secondary" icon={<Save size={14} />} onClick={() => mutation.mutate(false)} isDisabled={errors.length > 0 || mutation.isPending}>Save draft</HaButton>
          <HaButton className="gov-edit-action" variant="primary" icon={<Send size={14} />} onClick={() => mutation.mutate(true)} isDisabled={errors.length > 0 || mutation.isPending}>Validate & publish</HaButton>
        </div>
      </header>

      {fixtureMode && <div className="gov-edit-fixture"><strong>Design fixture:</strong> edits are session-local and never enter production.</div>}

      <main className="gov-edit-workspace">
        <section className="gov-edit-form" aria-label={title}>
          <header><span>1</span><div><strong>{kind === 'policy' ? 'Authority definition' : 'Delegated principal'}</strong><small>Identity, governed scope, and effective state</small></div></header>
          {kind === 'policy' ? (
            <div className="gov-edit-fields">
              <label className="gov-edit-field gov-edit-field--wide"><span>Policy name <em>Required</em></span><input value={policy.name} onChange={(event) => setPolicy({ ...policy, name: event.target.value })} /></label>
              <label className="gov-edit-field"><span>Action category</span><select value={policy.actionCategory} onChange={(event) => setPolicy({ ...policy, actionCategory: event.target.value as ResponseAuthorityPolicySaveRequest['actionCategory'] })}><option>ENDPOINT</option><option>IDENTITY</option><option>NETWORK</option><option>CLOUD</option><option>CASE</option></select></label>
              <label className="gov-edit-field"><span>Risk floor</span><select value={policy.riskFloor} onChange={(event) => setPolicy({ ...policy, riskFloor: event.target.value as ResponseAuthorityPolicySaveRequest['riskFloor'] })}><option>CRITICAL</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></label>
              <label className="gov-edit-field gov-edit-field--wide"><span>Tenant scope</span><input value={policy.tenantScope} onChange={(event) => setPolicy({ ...policy, tenantScope: event.target.value })} /></label>
              <label className="gov-edit-field"><span>Required approvals</span><input type="number" min="1" max="3" value={policy.requiredApprovals} onChange={(event) => setPolicy({ ...policy, requiredApprovals: Number(event.target.value) })} /></label>
              <label className="gov-edit-field"><span>Policy state</span><select value={policy.status} onChange={(event) => setPolicy({ ...policy, status: event.target.value as ResponseAuthorityPolicySaveRequest['status'] })}><option>ENFORCED</option><option>MONITOR</option><option>DISABLED</option></select></label>
              <label className="gov-edit-field gov-edit-field--wide"><span>Eligible approver groups <em>Comma separated</em></span><input value={policy.approverGroups.join(', ')} onChange={(event) => setPolicy({ ...policy, approverGroups: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></label>
              <label className="gov-edit-field gov-edit-field--wide"><span>Change window</span><input value={policy.changeWindow} onChange={(event) => setPolicy({ ...policy, changeWindow: event.target.value })} /></label>
              <label className="gov-edit-check"><input type="checkbox" checked={policy.rollbackRequired} onChange={(event) => setPolicy({ ...policy, rollbackRequired: event.target.checked })} /><span><strong>Rollback required</strong><small>Block execution until recovery guidance is available.</small></span></label>
              <label className="gov-edit-check"><input type="checkbox" checked={policy.selfApprovalAllowed} onChange={(event) => setPolicy({ ...policy, selfApprovalAllowed: event.target.checked })} /><span><strong>Allow self approval</strong><small>Not recommended for disruptive actions.</small></span></label>
            </div>
          ) : (
            <div className="gov-edit-fields">
              <label className="gov-edit-field gov-edit-field--wide"><span>Principal <em>Required</em></span><input value={delegation.principal} onChange={(event) => setDelegation({ ...delegation, principal: event.target.value })} /></label>
              <label className="gov-edit-field"><span>Principal type</span><select value={delegation.principalType} onChange={(event) => setDelegation({ ...delegation, principalType: event.target.value as ResponseAuthorityDelegateSaveRequest['principalType'] })}><option>GROUP</option><option>USER</option></select></label>
              <label className="gov-edit-field"><span>Authority tier</span><select value={delegation.authorityTier} onChange={(event) => setDelegation({ ...delegation, authorityTier: Number(event.target.value) })}><option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option></select></label>
              <label className="gov-edit-field gov-edit-field--wide"><span>Action scopes <em>Comma separated</em></span><input value={delegation.actionScopes.join(', ')} onChange={(event) => setDelegation({ ...delegation, actionScopes: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></label>
              <label className="gov-edit-field gov-edit-field--wide"><span>Tenant scope</span><input value={delegation.tenantScope} onChange={(event) => setDelegation({ ...delegation, tenantScope: event.target.value })} /></label>
              <label className="gov-edit-field"><span>Valid from</span><input type="datetime-local" value={localDateTime(delegation.validFrom)} onChange={(event) => setDelegation({ ...delegation, validFrom: new Date(event.target.value).toISOString() })} /></label>
              <label className="gov-edit-field"><span>Valid until</span><input type="datetime-local" value={localDateTime(delegation.validUntil)} onChange={(event) => setDelegation({ ...delegation, validUntil: new Date(event.target.value).toISOString() })} /></label>
              <label className="gov-edit-field"><span>Delegation state</span><select value={delegation.status} onChange={(event) => setDelegation({ ...delegation, status: event.target.value as ResponseAuthorityDelegateSaveRequest['status'] })}><option>ACTIVE</option><option>EXPIRING</option><option>INACTIVE</option></select></label>
              <label className="gov-edit-check"><input type="checkbox" checked={delegation.emergencyAccess} onChange={(event) => setDelegation({ ...delegation, emergencyAccess: event.target.checked })} /><span><strong>Emergency authority</strong><small>Requires Tier 3 and a time-bounded expiry.</small></span></label>
            </div>
          )}

          <div className="gov-edit-audit">
            <header><span>2</span><div><strong>Immutable audit rationale</strong><small>Recorded with the versioned change</small></div></header>
            <label><span>Reason for change <em>Required · minimum 12 characters</em></span><textarea value={changeReason} maxLength={500} onChange={(event) => kind === 'policy' ? setPolicy({ ...policy, changeReason: event.target.value }) : setDelegation({ ...delegation, changeReason: event.target.value })} placeholder="Explain the operational need, risk, and expected outcome…" /></label>
          </div>
        </section>

        <aside className="gov-edit-review" aria-label="Governance validation">
          <header><ShieldCheck size={15} /><div><strong>Publish readiness</strong><small>Client preflight · backend remains authoritative</small></div></header>
          {errors.length ? <div className="gov-edit-validation" data-state="warning"><AlertTriangle size={17} /><div><strong>{errors.length} validation {errors.length === 1 ? 'issue' : 'issues'}</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div></div> : <div className="gov-edit-validation" data-state="ready"><CheckCircle2 size={17} /><div><strong>Ready for authoritative validation</strong><span>Required fields and local safety checks passed.</span></div></div>}
          <section><h2><LockKeyhole size={14} />Enforced safeguards</h2><ul><li>Optimistic version check prevents stale overwrite.</li><li>Requester and approver separation is evaluated server-side.</li><li>Tenant scope cannot exceed the operator’s authorization.</li><li>Every publish creates an immutable audit event.</li></ul></section>
          <section><h2><UsersRound size={14} />Effective authority</h2><dl><div><dt>Scope</dt><dd>{kind === 'policy' ? policy.tenantScope : delegation.tenantScope}</dd></div><div><dt>Tier</dt><dd>{kind === 'policy' ? `${policy.requiredApprovals} approval${policy.requiredApprovals === 1 ? '' : 's'}` : `Tier ${delegation.authorityTier}`}</dd></div><div><dt>State</dt><dd>{kind === 'policy' ? policy.status : delegation.status}</dd></div></dl></section>
          {mutation.isError && <div className="gov-edit-error" role="alert"><AlertTriangle size={14} />{mutation.error instanceof Error ? mutation.error.message : 'Save failed'}</div>}
          {savedMessage && <div className="gov-edit-success" role="status"><CheckCircle2 size={14} />{savedMessage}</div>}
        </aside>
      </main>

      <footer className="gov-edit-footer"><span><span />Connected</span><span>{fixtureMode ? 'Draft stored in fixture session' : 'Versioned governance configuration'}</span><span>{fixtureMode ? 12840 : epsStream.eps} eps</span></footer>
      <div className="gov-edit-status"><StatusDock sseConnected={fixtureMode || epsStream.connected} eps={fixtureMode ? 12840 : epsStream.eps} mode={fixtureMode ? 'historical' : 'live'} /></div>
    </section>
  );
}
