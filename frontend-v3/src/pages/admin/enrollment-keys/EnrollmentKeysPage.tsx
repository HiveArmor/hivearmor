/**
 * EnrollmentKeysPage — admin management of agent enrollment tokens & provisioning
 * keys (SPEC-07 W6 6.3). Route: /admin/enrollment-keys.
 *
 * Two lists on one governed surface:
 *   - Enrollment tokens  (GET /api/ha-agent-enrollments)   → revoke (reason, audited)
 *   - Provisioning keys  (GET /api/ha-agent-keys)           → revoke
 *
 * Authority: Platform Administrator | SOC Manager. Tenant-scoped server-side.
 *
 * Honesty & safety rules (SPEC-07):
 *   - Secrets are shown ONCE at creation (in AddAgentDrawer) and NEVER here — this
 *     page lists metadata (expiry / scope / uses / status) only, and logs nothing.
 *   - Revoke is the SPEC-01 confirm tier with a required reason + tenant echo.
 *   - Loading / empty / error states via the shared components; no fabricated rows.
 *
 * Hive Carbon tokens only (foundation.css); no raw hex, no `any`.
 */

import { useMemo, useState } from 'react';

import { Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, ShieldOff, Ticket } from 'lucide-react';

import { AccessDeniedState } from '@/components/access-denied-state/AccessDeniedState';
import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaButton } from '@/components/ha-button/HaButton';
import { HaCard } from '@/components/ha-card/HaCard';
import { HaPageHeader } from '@/components/ha-page-header/HaPageHeader';
import { LoadingState } from '@/components/loading-state/LoadingState';
import { useMastheadTenants } from '@/hooks/useMastheadTenants';
import { ROLES } from '@/lib/roles';
import { formatBoundedRelativeTime } from '@/lib/threatIntelFreshness';
import { listAgentKeys, revokeAgentKey } from '@/services/agentProvisioningService';
import {
  listEnrollmentTokens,
  revokeEnrollmentToken,
  type EnrollmentTokenRow,
} from '@/services/enrollmentTokens.service';
import { ALL_TENANTS_OPTION } from '@/services/mastheadTenants.service';
import { useAuthStore } from '@/store/auth.store';
import type { AgentKeyListItemDTO } from '@/types/agentProvisioning.types';

import './EnrollmentKeysPage.css';

const KEYS_ROLES = [ROLES.ADMIN, ROLES.SOC_MANAGER] as const;

type RevokeTarget =
  | { kind: 'token'; token: EnrollmentTokenRow }
  | { kind: 'key'; key: AgentKeyListItemDTO }
  | null;

function StatusPill({ status }: { status: string }): JSX.Element {
  const value = status.toUpperCase();
  const cls =
    value === 'ACTIVE'
      ? 'enrollment-keys__pill--active'
      : value === 'REVOKED'
        ? 'enrollment-keys__pill--revoked'
        : 'enrollment-keys__pill--inactive';
  return <span className={`enrollment-keys__pill ${cls}`}>{value.charAt(0) + value.slice(1).toLowerCase()}</span>;
}

export function EnrollmentKeysPage(): JSX.Element {
  const queryClient = useQueryClient();
  const hasAnyRole = useAuthStore((s) => s.hasAnyRole);
  const selectedTenantId = useAuthStore((s) => s.selectedTenantId);
  const { tenants } = useMastheadTenants();
  const canView = hasAnyRole([...KEYS_ROLES]);
  const tenantSelected = selectedTenantId !== null && selectedTenantId > 0;
  const tenantLabel = (tenants.find((t) => t.id === selectedTenantId) ?? ALL_TENANTS_OPTION).label;

  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget>(null);
  const [reason, setReason] = useState('');

  const tokensQuery = useQuery({
    queryKey: ['enrollment-tokens'],
    queryFn: ({ signal }) => listEnrollmentTokens(signal),
    enabled: canView && tenantSelected,
    retry: 1,
  });

  const keysQuery = useQuery({
    queryKey: ['agent-keys'],
    queryFn: () => listAgentKeys(),
    enabled: canView,
    retry: 1,
  });

  const revokeMutation = useMutation({
    mutationFn: async (payload: { target: NonNullable<RevokeTarget>; reason: string }) => {
      if (payload.target.kind === 'token') {
        await revokeEnrollmentToken(payload.target.token, payload.reason);
      } else {
        await revokeAgentKey(payload.target.key.id);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['enrollment-tokens'] });
      void queryClient.invalidateQueries({ queryKey: ['agent-keys'] });
      setRevokeTarget(null);
      setReason('');
    },
  });

  const tokens = useMemo(() => tokensQuery.data ?? [], [tokensQuery.data]);
  const keys = useMemo(() => keysQuery.data ?? [], [keysQuery.data]);

  if (!canView) {
    return (
      <div className="enrollment-keys enrollment-keys--state">
        <AccessDeniedState
          title="Access Restricted"
          message="Required permission: Platform Administrator or SOC Manager"
        />
      </div>
    );
  }

  const revokeTargetLabel =
    revokeTarget?.kind === 'token'
      ? `enrollment token ${revokeTarget.token.id}`
      : revokeTarget?.kind === 'key'
        ? `provisioning key "${revokeTarget.key.alias}"`
        : '';
  // A token revoke requires a reason (backend @NotBlank); a key revoke does not.
  const reasonRequired = revokeTarget?.kind === 'token';
  const canConfirmRevoke = !reasonRequired || reason.trim().length > 0;

  return (
    <div className="enrollment-keys">
      <HaPageHeader
        title="Enrollment Keys & Tokens"
        description="Active enrollment tokens and agent provisioning keys for this tenant. Secrets are shown once at creation and never here — revoke a credential to stop it enrolling new agents."
      />

      {!tenantSelected && (
        <div className="enrollment-keys__notice" role="note">
          Select a specific tenant in the masthead to list enrollment tokens. Provisioning keys are shown below.
        </div>
      )}

      {/* Enrollment tokens */}
      <HaCard as="section" className="enrollment-keys__card">
        <HaCard.Header>
          <span className="enrollment-keys__card-title"><Ticket size={15} aria-hidden="true" /> Enrollment tokens</span>
        </HaCard.Header>
        <HaCard.Body className="enrollment-keys__card-body">
          {tenantSelected && tokensQuery.isLoading && <LoadingState message="Loading enrollment tokens…" rows={4} />}
          {tenantSelected && tokensQuery.isError && (
            <ErrorState
              title="Could not load enrollment tokens"
              message="The enrollment tokens could not be retrieved. Nothing has been changed."
              onRetry={() => void tokensQuery.refetch()}
            />
          )}
          {tenantSelected && !tokensQuery.isLoading && !tokensQuery.isError && tokens.length === 0 && (
            <EmptyState icon={<Ticket size={34} />} title="No enrollment tokens" description="No enrollment tokens exist for this tenant. Generate one from Add Agent on the Endpoints page." />
          )}
          {tenantSelected && tokens.length > 0 && (
            <table className="enrollment-keys__table">
              <thead>
                <tr>
                  <th scope="col">Token</th>
                  <th scope="col">Platform</th>
                  <th scope="col">Uses</th>
                  <th scope="col">Expires</th>
                  <th scope="col">Created by</th>
                  <th scope="col">Status</th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id}>
                    <td className="enrollment-keys__mono">{t.id}</td>
                    <td>{t.platform ?? 'any'}</td>
                    <td>{t.useCount}/{t.maxUses || '∞'}</td>
                    <td title={t.expiresAt ?? ''}>{t.expiresAt ? formatBoundedRelativeTime(t.expiresAt) : '—'}</td>
                    <td>{t.createdBy ?? 'system'}</td>
                    <td><StatusPill status={t.status} /></td>
                    <td className="enrollment-keys__actions-cell">
                      {t.status === 'ACTIVE' && (
                        <HaButton
                          variant="danger"
                          icon={<ShieldOff size={13} />}
                          onClick={() => { setReason(''); revokeMutation.reset(); setRevokeTarget({ kind: 'token', token: t }); }}
                        >
                          Revoke
                        </HaButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </HaCard.Body>
      </HaCard>

      {/* Provisioning keys */}
      <HaCard as="section" className="enrollment-keys__card">
        <HaCard.Header>
          <span className="enrollment-keys__card-title"><KeyRound size={15} aria-hidden="true" /> Provisioning keys</span>
        </HaCard.Header>
        <HaCard.Body className="enrollment-keys__card-body">
          {keysQuery.isLoading && <LoadingState message="Loading provisioning keys…" rows={4} />}
          {keysQuery.isError && (
            <ErrorState
              title="Could not load provisioning keys"
              message="The provisioning keys could not be retrieved. Nothing has been changed."
              onRetry={() => void keysQuery.refetch()}
            />
          )}
          {!keysQuery.isLoading && !keysQuery.isError && keys.length === 0 && (
            <EmptyState icon={<KeyRound size={34} />} title="No provisioning keys" description="No agent provisioning keys have been created. Generate one from Add Agent on the Endpoints page." />
          )}
          {keys.length > 0 && (
            <table className="enrollment-keys__table">
              <thead>
                <tr>
                  <th scope="col">Alias</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Expires</th>
                  <th scope="col">Created</th>
                  <th scope="col">Status</th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="enrollment-keys__mono">{k.alias}</td>
                    <td>{k.mode ?? '—'}</td>
                    <td title={k.expiresAt ?? ''}>{k.expiresAt ? formatBoundedRelativeTime(k.expiresAt) : '—'}</td>
                    <td title={k.createdAt}>{formatBoundedRelativeTime(k.createdAt)}</td>
                    <td><StatusPill status={k.status} /></td>
                    <td className="enrollment-keys__actions-cell">
                      {k.status === 'active' && (
                        <HaButton
                          variant="danger"
                          icon={<ShieldOff size={13} />}
                          onClick={() => { setReason(''); revokeMutation.reset(); setRevokeTarget({ kind: 'key', key: k }); }}
                        >
                          Revoke
                        </HaButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </HaCard.Body>
      </HaCard>

      {/* Revoke confirmation (SPEC-01 tier). Token revoke requires a reason. */}
      {revokeTarget !== null && (
        <Modal
          isOpen
          onClose={() => { if (!revokeMutation.isPending) { setRevokeTarget(null); setReason(''); } }}
          variant="small"
          width="min(480px, calc(100vw - 32px))"
          className="ha-confirmation-modal"
          backdropClassName="ha-confirmation-modal__backdrop"
          aria-label="Revoke credential"
        >
          <ModalHeader title="Revoke this credential?" titleIconVariant="warning" />
          <ModalBody className="ha-confirmation-modal__body">
            <p>
              {`Target: ${revokeTargetLabel}. Tenant: ${tenantLabel}. `}
              Revoking is immediate — the credential can no longer enrol new agents. Already-enrolled
              agents are unaffected.
            </p>
            {reasonRequired && (
              <label className="enrollment-keys__reason">
                Reason <span aria-hidden="true">*</span>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  aria-label="Reason for revoking this token"
                  placeholder="e.g. issued in error / rotating credentials"
                  autoComplete="off"
                  autoFocus
                />
              </label>
            )}
            <div className="ha-confirmation-modal__guardrail" role="note">
              This decision is recorded in the audit trail.
            </div>
            {revokeMutation.isError && (
              <p className="enrollment-keys__error" role="alert">
                Revocation failed — the credential was not changed. Try again.
              </p>
            )}
          </ModalBody>
          <ModalFooter className="ha-confirmation-modal__footer">
            <HaButton
              variant="secondary"
              onClick={() => { setRevokeTarget(null); setReason(''); }}
              isDisabled={revokeMutation.isPending}
            >
              Cancel
            </HaButton>
            <HaButton
              variant="danger"
              isDisabled={!canConfirmRevoke || revokeMutation.isPending}
              onClick={() => {
                if (!revokeTarget || !canConfirmRevoke || revokeMutation.isPending) return;
                revokeMutation.mutate({ target: revokeTarget, reason: reason.trim() });
              }}
            >
              {revokeMutation.isPending ? 'Revoking…' : 'Revoke'}
            </HaButton>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}

export default EnrollmentKeysPage;
