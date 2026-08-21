/**
 * ScimConfigPage.tsx — SCIM 2.0 Configuration admin page.
 *
 * Route: /admin/scim  (protected — ROLE_ADMIN only)
 *
 * Three sections:
 *   1. SCIM Endpoint URL   — read-only display + Copy button
 *   2. Token Management    — status, generate, revoke
 *   3. Provisioning Log    — placeholder (future sprint)
 *
 * Constraints:
 *   - PatternFly components only — no AG Grid
 *   - All colours via var(--ha-*) tokens — no raw hex literals
 *   - No `any` type annotations
 *   - No absolute backend URLs
 *   - NEVER log the plaintext SCIM token (HiveArmor platform invariant 5.10)
 */

import { useState } from 'react';

import {
  Alert,
  Button,
  Spinner,
} from '@patternfly/react-core';

import { HaModal } from '@/components/ha-modal/HaModal';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { useToastStore } from '@/components/toast-stack/toastStore';
import {
  useGenerateScimToken,
  useRevokeScimToken,
  useScimTokenStatus,
} from '@/hooks/useScimAdmin';

// ---------------------------------------------------------------------------
// Section card wrapper
// ---------------------------------------------------------------------------

interface SectionCardProps {
  title: string;
  children: React.ReactNode;
}

function SectionCard({ title, children }: SectionCardProps): JSX.Element {
  return (
    <div
      style={{
        background: 'var(--ha-surface-primary)',
        border: '1px solid var(--ha-border)',
        borderRadius: 6,
        padding: '20px 24px',
        marginBottom: 20,
      }}
    >
      <h2
        style={{
          fontSize: 'var(--ha-text-lg)',
          fontWeight: 600,
          color: 'var(--ha-text-primary)',
          margin: '0 0 16px 0',
          paddingBottom: 12,
          borderBottom: '1px solid var(--ha-border)',
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 1 — SCIM Endpoint URL
// ---------------------------------------------------------------------------

function ScimEndpointSection(): JSX.Element {
  const scimUrl = window.location.origin + '/api/ha-scim/v2/';
  const [copied, setCopied] = useState(false);

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(scimUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <SectionCard title="SCIM Endpoint URL">
      <p
        style={{
          fontSize: 'var(--ha-text-sm)',
          color: 'var(--ha-text-secondary)',
          margin: '0 0 12px 0',
        }}
      >
        Configure your identity provider to send SCIM 2.0 provisioning requests to this URL.
      </p>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <code
          style={{
            flex: 1,
            minWidth: 0,
            background: 'var(--ha-surface-raised)',
            border: '1px solid var(--ha-border)',
            borderRadius: 4,
            padding: '8px 12px',
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-primary)',
            fontFamily: 'JetBrains Mono, monospace',
            fontVariantNumeric: 'tabular-nums',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            display: 'block',
          }}
        >
          {scimUrl}
        </code>
        <Button
          variant="secondary"
          onClick={handleCopy}
          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Token reveal modal — shown once after generation
// ---------------------------------------------------------------------------

interface TokenRevealModalProps {
  isOpen: boolean;
  token: string;
  onClose: () => void;
}

function TokenRevealModal({ isOpen, token, onClose }: TokenRevealModalProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = (): void => {
    // ⚠ The token value is NEVER passed to console.log or any logger.
    void navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <HaModal
      isOpen={isOpen}
      onClose={onClose}
      title="SCIM Bearer Token — Save Now"
      width={560}
    >
      <div style={{ padding: '8px 0' }}>
        <Alert
          variant="warning"
          isInline
          title="This token will not be shown again"
          style={{ marginBottom: 16 }}
        >
          Copy and store the token in a secure location before closing this dialog.
          Once closed, you cannot retrieve the plaintext value — you will need to
          generate a new token.
        </Alert>

        <code
          style={{
            display: 'block',
            wordBreak: 'break-all',
            background: 'var(--ha-surface-raised)',
            border: '1px solid var(--ha-border)',
            borderRadius: 4,
            padding: '12px 14px',
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-primary)',
            fontFamily: 'JetBrains Mono, monospace',
            marginBottom: 16,
          }}
        >
          {token}
        </code>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </Button>
        </div>
      </div>
    </HaModal>
  );
}

// ---------------------------------------------------------------------------
// Section 2 — Token Management
// ---------------------------------------------------------------------------

function TokenManagementSection(): JSX.Element {
  const { data: status, isLoading, isError } = useScimTokenStatus();
  const generateMutation = useGenerateScimToken();
  const revokeMutation = useRevokeScimToken();
  const { addToast } = useToastStore();

  // The plaintext token is stored only in component state, shown once, then
  // discarded when the modal closes. It is NEVER logged.
  const [revealToken, setRevealToken] = useState<string | null>(null);

  const handleGenerate = (): void => {
    generateMutation.mutate(undefined, {
      onSuccess: (data) => {
        // ⚠ data.token MUST NOT be passed to any logger. Show via modal only.
        setRevealToken(data.token);
      },
      onError: () => {
        addToast({
          variant: 'danger',
          title: 'Token generation failed',
          description: 'Unable to generate a new SCIM bearer token. Please try again.',
        });
      },
    });
  };

  const handleRevoke = (): void => {
    revokeMutation.mutate(undefined, {
      onSuccess: () => {
        addToast({
          variant: 'success',
          title: 'SCIM token revoked',
          description: 'The SCIM bearer token has been revoked. All SCIM requests will return 401 until a new token is generated.',
        });
      },
      onError: () => {
        addToast({
          variant: 'danger',
          title: 'Token revocation failed',
          description: 'Unable to revoke the SCIM bearer token. Please try again.',
        });
      },
    });
  };

  const formatLastUsed = (lastUsed: string | null): string => {
    if (lastUsed === null) return 'Never used';
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(lastUsed));
  };

  return (
    <SectionCard title="Token Management">
      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ha-text-secondary)' }}>
          <Spinner size="sm" aria-label="Loading token status" />
          <span style={{ fontSize: 'var(--ha-text-sm)' }}>Loading token status…</span>
        </div>
      )}

      {isError && !isLoading && (
        <Alert
          variant="danger"
          isInline
          title="Failed to load token status"
          style={{ marginBottom: 16 }}
        >
          Unable to retrieve the current SCIM token status. Refresh the page to retry.
        </Alert>
      )}

      {status !== undefined && (
        <>
          {/* Status row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'max-content 1fr',
              columnGap: 24,
              rowGap: 8,
              marginBottom: 20,
              fontSize: 'var(--ha-text-sm)',
            }}
          >
            <span style={{ color: 'var(--ha-text-secondary)', fontWeight: 500 }}>Status</span>
            <span
              style={{
                color: status.configured ? 'var(--ha-positive)' : 'var(--ha-text-secondary)',
                fontWeight: 600,
              }}
            >
              {status.configured ? 'Configured' : 'Not configured'}
            </span>

            <span style={{ color: 'var(--ha-text-secondary)', fontWeight: 500 }}>Last used</span>
            <span
              style={{
                color: 'var(--ha-text-primary)',
                fontFamily: status.lastUsed !== null ? 'JetBrains Mono, monospace' : undefined,
                fontVariantNumeric: status.lastUsed !== null ? 'tabular-nums' : undefined,
              }}
            >
              {formatLastUsed(status.lastUsed)}
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              onClick={handleGenerate}
              isDisabled={generateMutation.isPending || revokeMutation.isPending}
            >
              {generateMutation.isPending ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Spinner size="sm" aria-label="Generating" />
                  Generating…
                </span>
              ) : (
                'Generate Token'
              )}
            </Button>

            {status.configured && (
              <Button
                variant="danger"
                onClick={handleRevoke}
                isDisabled={generateMutation.isPending || revokeMutation.isPending}
              >
                {revokeMutation.isPending ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Spinner size="sm" aria-label="Revoking" />
                    Revoking…
                  </span>
                ) : (
                  'Revoke Token'
                )}
              </Button>
            )}
          </div>
        </>
      )}

      {/* Token reveal modal — shown once, never logs the token value */}
      {revealToken !== null && (
        <TokenRevealModal
          isOpen
          token={revealToken}
          onClose={() => setRevealToken(null)}
        />
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Section 3 — Provisioning Log (placeholder)
// ---------------------------------------------------------------------------

function ProvisioningLogSection(): JSX.Element {
  return (
    <SectionCard title="Provisioning Log">
      <p
        style={{
          fontSize: 'var(--ha-text-sm)',
          color: 'var(--ha-text-secondary)',
          margin: 0,
        }}
      >
        Provisioning log available in a future sprint.
      </p>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ScimConfigPage(): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--ha-background)',
      }}
    >
      <SiemPageHeader
        title="SCIM Configuration"
        description="Configure SCIM 2.0 user provisioning and manage the bearer token used by your identity provider."
        breadcrumbs={[{ label: 'Admin' }, { label: 'SCIM Configuration' }]}
      />

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '24px',
        }}
      >
        <ScimEndpointSection />
        <TokenManagementSection />
        <ProvisioningLogSection />
      </div>
    </div>
  );
}
