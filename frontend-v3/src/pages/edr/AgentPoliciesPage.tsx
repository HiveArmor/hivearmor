/**
 * AgentPoliciesPage — T05 / Prompt 03 UX honesty
 *
 * Agent Policy Management UI at /edr/policies.
 *
 * Honesty boundary (STAGING CANDIDATE / POL-001 / POL-003):
 *   - Assignment is configuration only.
 *   - Enforcement evidence from GET /ha-edr/policies/{id}/enforcement surfaces
 *     AgentPolicyStateDTO fields with unavailable/partial — never fictional green checks.
 *   - Missing appliedVersion/lastAppliedAt ⇒ apply/ack path unavailable (never “enforced on host”).
 *   - Host enforcement is not production-verified; no invented live agent gRPC apply path.
 *
 * Auth: Analyst|SOC Manager|Admin read; Admin|SOC Manager mutate.
 * Cross-links: Sensors (/posture/sensors) fleet; Endpoints (/edr/endpoints) timelines.
 */

import { useCallback, useMemo, useState } from 'react';

import { Alert, EmptyState, EmptyStateBody, Spinner } from '@patternfly/react-core';
import { ClipboardList } from 'lucide-react';
import { Link } from 'react-router-dom';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaConfirmationModal } from '@/components/ha-confirmation-modal/HaConfirmationModal';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { HaInlineBanner } from '@/components/ha-inline-banner';
import { HaModal } from '@/components/ha-modal/HaModal';
import {
  useAgentPolicies,
  useAgentPolicyEnforcementEvidence,
  useAssignAgents,
  useCreateAgentPolicy,
  useDeleteAgentPolicy,
  useUpdateAgentPolicy,
} from '@/hooks/useAgentPolicies';
import {
  AGENT_POLICY_HONESTY_BANNER,
  AGENT_POLICY_JOB_SENTENCE,
  AGENT_POLICY_MUTATE_DENIED_TITLE,
  AGENT_POLICY_READ_DENIED_MESSAGE,
  AGENT_POLICY_READ_ROLES,
  canMutateAgentPolicies,
  hasAgentPolicyApplyAckEvidence,
  isAgentPolicyApplyAckPathAvailable,
} from '@/services/agentPolicy.capabilities';
import { useAuthStore } from '@/store/auth.store';
import type {
  AgentPolicyDTO,
  AgentPolicyEnforcementEvidenceDTO,
  AgentPolicyFormValues,
} from '@/types/edr';

import './AgentPoliciesPage.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OS_TYPES = ['windows', 'linux', 'macos'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function osBadgeClass(osType: string): string {
  if (osType === 'windows') return 'agent-policies-page__os-badge agent-policies-page__os-badge--windows';
  if (osType === 'linux') return 'agent-policies-page__os-badge agent-policies-page__os-badge--linux';
  if (osType === 'macos') return 'agent-policies-page__os-badge agent-policies-page__os-badge--macos';
  return 'agent-policies-page__os-badge agent-policies-page__os-badge--other';
}

function parseAgentIdLines(raw: string): string[] {
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// OS Type badge
// ---------------------------------------------------------------------------

interface OsBadgeProps {
  osType: string;
}

function OsBadge({ osType }: OsBadgeProps): JSX.Element {
  return <span className={osBadgeClass(osType)}>{osType}</span>;
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------

function SkeletonRow(): JSX.Element {
  return (
    <tr role="presentation">
      {[220, 100, 80, 160, 120].map((w, i) => (
        <td key={i}>
          <div role="presentation" className="agent-policies-page__skeleton" style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// PolicyForm (create / edit) — progressive disclosure inside modal only
// ---------------------------------------------------------------------------

interface PolicyFormProps {
  initial: AgentPolicyFormValues;
  onChange: (v: AgentPolicyFormValues) => void;
}

function PolicyForm({ initial, onChange }: PolicyFormProps): JSX.Element {
  const [values, setValues] = useState<AgentPolicyFormValues>(initial);

  const update = useCallback(
    <K extends keyof AgentPolicyFormValues>(key: K, val: AgentPolicyFormValues[K]) => {
      const next: AgentPolicyFormValues = { ...values, [key]: val };
      setValues(next);
      onChange(next);
    },
    [values, onChange],
  );

  const handleFilePathsChange = useCallback(
    (raw: string) => {
      update(
        'filePaths',
        raw
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      );
    },
    [update],
  );

  const handleRegistryPathsChange = useCallback(
    (raw: string) => {
      update(
        'registryPaths',
        raw
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      );
    },
    [update],
  );

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--ha-surface-primary)',
    border: '1px solid var(--ha-border)',
    borderRadius: 'var(--ha-radius-base)',
    color: 'var(--ha-text-primary)',
    fontSize: 13,
    padding: '6px 10px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--ha-text-secondary)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  const fieldStyle: React.CSSProperties = {
    marginBottom: 16,
  };

  return (
    <div>
      <div style={fieldStyle}>
        <label htmlFor="policy-name" style={labelStyle}>
          Policy Name <span style={{ color: 'var(--ha-critical)' }}>*</span>
        </label>
        <input
          id="policy-name"
          type="text"
          required
          value={values.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="e.g. Windows Workstation Policy"
          style={inputStyle}
          aria-required="true"
        />
      </div>

      <div style={fieldStyle}>
        <label htmlFor="policy-os-type" style={labelStyle}>
          OS Type
        </label>
        <select
          id="policy-os-type"
          value={values.osType ?? ''}
          onChange={(e) => update('osType', e.target.value || undefined)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="">-- Select OS --</option>
          {OS_TYPES.map((os) => (
            <option key={os} value={os}>
              {os.charAt(0).toUpperCase() + os.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div style={fieldStyle}>
        <label htmlFor="policy-file-paths" style={labelStyle}>
          File Paths (one per line)
        </label>
        <textarea
          id="policy-file-paths"
          value={(values.filePaths ?? []).join('\n')}
          onChange={(e) => handleFilePathsChange(e.target.value)}
          rows={3}
          placeholder="/etc/passwd&#10;/etc/shadow"
          style={{
            ...inputStyle,
            resize: 'vertical',
            fontFamily: 'var(--ha-font-mono)',
            fontSize: 12,
          }}
        />
      </div>

      {values.osType === 'windows' && (
        <div style={fieldStyle}>
          <label htmlFor="policy-registry-paths" style={labelStyle}>
            Registry Paths (one per line)
          </label>
          <textarea
            id="policy-registry-paths"
            value={(values.registryPaths ?? []).join('\n')}
            onChange={(e) => handleRegistryPathsChange(e.target.value)}
            rows={3}
            placeholder="HKLM\Software&#10;HKLM\SYSTEM\CurrentControlSet"
            style={{
              ...inputStyle,
              resize: 'vertical',
              fontFamily: 'var(--ha-font-mono)',
              fontSize: 12,
            }}
          />
        </div>
      )}

      <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', gap: 12 }}>
        <label
          htmlFor="policy-network-monitor"
          style={{
            fontSize: 13,
            color: 'var(--ha-text-primary)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          Network Monitor
        </label>
        <input
          id="policy-network-monitor"
          type="checkbox"
          checked={values.networkMonitor ?? true}
          onChange={(e) => update('networkMonitor', e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--ha-primary)' }}
          aria-label="Enable network monitoring"
        />
      </div>

      <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', gap: 12 }}>
        <label
          htmlFor="policy-process-monitor"
          style={{
            fontSize: 13,
            color: 'var(--ha-text-primary)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          Process Monitor
        </label>
        <input
          id="policy-process-monitor"
          type="checkbox"
          checked={values.processMonitor ?? true}
          onChange={(e) => update('processMonitor', e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--ha-primary)' }}
          aria-label="Enable process monitoring"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal states
// ---------------------------------------------------------------------------

type PolicyModalState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; policy: AgentPolicyDTO };

type DrawerState =
  | { kind: 'closed' }
  | { kind: 'assign'; policy: AgentPolicyDTO };

// ---------------------------------------------------------------------------
// Default form values
// ---------------------------------------------------------------------------

const DEFAULT_FORM: AgentPolicyFormValues = {
  name: '',
  osType: undefined,
  filePaths: [],
  registryPaths: [],
  networkMonitor: true,
  processMonitor: true,
  assignedAgentIds: [],
};

function policyToFormValues(p: AgentPolicyDTO): AgentPolicyFormValues {
  return {
    name: p.name,
    osType: p.osType,
    filePaths: p.filePaths ?? [],
    registryPaths: p.registryPaths ?? [],
    networkMonitor: p.networkMonitor ?? true,
    processMonitor: p.processMonitor ?? true,
    assignedAgentIds: p.assignedAgentIds ?? [],
  };
}

type SortDir = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function AgentPoliciesPage(): JSX.Element {
  const hasReadAccess = useAuthStore((state) =>
    state.hasAnyRole([...AGENT_POLICY_READ_ROLES]),
  );
  const roles = useAuthStore((state) => state.user?.roles ?? []);
  const canMutate = canMutateAgentPolicies(roles);

  if (!hasReadAccess) {
    return (
      <div
        className="agent-policies-page"
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
        }}
        role="alert"
        aria-label="Access denied"
      >
        <ClipboardList size={40} style={{ opacity: 0.3, color: 'var(--ha-text-secondary)' }} />
        <div
          style={{
            fontSize: 'var(--ha-text-2xl)',
            color: 'var(--ha-text-primary)',
            fontWeight: 600,
          }}
        >
          Access Restricted
        </div>
        <div
          style={{
            fontSize: 'var(--ha-text-base)',
            color: 'var(--ha-text-secondary)',
            textAlign: 'center',
          }}
        >
          {AGENT_POLICY_READ_DENIED_MESSAGE}
        </div>
      </div>
    );
  }

  return <AgentPoliciesContent canMutate={canMutate} />;
}

// ---------------------------------------------------------------------------
// Inner component — only rendered when read role is confirmed.
// ---------------------------------------------------------------------------

function AgentPoliciesContent({ canMutate }: { canMutate: boolean }): JSX.Element {
  const { data, isLoading, isError, error } = useAgentPolicies();
  const createMutation = useCreateAgentPolicy();
  const updateMutation = useUpdateAgentPolicy();
  const deleteMutation = useDeleteAgentPolicy();
  const assignMutation = useAssignAgents();

  const policies: AgentPolicyDTO[] = useMemo(() => data ?? [], [data]);

  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sortedPolicies = useMemo(() => {
    return [...policies].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [policies, sortDir]);

  const toggleSort = useCallback(() => {
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
  }, []);

  const [modalState, setModalState] = useState<PolicyModalState>({ kind: 'closed' });
  const [formValues, setFormValues] = useState<AgentPolicyFormValues>(DEFAULT_FORM);

  const openCreateModal = useCallback(() => {
    setFormValues({ ...DEFAULT_FORM });
    setModalState({ kind: 'create' });
  }, []);

  const openEditModal = useCallback((policy: AgentPolicyDTO) => {
    setFormValues(policyToFormValues(policy));
    setModalState({ kind: 'edit', policy });
  }, []);

  const closeModal = useCallback(() => {
    setModalState({ kind: 'closed' });
  }, []);

  const handleFormChange = useCallback((v: AgentPolicyFormValues) => {
    setFormValues(v);
  }, []);

  const handleModalSave = useCallback(() => {
    if (!formValues.name.trim()) return;

    if (modalState.kind === 'create') {
      createMutation.mutate(formValues as AgentPolicyDTO, {
        onSuccess: () => closeModal(),
      });
    } else if (modalState.kind === 'edit' && modalState.policy.id !== undefined) {
      updateMutation.mutate(
        { id: modalState.policy.id, dto: formValues as AgentPolicyDTO },
        { onSuccess: () => closeModal() },
      );
    }
  }, [formValues, modalState, createMutation, updateMutation, closeModal]);

  const [drawerState, setDrawerState] = useState<DrawerState>({ kind: 'closed' });
  const [assignInput, setAssignInput] = useState<string>('');

  const openAssignDrawer = useCallback((policy: AgentPolicyDTO) => {
    setAssignInput((policy.assignedAgentIds ?? []).join('\n'));
    setDrawerState({ kind: 'assign', policy });
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerState({ kind: 'closed' });
  }, []);

  const enforcementPolicyId =
    drawerState.kind === 'assign' && drawerState.policy.id !== undefined
      ? drawerState.policy.id
      : null;
  const enforcementQuery = useAgentPolicyEnforcementEvidence(enforcementPolicyId);

  const assignedPreviewIds = useMemo(() => parseAgentIdLines(assignInput), [assignInput]);

  const handleAssignSave = useCallback(() => {
    if (!canMutate) return;
    if (drawerState.kind !== 'assign' || drawerState.policy.id === undefined) return;
    assignMutation.mutate(
      { id: drawerState.policy.id, agentIds: parseAgentIdLines(assignInput) },
      { onSuccess: () => closeDrawer() },
    );
  }, [canMutate, drawerState, assignInput, assignMutation, closeDrawer]);

  const [deleteTarget, setDeleteTarget] = useState<AgentPolicyDTO | null>(null);

  const handleDeleteRequest = useCallback((policy: AgentPolicyDTO) => {
    setDeleteTarget(policy);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget || deleteTarget.id === undefined) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }, [deleteTarget, deleteMutation]);

  const handleCancelDelete = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  const errorMessage =
    error instanceof Error
      ? error.message
      : 'An error occurred while loading agent policies.';

  const isModalBusy = createMutation.isPending || updateMutation.isPending;
  const isAssignBusy = assignMutation.isPending;
  const modalTitle = modalState.kind === 'edit' ? 'Edit Policy' : 'Create Policy';

  return (
    <div className="agent-policies-page">
      <div className="agent-policies-page__banner">
        <HaInlineBanner
          variant="info"
          title="Policies assign configuration — not verified host enforcement"
          description={AGENT_POLICY_HONESTY_BANNER}
          isDismissible={false}
        />
      </div>

      <header className="agent-policies-page__header">
        <div className="agent-policies-page__title-block">
          <div className="agent-policies-page__title-row">
            <h1 className="agent-policies-page__title">Agent Policies</h1>
            {!isLoading && (
              <span className="agent-policies-page__count">
                {policies.length.toLocaleString()}{' '}
                {policies.length === 1 ? 'policy' : 'policies'}
              </span>
            )}
            {isLoading && <Spinner size="sm" aria-label="Loading policies" />}
          </div>
          <p className="agent-policies-page__job">{AGENT_POLICY_JOB_SENTENCE}</p>
        </div>

        <div className="agent-policies-page__toolbar">
          <nav className="agent-policies-page__links" aria-label="Related endpoint views">
            <Link to="/posture/sensors" className="agent-policies-page__link">
              Sensors — fleet / enroll
            </Link>
            <Link to="/edr/endpoints" className="agent-policies-page__link">
              Endpoints — timelines
            </Link>
          </nav>
          {canMutate ? (
            <HaButton variant="primary" onClick={openCreateModal}>
              Create Policy
            </HaButton>
          ) : (
            <span
              className="agent-policies-page__readonly"
              title={AGENT_POLICY_MUTATE_DENIED_TITLE}
            >
              Read-only — {AGENT_POLICY_MUTATE_DENIED_TITLE}
            </span>
          )}
        </div>
      </header>

      {isError && (
        <div className="agent-policies-page__error">
          <Alert variant="danger" isInline title="Failed to load agent policies">
            {errorMessage}
          </Alert>
        </div>
      )}

      <div className="agent-policies-page__inventory" aria-label="Agent policy inventory">
        {!isLoading && !isError && policies.length === 0 && (
          <EmptyState>
            <ClipboardList size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
            <EmptyStateBody>
              No agent policies configured yet.
              {canMutate ? (
                <>
                  {' '}
                  Click <strong>Create Policy</strong> to define the first HiveArmor monitoring
                  policy.
                </>
              ) : (
                <> Assignment and enforcement evidence will appear here when policies exist.</>
              )}{' '}
              Fleet enrollment is on{' '}
              <Link to="/posture/sensors" className="agent-policies-page__link">
                Sensors
              </Link>
              ; host context is on{' '}
              <Link to="/edr/endpoints" className="agent-policies-page__link">
                Endpoints
              </Link>
              .
            </EmptyStateBody>
          </EmptyState>
        )}

        {(isLoading || policies.length > 0) && (
          <table className="agent-policies-page__table" aria-label="Agent policies">
            <thead>
              <tr>
                <th
                  className="agent-policies-page__th--sortable"
                  onClick={toggleSort}
                  aria-sort={sortDir === 'asc' ? 'ascending' : 'descending'}
                  role="columnheader"
                >
                  Policy Name{' '}
                  <span style={{ fontSize: 10 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
                </th>
                {['OS Type', 'Assigned Agents', 'Last Updated', 'Actions'].map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                : sortedPolicies.map((policy) => (
                    <PolicyRow
                      key={policy.id ?? policy.name}
                      policy={policy}
                      canMutate={canMutate}
                      onEdit={openEditModal}
                      onAssign={openAssignDrawer}
                      onDelete={handleDeleteRequest}
                    />
                  ))}
            </tbody>
          </table>
        )}
      </div>

      <HaModal
        isOpen={modalState.kind !== 'closed'}
        onClose={closeModal}
        title={modalTitle}
        width={520}
      >
        <div style={{ padding: '16px 0 0' }}>
          <PolicyForm initial={formValues} onChange={handleFormChange} />
          <div className="agent-policies-page__form-footer">
            <HaButton variant="secondary" onClick={closeModal} isDisabled={isModalBusy}>
              Cancel
            </HaButton>
            <HaButton
              variant="primary"
              onClick={handleModalSave}
              isDisabled={isModalBusy || !formValues.name.trim()}
            >
              {isModalBusy ? 'Saving…' : 'Save Policy'}
            </HaButton>
          </div>
        </div>
      </HaModal>

      <HaDrawer
        isOpen={drawerState.kind === 'assign'}
        onClose={closeDrawer}
        title={canMutate ? 'Assign Agents' : 'Enforcement evidence'}
        subtitle={drawerState.kind === 'assign' ? drawerState.policy.name : undefined}
        width={440}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
            <HaButton variant="secondary" onClick={closeDrawer} isDisabled={isAssignBusy}>
              {canMutate ? 'Cancel' : 'Close'}
            </HaButton>
            {canMutate && (
              <HaButton variant="primary" onClick={handleAssignSave} isDisabled={isAssignBusy}>
                {isAssignBusy ? 'Saving…' : 'Save'}
              </HaButton>
            )}
          </div>
        }
      >
        <div>
          <EnforcementEvidencePanel
            evidence={enforcementQuery.data}
            isLoading={enforcementQuery.isLoading}
            isError={enforcementQuery.isError}
            error={enforcementQuery.error}
          />

          <div className="agent-policies-page__assign-summary">
            <span className="agent-policies-page__assign-count">
              {assignedPreviewIds.length} assigned (config)
            </span>
            <Link to="/edr/endpoints" className="agent-policies-page__link">
              Open Endpoints for host context
            </Link>
          </div>

          {assignedPreviewIds.length > 0 && (
            <div
              className="agent-policies-page__assign-chips"
              aria-label="Assigned agent ids"
            >
              {assignedPreviewIds.map((id) => (
                <span key={id} className="agent-policies-page__assign-chip" title={id}>
                  {id}
                </span>
              ))}
            </div>
          )}

          {canMutate ? (
            <>
              <p className="agent-policies-page__assign-hint">
                Enter one agent ID per line. Assignment updates configuration only — it does not
                prove host enforcement. Confirm host context on Endpoints.
              </p>
              <label
                htmlFor="assign-agent-ids"
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--ha-text-secondary)',
                  marginBottom: 6,
                }}
              >
                Agent IDs
              </label>
              <textarea
                id="assign-agent-ids"
                value={assignInput}
                onChange={(e) => setAssignInput(e.target.value)}
                rows={8}
                placeholder={'20\n19'}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: 'var(--ha-surface-primary)',
                  border: '1px solid var(--ha-border)',
                  borderRadius: 'var(--ha-radius-base)',
                  color: 'var(--ha-text-primary)',
                  fontSize: 12,
                  fontFamily: 'var(--ha-font-mono)',
                  padding: '8px 10px',
                  resize: 'vertical',
                  outline: 'none',
                }}
                aria-label="Agent IDs to assign (one per line)"
              />
            </>
          ) : (
            <p className="agent-policies-page__assign-hint">
              {AGENT_POLICY_MUTATE_DENIED_TITLE}. You can review enforcement evidence only.
            </p>
          )}
        </div>
      </HaDrawer>

      <HaConfirmationModal
        isOpen={deleteTarget !== null}
        title="Delete Policy"
        message={
          deleteTarget
            ? `Are you sure you want to delete the policy "${deleteTarget.name}"? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enforcement evidence panel (POL-001 / POL-003)
// ---------------------------------------------------------------------------

interface EnforcementEvidencePanelProps {
  evidence: AgentPolicyEnforcementEvidenceDTO | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

function EnforcementEvidencePanel({
  evidence,
  isLoading,
  isError,
  error,
}: EnforcementEvidencePanelProps): JSX.Element {
  if (isLoading) {
    return (
      <div role="status" aria-label="Loading enforcement evidence" style={{ marginBottom: 8 }}>
        <Spinner size="sm" />{' '}
        <span style={{ fontSize: 12, color: 'var(--ha-text-secondary)' }}>
          Loading enforcement evidence…
        </span>
      </div>
    );
  }

  if (isError) {
    const message =
      error instanceof Error ? error.message : 'Enforcement evidence request failed.';
    return (
      <Alert variant="warning" isInline title="Enforcement evidence unavailable">
        {message}
      </Alert>
    );
  }

  if (!evidence) {
    return (
      <p style={{ fontSize: 12, color: 'var(--ha-text-secondary)', marginTop: 0 }}>
        Enforcement evidence not loaded.
      </p>
    );
  }

  const applyAckAvailable = isAgentPolicyApplyAckPathAvailable(evidence);
  const availabilityClass =
    evidence.evidenceAvailability === 'partial'
      ? 'agent-policies-page__evidence-label agent-policies-page__evidence-label--partial'
      : 'agent-policies-page__evidence-label agent-policies-page__evidence-label--unavailable';

  return (
    <section className="agent-policies-page__evidence" aria-label="Policy enforcement evidence">
      <div className={availabilityClass}>Evidence: {evidence.evidenceAvailability}</div>
      <div
        role="status"
        aria-label="Apply ack path status"
        className={
          applyAckAvailable
            ? 'agent-policies-page__apply-ack agent-policies-page__apply-ack--present'
            : 'agent-policies-page__apply-ack agent-policies-page__apply-ack--missing'
        }
      >
        {applyAckAvailable
          ? 'Apply/ack fields present (not LIVE VERIFIED)'
          : 'Apply/ack path unavailable'}
      </div>
      <p className="agent-policies-page__evidence-note">{evidence.honestyNote}</p>
      <div style={{ fontSize: 12, color: 'var(--ha-text-secondary)', marginBottom: 8 }}>
        Assigned agents (config): {(evidence.assignedAgentIds ?? []).length}
      </div>
      {(evidence.agentStates ?? []).length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--ha-text-secondary)', margin: 0 }}>
          No agent-reported appliedVersion / ack rows for this policy id. Apply/ack path
          unavailable — never treat as enforced on host.
        </p>
      ) : (
        <table
          className="agent-policies-page__evidence-table"
          aria-label="Agent policy state rows"
        >
          <thead>
            <tr>
              {[
                'Agent',
                'Applied',
                'Desired',
                'State',
                'Last applied',
                'Last checked',
                'Drift',
                'Apply/ack',
              ].map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {evidence.agentStates.map((row, idx) => {
              const rowHasAck = hasAgentPolicyApplyAckEvidence(row);
              return (
                <tr key={row.id ?? `${row.agentId ?? 'agent'}-${idx}`}>
                  <td>{row.agentId ?? '—'}</td>
                  <td>{row.appliedVersion ?? '—'}</td>
                  <td>{row.desiredVersion ?? '—'}</td>
                  <td>{row.state ?? '—'}</td>
                  <td style={{ color: 'var(--ha-text-secondary)' }}>
                    {row.lastAppliedAt ? formatTimestamp(row.lastAppliedAt) : '—'}
                  </td>
                  <td style={{ color: 'var(--ha-text-secondary)' }}>
                    {row.lastCheckedAt ? formatTimestamp(row.lastCheckedAt) : '—'}
                  </td>
                  <td
                    style={{
                      color: 'var(--ha-text-secondary)',
                      maxWidth: 120,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={row.driftDetails ?? undefined}
                  >
                    {row.driftDetails?.trim() ? row.driftDetails : '—'}
                  </td>
                  <td
                    style={{
                      color: rowHasAck ? 'var(--ha-high)' : 'var(--ha-text-secondary)',
                      fontWeight: 600,
                    }}
                  >
                    {rowHasAck ? 'fields present' : 'unavailable'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// PolicyRow
// ---------------------------------------------------------------------------

interface PolicyRowProps {
  policy: AgentPolicyDTO;
  canMutate: boolean;
  onEdit: (policy: AgentPolicyDTO) => void;
  onAssign: (policy: AgentPolicyDTO) => void;
  onDelete: (policy: AgentPolicyDTO) => void;
}

function PolicyRow({
  policy,
  canMutate,
  onEdit,
  onAssign,
  onDelete,
}: PolicyRowProps): JSX.Element {
  const assignedCount = (policy.assignedAgentIds ?? []).length;
  const lastUpdated = policy.updatedAt ?? policy.createdAt;

  return (
    <tr className="agent-policies-page__row">
      <td className="agent-policies-page__name" title={policy.name}>
        {policy.name}
      </td>

      <td>
        {policy.osType ? (
          <OsBadge osType={policy.osType} />
        ) : (
          <span style={{ color: 'var(--ha-text-secondary)', fontSize: 12, fontStyle: 'italic' }}>
            —
          </span>
        )}
      </td>

      <td>
        <div className="agent-policies-page__assigned">
          <span className="agent-policies-page__assigned-count">{assignedCount}</span>
          {assignedCount > 0 && (
            <Link
              to="/edr/endpoints"
              className="agent-policies-page__link agent-policies-page__link--muted"
              aria-label={`View ${assignedCount} assigned hosts on Endpoints`}
              title="Assigned count is configuration only — open Endpoints for host context"
              onClick={(event) => event.stopPropagation()}
            >
              Hosts
            </Link>
          )}
        </div>
      </td>

      <td className="agent-policies-page__mono">
        {lastUpdated ? formatTimestamp(lastUpdated) : '—'}
      </td>

      <td>
        <div className="agent-policies-page__actions">
          {canMutate && (
            <button
              type="button"
              className="agent-policies-page__action"
              onClick={() => onEdit(policy)}
              aria-label={`Edit policy ${policy.name}`}
            >
              Edit
            </button>
          )}
          <button
            type="button"
            className="agent-policies-page__action agent-policies-page__action--primary"
            onClick={() => onAssign(policy)}
            aria-label={
              canMutate
                ? `Assign agents to policy ${policy.name}`
                : `View enforcement evidence for policy ${policy.name}`
            }
          >
            {canMutate ? 'Assign / Evidence' : 'Evidence'}
          </button>
          {canMutate && (
            <button
              type="button"
              className="agent-policies-page__action agent-policies-page__action--danger"
              onClick={() => onDelete(policy)}
              aria-label={`Delete policy ${policy.name}`}
            >
              Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
