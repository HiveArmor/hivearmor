/**
 * SsoProvidersPage.tsx — SSO / OIDC Provider management admin page.
 *
 * Route: /admin/sso  (protected — ROLE_ADMIN only)
 *
 * Four states:
 *   loading  — skeleton rows
 *   empty    — "No SSO providers configured" + inline Add Provider button
 *   error    — PatternFly Alert danger variant
 *   loaded   — sortable provider table
 *
 * Table columns:
 *   Provider Name (sortable) | Discovery URL (300px, truncate+tooltip) |
 *   Enabled (toggle with optimistic UI) | Client ID (160px) | Actions
 *
 * Constraints:
 *   - PatternFly components only (no AG Grid, no @patternfly/react-table which is not installed)
 *   - All colours via var(--ha-*) tokens — no raw hex literals
 *   - No `any` type annotations
 *   - No absolute backend URLs
 */

import { useState } from 'react';

import {
  ActionList,
  ActionListItem,
  Alert,
  Button,
  Checkbox,
  FormGroup,
  HelperText,
  HelperTextItem,
  Skeleton,
  Spinner,
  Switch,
  TextInput,
  Tooltip,
} from '@patternfly/react-core';

import { HaModal } from '@/components/ha-modal/HaModal';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { useToastStore } from '@/components/toast-stack/toastStore';
import {
  useAllSsoProviders,
  useCreateSsoProvider,
  useDeleteSsoProvider,
  useUpdateSsoProvider,
} from '@/hooks/useSsoProviders';
import type {
  OidcProviderAdminDTO,
  OidcProviderFormValues,
} from '@/types/sso';

// ---------------------------------------------------------------------------
// Sort types
// ---------------------------------------------------------------------------

type SortDirection = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Helper — sort providers by name
// ---------------------------------------------------------------------------

function sortByName(
  providers: OidcProviderAdminDTO[],
  direction: SortDirection
): OidcProviderAdminDTO[] {
  return [...providers].sort((a, b) => {
    const cmp = a.providerName.localeCompare(b.providerName);
    return direction === 'asc' ? cmp : -cmp;
  });
}

// ---------------------------------------------------------------------------
// Form default values
// ---------------------------------------------------------------------------

const FORM_DEFAULTS: OidcProviderFormValues = {
  providerName: '',
  discoveryUrl: '',
  clientId: '',
  clientSecret: '',
  scopes: 'openid profile email',
  enabled: true,
};

// ---------------------------------------------------------------------------
// Table styles — shared inline style objects
// ---------------------------------------------------------------------------

const TH_STYLE: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: 'var(--ha-text-xs)',
  fontWeight: 600,
  color: 'var(--ha-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  borderBottom: '1px solid var(--ha-border)',
  background: 'var(--ha-surface-raised)',
  whiteSpace: 'nowrap',
};

const TD_STYLE: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 'var(--ha-text-sm)',
  color: 'var(--ha-text-primary)',
  borderBottom: '1px solid var(--ha-border)',
  verticalAlign: 'middle',
};

// ---------------------------------------------------------------------------
// Add / Edit Modal
// ---------------------------------------------------------------------------

interface ProviderModalProps {
  isOpen: boolean;
  editing: OidcProviderAdminDTO | null;
  onClose: () => void;
  onSaved: () => void;
}

function ProviderModal({
  isOpen,
  editing,
  onClose,
  onSaved,
}: ProviderModalProps): JSX.Element {
  const createMutation = useCreateSsoProvider();
  const updateMutation = useUpdateSsoProvider();
  const { addToast } = useToastStore();

  const [form, setForm] = useState<OidcProviderFormValues>(() =>
    editing
      ? {
          providerName: editing.providerName,
          discoveryUrl: editing.discoveryUrl,
          clientId: editing.clientId,
          clientSecret: '',
          scopes: editing.scopes,
          enabled: editing.enabled,
        }
      : { ...FORM_DEFAULTS }
  );

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleFieldChange =
    (field: keyof OidcProviderFormValues) =>
    (value: string | boolean): void => {
      setForm((prev) => ({ ...prev, [field]: value }));
    };

  const handleSubmit = (): void => {
    if (!form.providerName.trim()) {
      addToast({ variant: 'danger', title: 'Provider Name is required.' });
      return;
    }
    if (!form.discoveryUrl.trim()) {
      addToast({ variant: 'danger', title: 'Discovery URL is required.' });
      return;
    }
    if (!form.clientId.trim()) {
      addToast({ variant: 'danger', title: 'Client ID is required.' });
      return;
    }
    if (!editing && !form.clientSecret.trim()) {
      addToast({
        variant: 'danger',
        title: 'Client Secret is required when creating a provider.',
      });
      return;
    }

    if (editing) {
      updateMutation.mutate(
        { id: editing.id, data: form },
        {
          onSuccess: () => {
            addToast({ variant: 'success', title: 'SSO provider updated.' });
            onSaved();
          },
          onError: () => {
            addToast({
              variant: 'danger',
              title: 'Failed to update SSO provider.',
              description: 'Please try again.',
            });
          },
        }
      );
    } else {
      createMutation.mutate(form, {
        onSuccess: () => {
          addToast({ variant: 'success', title: 'SSO provider created.' });
          onSaved();
        },
        onError: () => {
          addToast({
            variant: 'danger',
            title: 'Failed to create SSO provider.',
            description: 'Please try again.',
          });
        },
      });
    }
  };

  return (
    <HaModal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Edit SSO Provider' : 'Add SSO Provider'}
      width={560}
    >
      <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Provider Name */}
        <FormGroup label="Provider Name" isRequired fieldId="sso-provider-name">
          <TextInput
            id="sso-provider-name"
            value={form.providerName}
            onChange={(_e, val) => handleFieldChange('providerName')(val)}
            isRequired
            placeholder="e.g. Google Workspace"
          />
        </FormGroup>

        {/* Discovery URL */}
        <FormGroup label="Discovery URL" isRequired fieldId="sso-discovery-url">
          <TextInput
            id="sso-discovery-url"
            value={form.discoveryUrl}
            onChange={(_e, val) => handleFieldChange('discoveryUrl')(val)}
            isRequired
            placeholder="e.g. https://accounts.google.com/.well-known/openid-configuration"
          />
        </FormGroup>

        {/* Client ID */}
        <FormGroup label="Client ID" isRequired fieldId="sso-client-id">
          <TextInput
            id="sso-client-id"
            value={form.clientId}
            onChange={(_e, val) => handleFieldChange('clientId')(val)}
            isRequired
          />
        </FormGroup>

        {/* Client Secret */}
        <FormGroup
          label="Client Secret"
          isRequired={!editing}
          fieldId="sso-client-secret"
        >
          <TextInput
            id="sso-client-secret"
            type="password"
            value={form.clientSecret}
            onChange={(_e, val) => handleFieldChange('clientSecret')(val)}
            placeholder={editing ? '●●●●●●●●' : ''}
          />
          {editing && (
            <HelperText>
              <HelperTextItem>Leave blank to keep the existing secret.</HelperTextItem>
            </HelperText>
          )}
        </FormGroup>

        {/* Scopes */}
        <FormGroup label="Scopes" fieldId="sso-scopes">
          <TextInput
            id="sso-scopes"
            value={form.scopes}
            onChange={(_e, val) => handleFieldChange('scopes')(val)}
            placeholder="openid profile email"
          />
        </FormGroup>

        {/* Enabled */}
        <FormGroup fieldId="sso-enabled">
          <Checkbox
            id="sso-enabled"
            label="Enabled"
            isChecked={form.enabled}
            onChange={(_e, checked) => handleFieldChange('enabled')(checked)}
          />
        </FormGroup>

        {/* Actions */}
        <ActionList>
          <ActionListItem>
            <Button variant="primary" onClick={handleSubmit} isDisabled={isPending}>
              {isPending ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Spinner size="sm" aria-label="Saving" />
                  {editing ? 'Saving…' : 'Creating…'}
                </span>
              ) : editing ? (
                'Save Changes'
              ) : (
                'Add Provider'
              )}
            </Button>
          </ActionListItem>
          <ActionListItem>
            <Button variant="link" onClick={onClose} isDisabled={isPending}>
              Cancel
            </Button>
          </ActionListItem>
        </ActionList>
      </div>
    </HaModal>
  );
}

// ---------------------------------------------------------------------------
// Delete Confirmation Modal
// ---------------------------------------------------------------------------

interface DeleteModalProps {
  isOpen: boolean;
  provider: OidcProviderAdminDTO | null;
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteModal({
  isOpen,
  provider,
  onClose,
  onDeleted,
}: DeleteModalProps): JSX.Element {
  const deleteMutation = useDeleteSsoProvider();
  const { addToast } = useToastStore();

  const handleDelete = (): void => {
    if (!provider) return;
    deleteMutation.mutate(provider.id, {
      onSuccess: () => {
        addToast({ variant: 'success', title: 'SSO provider deleted.' });
        onDeleted();
      },
      onError: () => {
        addToast({
          variant: 'danger',
          title: 'Failed to delete SSO provider.',
          description: 'Please try again.',
        });
      },
    });
  };

  return (
    <HaModal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete SSO Provider"
      width={480}
    >
      <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {provider && (
          <Alert
            variant="warning"
            isInline
            title={`Deleting '${provider.providerName}' will prevent users who rely on this provider from signing in.`}
          />
        )}
        <ActionList>
          <ActionListItem>
            <Button
              variant="danger"
              isDanger
              onClick={handleDelete}
              isDisabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Spinner size="sm" aria-label="Deleting" />
                  Deleting…
                </span>
              ) : (
                'Delete Provider'
              )}
            </Button>
          </ActionListItem>
          <ActionListItem>
            <Button variant="link" onClick={onClose} isDisabled={deleteMutation.isPending}>
              Cancel
            </Button>
          </ActionListItem>
        </ActionList>
      </div>
    </HaModal>
  );
}

// ---------------------------------------------------------------------------
// Enabled Toggle Cell — optimistic UI
// ---------------------------------------------------------------------------

interface EnabledToggleProps {
  provider: OidcProviderAdminDTO;
}

function EnabledToggle({ provider }: EnabledToggleProps): JSX.Element {
  const updateMutation = useUpdateSsoProvider();
  const { addToast } = useToastStore();
  // Optimistic local state: null means "use server value"
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(null);

  const displayEnabled = optimisticEnabled !== null ? optimisticEnabled : provider.enabled;

  const handleToggle = (): void => {
    const next = !displayEnabled;
    setOptimisticEnabled(next);

    const formValues: OidcProviderFormValues = {
      providerName: provider.providerName,
      discoveryUrl: provider.discoveryUrl,
      clientId: provider.clientId,
      clientSecret: '',
      scopes: provider.scopes,
      enabled: next,
    };

    updateMutation.mutate(
      { id: provider.id, data: formValues },
      {
        onSuccess: () => {
          setOptimisticEnabled(null); // let server state win
        },
        onError: () => {
          setOptimisticEnabled(provider.enabled); // revert
          addToast({
            variant: 'danger',
            title: `Failed to ${next ? 'enable' : 'disable'} ${provider.providerName}.`,
            description: 'Please try again.',
          });
          setTimeout(() => setOptimisticEnabled(null), 300);
        },
      }
    );
  };

  if (updateMutation.isPending && optimisticEnabled !== null) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Spinner size="sm" aria-label="Updating" />
      </span>
    );
  }

  return (
    <Switch
      id={`sso-enabled-${provider.id}`}
      isChecked={displayEnabled}
      onChange={handleToggle}
      aria-label={`${provider.providerName} enabled`}
    />
  );
}

// ---------------------------------------------------------------------------
// Skeleton loading rows
// ---------------------------------------------------------------------------

function LoadingRows(): JSX.Element {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <tr key={i}>
          <td style={TD_STYLE}><Skeleton width="120px" /></td>
          <td style={TD_STYLE}><Skeleton width="240px" /></td>
          <td style={TD_STYLE}><Skeleton width="40px" /></td>
          <td style={TD_STYLE}><Skeleton width="100px" /></td>
          <td style={TD_STYLE}><Skeleton width="80px" /></td>
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sort indicator
// ---------------------------------------------------------------------------

function SortIndicator({ direction }: { direction: SortDirection }): JSX.Element {
  return (
    <span
      style={{
        marginLeft: 6,
        fontSize: 10,
        color: 'var(--ha-primary)',
        userSelect: 'none',
      }}
      aria-hidden="true"
    >
      {direction === 'asc' ? '▲' : '▼'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SsoProvidersPage(): JSX.Element {
  const { data: providers, isLoading, isError } = useAllSsoProviders();

  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<OidcProviderAdminDTO | null>(null);
  const [deletingProvider, setDeletingProvider] = useState<OidcProviderAdminDTO | null>(null);
  // modal key forces re-mount (clears form) when opening for a different provider
  const [modalKey, setModalKey] = useState(0);

  const openAddModal = (): void => {
    setEditingProvider(null);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  };

  const openEditModal = (provider: OidcProviderAdminDTO): void => {
    setEditingProvider(provider);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  };

  const closeModal = (): void => {
    setModalOpen(false);
  };

  const handleSaved = (): void => {
    setModalOpen(false);
  };

  const openDeleteModal = (provider: OidcProviderAdminDTO): void => {
    setDeletingProvider(provider);
  };

  const closeDeleteModal = (): void => {
    setDeletingProvider(null);
  };

  const handleDeleted = (): void => {
    setDeletingProvider(null);
  };

  const handleSortToggle = (): void => {
    setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
  };

  const sortedProviders =
    providers && providers.length > 0 ? sortByName(providers, sortDirection) : (providers ?? []);

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
        title="SSO Providers"
        description="Configure OpenID Connect providers for single sign-on. Users can sign in with any enabled provider."
        breadcrumbs={[{ label: 'Admin' }, { label: 'SSO Providers' }]}
        actions={
          <Button variant="primary" onClick={openAddModal}>
            Add Provider
          </Button>
        }
      />

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '24px',
        }}
      >
        {/* ── Error state ─────────────────────────────────────── */}
        {isError && !isLoading && (
          <Alert
            variant="danger"
            isInline
            title="Failed to load SSO providers"
          >
            Unable to retrieve the SSO provider list. Refresh the page to retry.
          </Alert>
        )}

        {/* ── Table ───────────────────────────────────────────── */}
        {!isError && (
          <div
            style={{
              background: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            <table
              style={{ width: '100%', borderCollapse: 'collapse' }}
              aria-label="SSO Providers"
            >
              <thead>
                <tr>
                  {/* Provider Name — sortable */}
                  <th
                    style={{ ...TH_STYLE, cursor: 'pointer' }}
                    onClick={handleSortToggle}
                    aria-sort={sortDirection === 'asc' ? 'ascending' : 'descending'}
                  >
                    Provider Name
                    <SortIndicator direction={sortDirection} />
                  </th>
                  <th style={{ ...TH_STYLE, width: 300 }}>Discovery URL</th>
                  <th style={TH_STYLE}>Enabled</th>
                  <th style={{ ...TH_STYLE, width: 160 }}>Client ID</th>
                  <th style={TH_STYLE}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {/* Loading rows */}
                {isLoading && <LoadingRows />}

                {/* Empty state */}
                {!isLoading && sortedProviders.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ ...TD_STYLE, borderBottom: 'none' }}>
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '40px 24px',
                          color: 'var(--ha-text-secondary)',
                          fontSize: 'var(--ha-text-sm)',
                        }}
                      >
                        <div style={{ marginBottom: 16 }}>No SSO providers configured.</div>
                        <Button variant="secondary" onClick={openAddModal}>
                          Add Provider
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Loaded rows */}
                {!isLoading &&
                  sortedProviders.map((provider) => (
                    <tr key={provider.id}>
                      {/* Provider Name */}
                      <td
                        style={{
                          ...TD_STYLE,
                          fontWeight: 500,
                        }}
                      >
                        {provider.providerName}
                      </td>

                      {/* Discovery URL — truncated with tooltip */}
                      <td style={{ ...TD_STYLE, width: 300, maxWidth: 300 }}>
                        <Tooltip content={provider.discoveryUrl} position="top">
                          <span
                            style={{
                              display: 'block',
                              width: 280,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              color: 'var(--ha-text-secondary)',
                              fontFamily: 'var(--ha-font-mono)',
                              cursor: 'default',
                            }}
                          >
                            {provider.discoveryUrl}
                          </span>
                        </Tooltip>
                      </td>

                      {/* Enabled toggle */}
                      <td style={TD_STYLE}>
                        <EnabledToggle provider={provider} />
                      </td>

                      {/* Client ID */}
                      <td
                        style={{
                          ...TD_STYLE,
                          width: 160,
                          maxWidth: 160,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: 'var(--ha-text-secondary)',
                          fontFamily: 'var(--ha-font-mono)',
                        }}
                      >
                        {provider.clientId}
                      </td>

                      {/* Actions */}
                      <td style={TD_STYLE}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openEditModal(provider)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            isDanger
                            size="sm"
                            onClick={() => openDeleteModal(provider)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ───────────────────────────────────── */}
      <ProviderModal
        key={modalKey}
        isOpen={modalOpen}
        editing={editingProvider}
        onClose={closeModal}
        onSaved={handleSaved}
      />

      {/* ── Delete Modal ───────────────────────────────────────── */}
      <DeleteModal
        isOpen={deletingProvider !== null}
        provider={deletingProvider}
        onClose={closeDeleteModal}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
