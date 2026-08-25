/**
 * AgentPoliciesPage — T05
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
 */

import { useCallback, useMemo, useState } from 'react';

import { Alert, EmptyState, EmptyStateBody, Spinner } from '@patternfly/react-core';
import { ClipboardList } from 'lucide-react';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaConfirmationModal } from '@/components/ha-confirmation-modal/HaConfirmationModal';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { HaModal } from '@/components/ha-modal/HaModal';
import {
  useAgentPolicies,
  useAgentPolicyEnforcementEvidence,
  useAssignAgents,
  useCreateAgentPolicy,
  useDeleteAgentPolicy,
  useUpdateAgentPolicy,
} from '@/hooks/useAgentPolicies';
import { resolveHaToken } from '@/hooks/useHaThemeTokens';
import {
  AGENT_POLICY_HONESTY_BANNER,
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

function resolveOsBadgeColour(osType: string): string {
  if (osType === 'windows') return resolveHaToken('--ha-medium');
  if (osType === 'linux') return resolveHaToken('--ha-positive');
  if (osType === 'macos') return resolveHaToken('--ha-primary');
  return resolveHaToken('--ha-text-secondary');
}

// ---------------------------------------------------------------------------
// OS Type badge
// ---------------------------------------------------------------------------

interface OsBadgeProps {
  osType: string;
}

function OsBadge({ osType }: OsBadgeProps): JSX.Element {
  const bg = resolveOsBadgeColour(osType);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        background: bg,
        color: 'var(--ha-background)',
        lineHeight: '20px',
      }}
    >
      {osType}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Numeric badge (Assigned Agents count)
// ---------------------------------------------------------------------------

interface CountBadgeProps {
  count: number;
}

function CountBadge({ count }: CountBadgeProps): JSX.Element {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 8px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        background: 'var(--ha-surface-raised)',
        border: '1px solid var(--ha-border)',
        color: 'var(--ha-text-primary)',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: '20px',
        minWidth: 28,
        textAlign: 'center',
      }}
    >
      {count}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------

function SkeletonRow(): JSX.Element {
  return (
    <tr role="presentation">
      {[220, 100, 80, 160, 120].map((w, i) => (
        <td key={i} style={{ padding: '8px 12px' }}>
          <div
            role="presentation"
            style={{
              height: 14,
              width: w,
              maxWidth: '100%',
              background: 'var(--ha-surface-raised)',
              borderRadius: 3,
              animation: 'ha-policies-pulse 1.4s ease-in-out infinite',
            }}
          />
        </td>
      ))}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// PolicyForm (create / edit)
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
      update('filePaths', raw.split('\n').map((s) => s.trim()).filter(Boolean));
    },
    [update],
  );

  const handleRegistryPathsChange = useCallback(
    (raw: string) => {
      update('registryPaths', raw.split('\n').map((s) => s.trim()).filter(Boolean));
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
      {/* Policy Name */}
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

      {/* OS Type */}
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

      {/* File Paths */}
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
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--ha-font-mono)', fontSize: 12 }}
        />
      </div>

      {/* Registry Paths (Windows only) */}
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
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--ha-font-mono)', fontSize: 12 }}
          />
        </div>
      )}

      {/* Network Monitor toggle */}
      <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', gap: 12 }}>
        <label
          htmlFor="policy-network-monitor"
          style={{ fontSize: 13, color: 'var(--ha-text-primary)', cursor: 'pointer', userSelect: 'none' }}
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

      {/* Process Monitor toggle */}
      <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', gap: 12 }}>
        <label
          htmlFor="policy-process-monitor"
          style={{ fontSize: 13, color: 'var(--ha-text-primary)', cursor: 'pointer', userSelect: 'none' }}
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

// ---------------------------------------------------------------------------
// Sort direction
// ---------------------------------------------------------------------------

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
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100vh - 56px)',
          flexDirection: 'column',
          gap: 16,
          padding: 24,
          background: 'var(--ha-background)',
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
// All data hooks are invoked here so they are never called for denied users.
// ---------------------------------------------------------------------------

function AgentPoliciesContent({ canMutate }: { canMutate: boolean }): JSX.Element {
  // ── Data hooks ─────────────────────────────────────────────────────────────
  const { data, isLoading, isError, error } = useAgentPolicies();
  const createMutation = useCreateAgentPolicy();
  const updateMutation = useUpdateAgentPolicy();
  const deleteMutation = useDeleteAgentPolicy();
  const assignMutation = useAssignAgents();

  const policies: AgentPolicyDTO[] = useMemo(() => data ?? [], [data]);

  // ── Sort state ─────────────────────────────────────────────────────────────
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

  // ── Policy form modal state ────────────────────────────────────────────────
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

  // ── Assign agents drawer state ────────────────────────────────────────────
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

  const handleAssignSave = useCallback(() => {
    if (!canMutate) return;
    if (drawerState.kind !== 'assign' || drawerState.policy.id === undefined) return;
    const agentIds = assignInput
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    assignMutation.mutate(
      { id: drawerState.policy.id, agentIds },
      { onSuccess: () => closeDrawer() },
    );
  }, [canMutate, drawerState, assignInput, assignMutation, closeDrawer]);

  // ── Delete confirmation state ─────────────────────────────────────────────
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

  // ── Error message ─────────────────────────────────────────────────────────
  const errorMessage =
    error instanceof Error
      ? error.message
      : 'An error occurred while loading agent policies.';

  // ── Modal busy state ──────────────────────────────────────────────────────
  const isModalBusy = createMutation.isPending || updateMutation.isPending;
  const isAssignBusy = assignMutation.isPending;

  const modalTitle = modalState.kind === 'edit' ? 'Edit Policy' : 'Create Policy';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--ha-background)',
      }}
    >
      {/* Page header */}
      <div
        style={{
          height: 48,
          borderBottom: '1px solid var(--ha-border)',
          background: 'var(--ha-surface-raised)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '0 24px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ClipboardList size={20} color="var(--ha-primary)" />
          <h1
            style={{
              fontSize: 'var(--ha-text-xl)',
              color: 'var(--ha-text-primary)',
              margin: 0,
              fontWeight: 600,
            }}
          >
            Agent Policies
          </h1>
          {!isLoading && (
            <span
              style={{
                fontSize: 'var(--ha-text-sm)',
                color: 'var(--ha-text-secondary)',
                padding: '2px 8px',
                background: 'var(--ha-surface-primary)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-sm)',
              }}
            >
              {policies.length.toLocaleString()} {policies.length === 1 ? 'policy' : 'policies'}
            </span>
          )}
          {isLoading && <Spinner size="sm" aria-label="Loading policies" />}
        </div>

        {/* Toolbar */}
        {canMutate ? (
          <HaButton variant="primary" onClick={openCreateModal}>
            Create Policy
          </HaButton>
        ) : (
          <span
            style={{
              fontSize: 'var(--ha-text-xs)',
              color: 'var(--ha-text-secondary)',
              maxWidth: 280,
              textAlign: 'right',
            }}
            title={AGENT_POLICY_MUTATE_DENIED_TITLE}
          >
            Read-only — {AGENT_POLICY_MUTATE_DENIED_TITLE}
          </span>
        )}
      </div>

      {/* Honesty strip — POL-001 / POL-003 STAGING CANDIDATE */}
      <div
        role="status"
        aria-label="Policy enforcement honesty"
        style={{
          padding: '8px 24px',
          borderBottom: '1px solid var(--ha-border)',
          background: 'var(--ha-surface-raised)',
          fontSize: 'var(--ha-text-xs)',
          color: 'var(--ha-text-secondary)',
          lineHeight: 1.45,
          flexShrink: 0,
        }}
      >
        {AGENT_POLICY_HONESTY_BANNER}
      </div>

      {/* Error state */}
      {isError && (
        <div style={{ padding: '12px 24px', flexShrink: 0 }}>
          <Alert variant="danger" isInline title="Failed to load agent policies">
            {errorMessage}
          </Alert>
        </div>
      )}

      {/* Table area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px' }}>
        {/* Empty state */}
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
              )}
            </EmptyStateBody>
          </EmptyState>
        )}

        {/* Table */}
        {(isLoading || policies.length > 0) && (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
              color: 'var(--ha-text-primary)',
              fontFamily: 'Inter, sans-serif',
            }}
            aria-label="Agent policies"
          >
            <thead>
              <tr style={{ background: 'var(--ha-surface-raised)' }}>
                {/* Policy Name (sortable) */}
                <th
                  style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--ha-text-secondary)',
                    borderBottom: '1px solid var(--ha-border)',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  onClick={toggleSort}
                  aria-sort={sortDir === 'asc' ? 'ascending' : 'descending'}
                  role="columnheader"
                >
                  Policy Name{' '}
                  <span style={{ fontSize: 10 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
                </th>
                {['OS Type', 'Assigned Agents', 'Last Updated', 'Actions'].map((col) => (
                  <th
                    key={col}
                    style={{
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--ha-text-secondary)',
                      borderBottom: '1px solid var(--ha-border)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col}
                  </th>
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

      {/* Create / Edit modal */}
      <HaModal
        isOpen={modalState.kind !== 'closed'}
        onClose={closeModal}
        title={modalTitle}
        width={520}
      >
        <div style={{ padding: '16px 0 0' }}>
          <PolicyForm
            initial={formValues}
            onChange={handleFormChange}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 20,
              paddingTop: 16,
              borderTop: '1px solid var(--ha-border)',
            }}
          >
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

      {/* Assign Agents / enforcement evidence drawer */}
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
          {canMutate ? (
            <>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--ha-text-secondary)',
                  marginTop: 16,
                  marginBottom: 12,
                  lineHeight: 1.5,
                }}
              >
                Enter one agent ID (UUID) per line. Assignment updates configuration only — it does
                not prove host enforcement.
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
                rows={10}
                placeholder="550e8400-e29b-41d4-a716-446655440000&#10;6ba7b810-9dad-11d1-80b4-00c04fd430c8"
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
            <p
              style={{
                fontSize: 12,
                color: 'var(--ha-text-secondary)',
                marginTop: 16,
                lineHeight: 1.5,
              }}
            >
              {AGENT_POLICY_MUTATE_DENIED_TITLE}. You can review enforcement evidence only.
            </p>
          )}
        </div>
      </HaDrawer>

      {/* Delete confirmation modal */}
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

      {/* CSS keyframes */}
      <style>{`
        @keyframes ha-policies-pulse {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 0.3; }
        }
      `}</style>
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
  // Amber for partial; secondary for unavailable — never positive/green “enforced”.
  const tone =
    evidence.evidenceAvailability === 'partial' ? 'var(--ha-high)' : 'var(--ha-text-secondary)';

  return (
    <section
      aria-label="Policy enforcement evidence"
      style={{
        marginBottom: 8,
        padding: 12,
        border: '1px solid var(--ha-border)',
        borderRadius: 'var(--ha-radius-base)',
        background: 'var(--ha-surface-primary)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: tone,
        }}
      >
        Evidence: {evidence.evidenceAvailability}
      </div>
      <div
        role="status"
        aria-label="Apply ack path status"
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: applyAckAvailable ? 'var(--ha-high)' : 'var(--ha-text-secondary)',
          marginBottom: 8,
        }}
      >
        {applyAckAvailable
          ? 'Apply/ack fields present (not LIVE VERIFIED)'
          : 'Apply/ack path unavailable'}
      </div>
      <p
        style={{
          fontSize: 12,
          color: 'var(--ha-text-secondary)',
          margin: '0 0 10px',
          lineHeight: 1.45,
        }}
      >
        {evidence.honestyNote}
      </p>
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
          aria-label="Agent policy state rows"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 11,
            fontFamily: 'var(--ha-font-mono)',
          }}
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
                <th
                  key={col}
                  style={{
                    textAlign: 'left',
                    padding: '4px 6px',
                    borderBottom: '1px solid var(--ha-border)',
                    color: 'var(--ha-text-secondary)',
                    fontWeight: 600,
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {evidence.agentStates.map((row, idx) => {
              const rowHasAck = hasAgentPolicyApplyAckEvidence(row);
              return (
                <tr key={row.id ?? `${row.agentId ?? 'agent'}-${idx}`}>
                  <td style={{ padding: '4px 6px', color: 'var(--ha-text-primary)' }}>
                    {row.agentId ?? '—'}
                  </td>
                  <td style={{ padding: '4px 6px', color: 'var(--ha-text-primary)' }}>
                    {row.appliedVersion ?? '—'}
                  </td>
                  <td style={{ padding: '4px 6px', color: 'var(--ha-text-primary)' }}>
                    {row.desiredVersion ?? '—'}
                  </td>
                  <td style={{ padding: '4px 6px', color: 'var(--ha-text-primary)' }}>
                    {row.state ?? '—'}
                  </td>
                  <td style={{ padding: '4px 6px', color: 'var(--ha-text-secondary)' }}>
                    {row.lastAppliedAt ? formatTimestamp(row.lastAppliedAt) : '—'}
                  </td>
                  <td style={{ padding: '4px 6px', color: 'var(--ha-text-secondary)' }}>
                    {row.lastCheckedAt ? formatTimestamp(row.lastCheckedAt) : '—'}
                  </td>
                  <td
                    style={{
                      padding: '4px 6px',
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
                      padding: '4px 6px',
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
// PolicyRow sub-component
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
    <tr
      style={{ borderBottom: '1px solid var(--ha-border)' }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.background = 'var(--ha-surface-primary)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
      }}
    >
      <td
        style={{
          padding: '8px 12px',
          fontWeight: 600,
          color: 'var(--ha-text-primary)',
          fontSize: 13,
          maxWidth: 260,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={policy.name}
      >
        {policy.name}
      </td>

      <td style={{ padding: '8px 12px' }}>
        {policy.osType ? (
          <OsBadge osType={policy.osType} />
        ) : (
          <span style={{ color: 'var(--ha-text-secondary)', fontSize: 12, fontStyle: 'italic' }}>
            —
          </span>
        )}
      </td>

      <td style={{ padding: '8px 12px' }}>
        <CountBadge count={assignedCount} />
      </td>

      <td
        style={{
          padding: '8px 12px',
          fontFamily: 'var(--ha-font-mono)',
          fontSize: 12,
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--ha-text-secondary)',
          whiteSpace: 'nowrap',
        }}
      >
        {lastUpdated ? formatTimestamp(lastUpdated) : '—'}
      </td>

      <td style={{ padding: '8px 12px' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {canMutate && (
            <button
              onClick={() => onEdit(policy)}
              style={{
                background: 'var(--ha-surface-raised)',
                color: 'var(--ha-text-primary)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-sm)',
                padding: '3px 10px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              aria-label={`Edit policy ${policy.name}`}
            >
              Edit
            </button>
          )}
          <button
            onClick={() => onAssign(policy)}
            style={{
              background: 'var(--ha-surface-raised)',
              color: 'var(--ha-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-sm)',
              padding: '3px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
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
              onClick={() => onDelete(policy)}
              style={{
                background: 'var(--ha-surface-raised)',
                color: 'var(--ha-critical)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-sm)',
                padding: '3px 10px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
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
