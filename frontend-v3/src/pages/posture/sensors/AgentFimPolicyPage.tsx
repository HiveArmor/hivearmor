/**
 * Agent FIM Policy Console — Sensors / posture (FE-POL-01 / FE-SEC-01).
 *
 * Authors agent schema v1 into `/api/agent-policies` policyConfig and pushes
 * APPLY_POLICY via group assign + push. STAGING CANDIDATE — dual-plane note
 * vs Ha `/edr/policies` (legacy columns, no push).
 */

import { useCallback, useMemo, useState } from 'react';

import { EmptyState, EmptyStateBody, Spinner } from '@patternfly/react-core';
import { FileSearch } from 'lucide-react';
import { Link } from 'react-router-dom';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaConfirmationModal } from '@/components/ha-confirmation-modal/HaConfirmationModal';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { HaInlineBanner } from '@/components/ha-inline-banner';
import { HaModal } from '@/components/ha-modal/HaModal';
import { HaSwitch } from '@/components/ha-switch/HaSwitch';
import {
  useAgentGroups,
  useAssignPolicyGroup,
  useCreateUtmAgentPolicy,
  useDeleteUtmAgentPolicy,
  usePolicyPushLog,
  usePolicyStates,
  usePushPolicyToGroup,
  useUnassignPolicyGroup,
  useUpdateUtmAgentPolicy,
  useUtmAgentPolicies,
} from '@/hooks/useAgentPoliciesPush';
import { ApiError } from '@/lib/apiClient';
import {
  COLLECTOR_KEYS,
  defaultAgentFimPolicyFormValues,
  formValuesToUtmPolicyDto,
  utmPolicyToFormValues,
  validateAgentFimPolicyForm,
} from '@/lib/agentPolicySchema';
import { showErrorToast, showSuccessToast } from '@/lib/toast';
import {
  AGENT_FIM_POLICY_DUAL_PLANE_NOTE,
  AGENT_FIM_POLICY_HONESTY_BANNER,
  AGENT_FIM_POLICY_JOB_SENTENCE,
  AGENT_GROUPS_ADMIN_ONLY_NOTE,
  AGENT_POLICY_MUTATE_DENIED_TITLE,
  AGENT_POLICY_READ_DENIED_MESSAGE,
  ALLOW_SHELL_MUTATE_HINT,
  canMutateAgentPolicies,
  canReadAgentPolicies,
} from '@/services/agentPoliciesPush.capabilities';
import { useAuthStore } from '@/store/auth.store';
import type {
  AgentFimPolicyFormValues,
  CollectorKey,
  FimWatchRule,
  UtmAgentPolicyDTO,
} from '@/types/agentPolicies';

import './AgentFimPolicyPage.css';

type ModalKind = 'create' | 'edit' | null;

function formatTs(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseExcludeLine(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function excludeToLine(exclude: string[] | undefined): string {
  return (exclude ?? []).join(', ');
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

interface PolicyEditorFormProps {
  values: AgentFimPolicyFormValues;
  onChange: (next: AgentFimPolicyFormValues) => void;
  canMutate: boolean;
  canToggleShell: boolean;
}

function PolicyEditorForm({
  values,
  onChange,
  canMutate,
  canToggleShell,
}: PolicyEditorFormProps): JSX.Element {
  const update = useCallback(
    <K extends keyof AgentFimPolicyFormValues>(key: K, val: AgentFimPolicyFormValues[K]) => {
      onChange({ ...values, [key]: val });
    },
    [onChange, values],
  );

  const updateRule = useCallback(
    (index: number, patch: Partial<FimWatchRule>) => {
      const rules = values.rules.map((r, i) => (i === index ? { ...r, ...patch } : r));
      onChange({ ...values, rules });
    },
    [onChange, values],
  );

  const addRule = (): void => {
    onChange({
      ...values,
      rules: [...values.rules, { path: '', recursive: true, exclude: [] }],
    });
  };

  const removeRule = (index: number): void => {
    const rules = values.rules.filter((_, i) => i !== index);
    onChange({
      ...values,
      rules: rules.length > 0 ? rules : [{ path: '', recursive: true, exclude: [] }],
    });
  };

  const setCollector = (key: CollectorKey, enabled: boolean): void => {
    onChange({
      ...values,
      collectors: { ...values.collectors, [key]: enabled },
    });
  };

  return (
    <div className="agent-fim-policy-page__form">
      <div className="agent-fim-policy-page__field">
        <label htmlFor="fim-policy-name">
          Policy name <span className="agent-fim-policy-page__req">*</span>
        </label>
        <input
          id="fim-policy-name"
          type="text"
          required
          disabled={!canMutate}
          value={values.policyName}
          onChange={(e) => update('policyName', e.target.value)}
        />
      </div>

      <div className="agent-fim-policy-page__field">
        <label htmlFor="fim-policy-desc">Description</label>
        <input
          id="fim-policy-desc"
          type="text"
          disabled={!canMutate}
          value={values.description}
          onChange={(e) => update('description', e.target.value)}
        />
      </div>

      <div className="agent-fim-policy-page__row">
        <div className="agent-fim-policy-page__field">
          <label htmlFor="fim-policy-platform">Platform</label>
          <select
            id="fim-policy-platform"
            disabled={!canMutate}
            value={values.platform}
            onChange={(e) => update('platform', e.target.value)}
          >
            <option value="all">all</option>
            <option value="linux">linux</option>
            <option value="windows">windows</option>
            <option value="macos">macos</option>
          </select>
        </div>
        <div className="agent-fim-policy-page__field">
          <label htmlFor="fim-policy-mode">
            FIM apply mode <span className="agent-fim-policy-page__req">*</span>
          </label>
          <select
            id="fim-policy-mode"
            disabled={!canMutate}
            value={values.fimMode}
            onChange={(e) =>
              update('fimMode', e.target.value === 'replace' ? 'replace' : 'merge')
            }
          >
            <option value="merge">merge (append to platform defaults)</option>
            <option value="replace">replace (policy rules only)</option>
          </select>
        </div>
      </div>

      <fieldset className="agent-fim-policy-page__fieldset" disabled={!canMutate}>
        <legend>FIM include paths</legend>
        <p className="agent-fim-policy-page__hint">
          Each rule is a watch path. Exclude patterns are per-path (comma or newline).
        </p>
        {values.rules.map((rule, index) => (
          <div key={index} className="agent-fim-policy-page__rule">
            <div className="agent-fim-policy-page__rule-row">
              <input
                type="text"
                aria-label={`Include path ${index + 1}`}
                placeholder="/etc"
                value={rule.path}
                onChange={(e) => updateRule(index, { path: e.target.value })}
              />
              <label className="agent-fim-policy-page__check">
                <input
                  type="checkbox"
                  checked={rule.recursive}
                  onChange={(e) => updateRule(index, { recursive: e.target.checked })}
                />
                Recursive
              </label>
              {canMutate && (
                <button
                  type="button"
                  className="agent-fim-policy-page__text-btn"
                  onClick={() => removeRule(index)}
                >
                  Remove
                </button>
              )}
            </div>
            <input
              type="text"
              aria-label={`Exclude patterns for path ${index + 1}`}
              placeholder="Exclude: *.tmp, *.log"
              value={excludeToLine(rule.exclude)}
              onChange={(e) =>
                updateRule(index, { exclude: parseExcludeLine(e.target.value) })
              }
            />
          </div>
        ))}
        {canMutate && (
          <HaButton variant="secondary" onClick={addRule}>
            Add path
          </HaButton>
        )}
      </fieldset>

      <fieldset className="agent-fim-policy-page__fieldset" disabled={!canMutate}>
        <legend>Collectors (desired enablement)</legend>
        <p className="agent-fim-policy-page__hint">
          FIM rules + shell gate hot-apply on agent. Other collectors apply on next agent start.
        </p>
        <div className="agent-fim-policy-page__collectors">
          {COLLECTOR_KEYS.map((key) => (
            <label key={key} className="agent-fim-policy-page__check">
              <input
                type="checkbox"
                checked={values.collectors[key] !== false}
                onChange={(e) => setCollector(key, e.target.checked)}
              />
              {key}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="agent-fim-policy-page__shell">
        <HaSwitch
          id="fim-allow-shell"
          label="Allow remote shell (response.allow_shell)"
          isChecked={values.allowShell}
          isDisabled={!canToggleShell}
          onChange={(checked) => update('allowShell', checked)}
        />
        <p className="agent-fim-policy-page__hint">{ALLOW_SHELL_MUTATE_HINT}</p>
        {!canToggleShell && (
          <p className="agent-fim-policy-page__hint" role="status">
            {AGENT_POLICY_MUTATE_DENIED_TITLE}
          </p>
        )}
      </div>

      <div className="agent-fim-policy-page__field">
        <label className="agent-fim-policy-page__check">
          <input
            type="checkbox"
            disabled={!canMutate}
            checked={values.isActive}
            onChange={(e) => update('isActive', e.target.checked)}
          />
          Policy active
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assign / push drawer
// ---------------------------------------------------------------------------

interface AssignPushDrawerProps {
  policy: UtmAgentPolicyDTO;
  onClose: () => void;
  canMutate: boolean;
  canListGroups: boolean;
}

function AssignPushDrawer({
  policy,
  onClose,
  canMutate,
  canListGroups,
}: AssignPushDrawerProps): JSX.Element {
  const policyId = policy.id ?? null;
  const groupsQuery = useAgentGroups(canListGroups);
  const pushLogQuery = usePolicyPushLog(policyId);
  const statesQuery = usePolicyStates(policyId);
  const assignMutation = useAssignPolicyGroup();
  const unassignMutation = useUnassignPolicyGroup();
  const pushMutation = usePushPolicyToGroup();
  const [manualGroupId, setManualGroupId] = useState('');

  const assigned = policy.assignedGroupIds ?? [];
  const groups = groupsQuery.data ?? [];

  const resolveGroupId = (): number | null => {
    const n = Number.parseInt(manualGroupId.trim(), 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  };

  const onAssign = async (): Promise<void> => {
    if (policyId == null) return;
    const groupId = resolveGroupId();
    if (groupId == null) {
      showErrorToast('Enter a valid group id');
      return;
    }
    try {
      await assignMutation.mutateAsync({ policyId, groupId });
      showSuccessToast(`Assigned group ${groupId}`);
      setManualGroupId('');
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Assign failed');
    }
  };

  const onPush = async (groupId: number): Promise<void> => {
    if (policyId == null) return;
    if (!window.confirm(`Push policy v${policy.versionNum ?? '?'} to group ${groupId}?`)) {
      return;
    }
    try {
      await pushMutation.mutateAsync({ policyId, groupId });
      showSuccessToast(`Push accepted for group ${groupId}`);
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Push failed');
    }
  };

  const onUnassign = async (groupId: number): Promise<void> => {
    if (policyId == null) return;
    try {
      await unassignMutation.mutateAsync({ policyId, groupId });
      showSuccessToast(`Unassigned group ${groupId}`);
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Unassign failed');
    }
  };

  const groupsForbidden =
    groupsQuery.isError &&
    groupsQuery.error instanceof ApiError &&
    groupsQuery.error.status === 403;

  return (
    <HaDrawer
      isOpen
      onClose={onClose}
      title={`Assign & push — ${policy.policyName}`}
    >
      <p className="agent-fim-policy-page__hint">
        Push uses group membership. There is no per-agent push endpoint on this API.
      </p>

      {(groupsForbidden || (!canListGroups && canMutate)) && (
        <p className="agent-fim-policy-page__hint" role="status">
          {AGENT_GROUPS_ADMIN_ONLY_NOTE}
        </p>
      )}

      {canListGroups && groupsQuery.isLoading && (
        <Spinner size="md" aria-label="Loading agent groups" />
      )}

      {canListGroups && !groupsQuery.isError && groups.length > 0 && (
        <div className="agent-fim-policy-page__field">
          <label htmlFor="fim-group-select">Agent group</label>
          <select
            id="fim-group-select"
            value={manualGroupId}
            onChange={(e) => setManualGroupId(e.target.value)}
            disabled={!canMutate}
          >
            <option value="">Select a group…</option>
            {groups.map((g) => (
              <option key={g.id} value={String(g.id ?? '')}>
                {g.groupName} (id {g.id}
                {typeof g.memberCount === 'number' ? `, ${g.memberCount} members` : ''})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="agent-fim-policy-page__field">
        <label htmlFor="fim-group-id">Group id</label>
        <input
          id="fim-group-id"
          type="number"
          min={1}
          disabled={!canMutate}
          value={manualGroupId}
          onChange={(e) => setManualGroupId(e.target.value)}
          placeholder="Numeric group id"
        />
      </div>

      {canMutate && (
        <div className="agent-fim-policy-page__drawer-actions">
          <HaButton
            variant="secondary"
            onClick={() => void onAssign()}
            isDisabled={assignMutation.isPending}
          >
            Assign group
          </HaButton>
          <HaButton
            variant="primary"
            onClick={() => {
              const id = resolveGroupId();
              if (id != null) void onPush(id);
              else showErrorToast('Enter a valid group id');
            }}
            isDisabled={pushMutation.isPending}
          >
            Push to group
          </HaButton>
        </div>
      )}

      <h3 className="agent-fim-policy-page__section-title">Assigned groups</h3>
      {assigned.length === 0 ? (
        <p className="agent-fim-policy-page__hint">No groups assigned.</p>
      ) : (
        <ul className="agent-fim-policy-page__chip-list">
          {assigned.map((gid) => (
            <li key={gid} className="agent-fim-policy-page__chip">
              Group {gid}
              {canMutate && (
                <>
                  <button
                    type="button"
                    className="agent-fim-policy-page__text-btn"
                    onClick={() => void onPush(gid)}
                  >
                    Push
                  </button>
                  <button
                    type="button"
                    className="agent-fim-policy-page__text-btn agent-fim-policy-page__text-btn--danger"
                    onClick={() => void onUnassign(gid)}
                  >
                    Unassign
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3 className="agent-fim-policy-page__section-title">Recent push log</h3>
      {pushLogQuery.isLoading && <Spinner size="sm" aria-label="Loading push log" />}
      {pushLogQuery.isError && (
        <p className="agent-fim-policy-page__hint" role="alert">
          Push log unavailable.
        </p>
      )}
      {!pushLogQuery.isLoading && (pushLogQuery.data?.length ?? 0) === 0 && (
        <p className="agent-fim-policy-page__hint">No push events yet.</p>
      )}
      {(pushLogQuery.data ?? []).slice(0, 12).map((row) => (
        <div key={row.id ?? `${row.agentId}-${row.pushedAt}`} className="agent-fim-policy-page__log-row">
          <span className="agent-fim-policy-page__mono">{row.agentId ?? '—'}</span>
          <span>{row.pushStatus ?? '—'}</span>
          <span>{formatTs(row.pushedAt)}</span>
        </div>
      ))}

      <h3 className="agent-fim-policy-page__section-title">Agent states</h3>
      <p className="agent-fim-policy-page__hint">
        STAGING CANDIDATE — appliedVersion / lastAppliedAt when present; not live-verified
        host proof.
      </p>
      {statesQuery.isLoading && <Spinner size="sm" aria-label="Loading policy states" />}
      {(statesQuery.data ?? []).slice(0, 12).map((st, idx) => (
        <div
          key={st.id ?? `${st.agentId ?? 'agent'}-${idx}`}
          className="agent-fim-policy-page__log-row"
        >
          <span className="agent-fim-policy-page__mono">{st.agentId ?? '—'}</span>
          <span>{st.state ?? '—'}</span>
          <span>
            v{st.appliedVersion ?? '—'} · {formatTs(st.lastAppliedAt)}
          </span>
        </div>
      ))}
      {!statesQuery.isLoading && (statesQuery.data?.length ?? 0) === 0 && (
        <p className="agent-fim-policy-page__hint">No state rows.</p>
      )}
    </HaDrawer>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AgentFimPolicyPage(): JSX.Element {
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const canRead = canReadAgentPolicies(roles);
  const canMutate = canMutateAgentPolicies(roles);
  const canListGroups = roles.includes('ROLE_ADMIN');

  if (!canRead) {
    return (
      <div className="agent-fim-policy-page">
        <div className="agent-fim-policy-page__banner">
          <HaInlineBanner
            variant="danger"
            title="Access denied"
            description={AGENT_POLICY_READ_DENIED_MESSAGE}
            isDismissible={false}
          />
        </div>
      </div>
    );
  }

  return <AgentFimPolicyContent canMutate={canMutate} canListGroups={canListGroups} />;
}

function AgentFimPolicyContent({
  canMutate,
  canListGroups,
}: {
  canMutate: boolean;
  canListGroups: boolean;
}): JSX.Element {
  const { data, isLoading, isError, error } = useUtmAgentPolicies();
  const createMutation = useCreateUtmAgentPolicy();
  const updateMutation = useUpdateUtmAgentPolicy();
  const deleteMutation = useDeleteUtmAgentPolicy();

  const [modalKind, setModalKind] = useState<ModalKind>(null);
  const [editing, setEditing] = useState<UtmAgentPolicyDTO | null>(null);
  const [form, setForm] = useState<AgentFimPolicyFormValues>(defaultAgentFimPolicyFormValues());
  const [deleteTarget, setDeleteTarget] = useState<UtmAgentPolicyDTO | null>(null);
  const [assignTarget, setAssignTarget] = useState<UtmAgentPolicyDTO | null>(null);

  const policies = useMemo(() => data ?? [], [data]);

  const openCreate = (): void => {
    setEditing(null);
    setForm(defaultAgentFimPolicyFormValues());
    setModalKind('create');
  };

  const openEdit = (policy: UtmAgentPolicyDTO): void => {
    setEditing(policy);
    setForm(utmPolicyToFormValues(policy));
    setModalKind('edit');
  };

  const closeModal = (): void => {
    setModalKind(null);
    setEditing(null);
  };

  const onSave = async (): Promise<void> => {
    const errors = validateAgentFimPolicyForm(form);
    if (errors.length > 0) {
      showErrorToast(errors[0] ?? 'Invalid policy');
      return;
    }
    const dto = formValuesToUtmPolicyDto(form);
    try {
      if (modalKind === 'edit' && editing?.id != null) {
        await updateMutation.mutateAsync({ id: editing.id, dto });
        showSuccessToast('Policy updated (version incremented)');
      } else {
        await createMutation.mutateAsync(dto);
        showSuccessToast('Policy created');
      }
      closeModal();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const onConfirmDelete = async (): Promise<void> => {
    if (deleteTarget?.id == null) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      showSuccessToast('Policy deleted');
      setDeleteTarget(null);
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const busy = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="agent-fim-policy-page">
      <div className="agent-fim-policy-page__banner">
        <HaInlineBanner
          variant="warning"
          title="Agent FIM policy push — STAGING CANDIDATE"
          description={AGENT_FIM_POLICY_HONESTY_BANNER}
          isDismissible={false}
        />
      </div>

      <header className="agent-fim-policy-page__header">
        <div className="agent-fim-policy-page__title-block">
          <div className="agent-fim-policy-page__title-row">
            <h1 className="agent-fim-policy-page__title">Agent FIM Policies</h1>
            {!isLoading && (
              <span className="agent-fim-policy-page__count">
                {policies.length.toLocaleString()}{' '}
                {policies.length === 1 ? 'policy' : 'policies'}
              </span>
            )}
            {isLoading && <Spinner size="sm" aria-label="Loading agent policies" />}
          </div>
          <p className="agent-fim-policy-page__job">{AGENT_FIM_POLICY_JOB_SENTENCE}</p>
          <p className="agent-fim-policy-page__dual">{AGENT_FIM_POLICY_DUAL_PLANE_NOTE}</p>
        </div>

        <div className="agent-fim-policy-page__toolbar">
          <nav className="agent-fim-policy-page__links" aria-label="Related views">
            <Link to="/posture/sensors" className="agent-fim-policy-page__link">
              Sensors
            </Link>
            <Link to="/edr/fim" className="agent-fim-policy-page__link">
              FIM dashboard
            </Link>
            <Link to="/edr/policies" className="agent-fim-policy-page__link">
              Ha policies (legacy)
            </Link>
          </nav>
          {canMutate ? (
            <HaButton variant="primary" onClick={openCreate}>
              Create policy
            </HaButton>
          ) : (
            <span className="agent-fim-policy-page__readonly" title={AGENT_POLICY_MUTATE_DENIED_TITLE}>
              Read-only — {AGENT_POLICY_MUTATE_DENIED_TITLE}
            </span>
          )}
        </div>
      </header>

      {isError && (
        <div className="agent-fim-policy-page__error" role="alert">
          {error instanceof Error ? error.message : 'Failed to load agent policies'}
        </div>
      )}

      <div className="agent-fim-policy-page__inventory" role="region" aria-label="Agent FIM policies">
        {isLoading && (
          <div className="agent-fim-policy-page__loading">
            <Spinner size="lg" aria-label="Loading" />
          </div>
        )}

        {!isLoading && !isError && policies.length === 0 && (
          <EmptyState>
            <FileSearch size={40} style={{ opacity: 0.3, marginBottom: 12 }} aria-hidden />
            <EmptyStateBody>
              No agent FIM policies yet. Create a schema v1 policy, assign an agent group, then
              push. Fleet inventory remains on{' '}
              <Link to="/posture/sensors" className="agent-fim-policy-page__link">
                Sensors
              </Link>
              .
            </EmptyStateBody>
          </EmptyState>
        )}

        {!isLoading && policies.length > 0 && (
          <table className="agent-fim-policy-page__table" aria-label="Agent FIM policies">
            <thead>
              <tr>
                <th>Name</th>
                <th>Platform</th>
                <th>Version</th>
                <th>Groups</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id ?? p.policyName}>
                  <td className="agent-fim-policy-page__name" title={p.policyName}>
                    {p.policyName}
                    {p.isActive === false && (
                      <span className="agent-fim-policy-page__inactive"> inactive</span>
                    )}
                  </td>
                  <td>{p.platform ?? '—'}</td>
                  <td className="agent-fim-policy-page__mono">{p.versionNum ?? '—'}</td>
                  <td>{(p.assignedGroupIds ?? []).length}</td>
                  <td>{formatTs(p.updatedAt ?? p.createdAt)}</td>
                  <td>
                    <div className="agent-fim-policy-page__actions">
                      <button
                        type="button"
                        className="agent-fim-policy-page__action"
                        onClick={() => openEdit(p)}
                      >
                        {canMutate ? 'Edit' : 'View'}
                      </button>
                      <button
                        type="button"
                        className="agent-fim-policy-page__action agent-fim-policy-page__action--primary"
                        onClick={() => setAssignTarget(p)}
                      >
                        Assign / Push
                      </button>
                      {canMutate && (
                        <button
                          type="button"
                          className="agent-fim-policy-page__action agent-fim-policy-page__action--danger"
                          onClick={() => setDeleteTarget(p)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <HaModal
        isOpen={modalKind != null}
        onClose={closeModal}
        title={modalKind === 'edit' ? 'Edit agent FIM policy' : 'Create agent FIM policy'}
        width={560}
      >
        <div className="agent-fim-policy-page__modal-body">
          <PolicyEditorForm
            values={form}
            onChange={setForm}
            canMutate={canMutate}
            canToggleShell={canMutate}
          />
          <div className="agent-fim-policy-page__form-footer">
            <HaButton variant="secondary" onClick={closeModal}>
              Cancel
            </HaButton>
            {canMutate && (
              <HaButton variant="primary" onClick={() => void onSave()} isDisabled={busy}>
                {busy ? 'Saving…' : 'Save schema v1'}
              </HaButton>
            )}
          </div>
        </div>
      </HaModal>

      <HaConfirmationModal
        isOpen={deleteTarget != null}
        title="Delete agent policy?"
        message={
          deleteTarget
            ? `Delete “${deleteTarget.policyName}”? This does not reverse policies already applied on hosts.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => void onConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      {assignTarget != null && (
        <AssignPushDrawer
          policy={
            policies.find((p) => p.id === assignTarget.id) ?? assignTarget
          }
          onClose={() => setAssignTarget(null)}
          canMutate={canMutate}
          canListGroups={canListGroups}
        />
      )}
    </div>
  );
}
