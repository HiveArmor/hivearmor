/**
 * HaApiKeyCreateModal — form modal for creating a new API key.
 *
 * Renders a form with Name (required), Scopes (multi-select, required), and
 * an optional Expires At date input. On submit it calls
 * `useCreateApiKey().mutate(payload)` and surfaces the plaintext token to the
 * parent via `onTokenReceived`. The parent (ApiKeyPage) stores the token in a
 * local useState and passes it to HaApiKeyTokenDialog — it never enters
 * Zustand or localStorage (Req 7.4).
 *
 * Security invariants:
 *   - No `any` types (Req 13.8).
 *   - No hex color literals — all colors via `--ha-*` tokens (Req 13.9).
 *   - Token is forwarded to `onTokenReceived` and not retained here.
 *
 * Requirements: 7.3, 7.4, 13.5, 13.7, 13.9
 */

import { useState } from 'react';

import { Modal, ModalBody, ModalFooter, ModalHeader, Form } from '@patternfly/react-core';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaFormGroup } from '@/components/ha-form-group/HaFormGroup';
import { HaInlineBanner } from '@/components/ha-inline-banner/HaInlineBanner';
import { HaMultiSelect } from '@/components/ha-multi-select/HaMultiSelect';
import { HaTextInput } from '@/components/ha-text-input/HaTextInput';
import { useCreateApiKey } from '@/hooks/useCreateApiKey';
import type { HaApiKeyScope } from '@/types/apiKey.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_SCOPES: HaApiKeyScope[] = [
  'read_alerts',
  'write_alerts',
  'read_incidents',
  'read_logs',
  'manage_rules',
  'admin',
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface HaApiKeyCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Called with the plaintext token returned by the server (Req 5.4).
   * The parent MUST store it only in local useState and clear it after
   * the user acknowledges the token dialog (Req 7.4).
   */
  onTokenReceived: (token: string) => void;
}

// ---------------------------------------------------------------------------
// Local state shape
// ---------------------------------------------------------------------------

interface FormState {
  name: string;
  scopes: HaApiKeyScope[];
  expiresAt: string;
}

const INITIAL_FORM: FormState = {
  name: '',
  scopes: [],
  expiresAt: '',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HaApiKeyCreateModal({
  isOpen,
  onClose,
  onTokenReceived,
}: HaApiKeyCreateModalProps): JSX.Element {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { mutate, isPending } = useCreateApiKey();

  // ── Validation ────────────────────────────────────────────────────────────

  const nameError = form.name.trim().length === 0 ? 'Name is required.' : null;
  const scopesError = form.scopes.length === 0 ? 'Select at least one scope.' : null;
  const isValid = nameError === null && scopesError === null;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleNameChange = (value: string): void => {
    setForm((prev) => ({ ...prev, name: value }));
  };

  const handleScopesChange = (selected: string[]): void => {
    // Narrow to known scope values — no `any`.
    const validated = selected.filter((s): s is HaApiKeyScope =>
      (ALL_SCOPES as string[]).includes(s),
    );
    setForm((prev) => ({ ...prev, scopes: validated }));
  };

  const handleExpiresAtChange = (value: string): void => {
    setForm((prev) => ({ ...prev, expiresAt: value }));
  };

  const handleClose = (): void => {
    setForm(INITIAL_FORM);
    setSubmitError(null);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!isValid || isPending) return;

    setSubmitError(null);

    mutate(
      {
        name: form.name.trim(),
        scopes: form.scopes,
        ...(form.expiresAt.trim() ? { expiresAt: new Date(form.expiresAt).toISOString() } : {}),
      },
      {
        onSuccess: (created) => {
          handleClose();
          // Hand the plaintext token to the parent — never retained here.
          onTokenReceived(created.token);
        },
        onError: (err) => {
          setSubmitError(err.message ?? 'An unexpected error occurred. Please try again.');
        },
      },
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      aria-label="Create API Key"
      style={
        {
          '--pf-v5-c-modal-box--BackgroundColor': 'var(--ha-surface-raised)',
          '--pf-v5-c-modal-box--BoxShadow': 'var(--ha-shadow-control)',
          '--pf-v5-c-modal-box--BorderColor': 'var(--ha-border)',
          '--pf-v5-c-modal-box--BorderRadius': 'var(--ha-radius-lg)',
          '--pf-v5-c-modal-box__title--Color': 'var(--ha-text-primary)',
          '--pf-v5-c-modal-box__body--Color': 'var(--ha-text-primary)',
          '--pf-v5-c-modal-box--Width': '520px',
        } as React.CSSProperties
      }
    >
      <ModalHeader title="Create API Key" />
      <ModalBody>
        <Form id="ha-create-api-key-form" onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {submitError && (
              <HaInlineBanner
                variant="danger"
                title="Failed to create API key"
                description={submitError}
                isDismissible
                onDismiss={() => setSubmitError(null)}
              />
            )}

            {/* Name */}
            <HaFormGroup fieldId="ha-api-key-name" label="Name" isRequired>
              <HaTextInput
                id="ha-api-key-name"
                value={form.name}
                onChange={handleNameChange}
                placeholder="e.g. CI pipeline key"
                isRequired
                maxLength={128}
                validated={form.name.length > 0 && nameError !== null ? 'error' : 'default'}
              />
              {nameError !== null && form.name.length > 0 && (
                <p
                  style={{
                    fontSize: 'var(--ha-text-xs, 0.75rem)',
                    color: 'var(--ha-critical)',
                    margin: '4px 0 0',
                  }}
                >
                  {nameError}
                </p>
              )}
            </HaFormGroup>

            {/* Scopes */}
            <HaFormGroup fieldId="ha-api-key-scopes" label="Scopes" isRequired>
              <HaMultiSelect
                id="ha-api-key-scopes"
                options={ALL_SCOPES}
                selected={form.scopes}
                onChange={handleScopesChange}
                placeholder="Select scopes…"
              />
              <p
                style={{
                  fontSize: 'var(--ha-text-xs, 0.75rem)',
                  color:
                    scopesError !== null && submitError !== null
                      ? 'var(--ha-critical)'
                      : 'var(--ha-text-secondary)',
                  margin: '4px 0 0',
                }}
              >
                {scopesError !== null && submitError !== null
                  ? scopesError
                  : 'Hold Ctrl / Cmd to select multiple scopes.'}
              </p>
            </HaFormGroup>

            {/* Expiry (optional) */}
            <HaFormGroup fieldId="ha-api-key-expires" label="Expires at">
              <HaTextInput
                id="ha-api-key-expires"
                type="datetime-local"
                value={form.expiresAt}
                onChange={handleExpiresAtChange}
              />
              <p
                style={{
                  fontSize: 'var(--ha-text-xs, 0.75rem)',
                  color: 'var(--ha-text-secondary)',
                  margin: '4px 0 0',
                }}
              >
                Leave blank for a non-expiring key.
              </p>
            </HaFormGroup>
          </div>
        </Form>
      </ModalBody>
      <ModalFooter>
        <HaButton
          variant="primary"
          type="submit"
          form="ha-create-api-key-form"
          isDisabled={!isValid || isPending}
          isLoading={isPending}
          aria-label="Submit create API key form"
        >
          Create Key
        </HaButton>
        <HaButton variant="secondary" onClick={handleClose} isDisabled={isPending}>
          Cancel
        </HaButton>
      </ModalFooter>
    </Modal>
  );
}
