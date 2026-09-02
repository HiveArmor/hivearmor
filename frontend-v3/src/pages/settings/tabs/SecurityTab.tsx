/**
 * SecurityTab — Security policy tab on the System Settings page.
 *
 * Behaviour (mirrors AiLlmTab):
 *   - Reads initial values from GET /api/ha-admin/settings (useSystemSettings),
 *     hydrating local state from settings.security inside a useEffect.
 *   - Submit calls PUT /api/ha-admin/settings/security via
 *     useUpdateSecuritySettings with
 *     { sessionTimeoutMinutes, mfaRequired, passwordMinLength }.
 *   - Numeric fields clamp to their valid range; validation blocks Save on
 *     invalid input and surfaces inline messages (Req 3.3, 5).
 *   - Success/error rendered via HaInlineBanner inside an aria-live region.
 *
 * Platform invariants:
 *   - No hex color literals — all colors via var(--ha-*) design tokens (Req 6).
 *   - No `any` types (Req 6).
 *   - Ha* PatternFly 6 wrapper components only (Req 6).
 *
 * Requirements: 1.2, 3.3, 5, 6
 */

import React, { useEffect, useState } from 'react';

import { Form } from '@patternfly/react-core';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaFormGroup } from '@/components/ha-form-group/HaFormGroup';
import { HaInlineBanner } from '@/components/ha-inline-banner/HaInlineBanner';
import { HaSwitch } from '@/components/ha-switch/HaSwitch';
import { HaTextInput } from '@/components/ha-text-input/HaTextInput';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useUpdateSecuritySettings } from '@/hooks/useUpdateSecuritySettings';

// ---------------------------------------------------------------------------
// Range bounds
// ---------------------------------------------------------------------------

const SESSION_MIN = 5;
const SESSION_MAX = 1440;
const PWD_MIN = 8;
const PWD_MAX = 128;

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface SecurityErrors {
  sessionTimeoutMinutes?: string;
  passwordMinLength?: string;
}

function validate(sessionTimeoutMinutes: number, passwordMinLength: number): SecurityErrors {
  const errors: SecurityErrors = {};
  if (
    !Number.isInteger(sessionTimeoutMinutes) ||
    sessionTimeoutMinutes < SESSION_MIN ||
    sessionTimeoutMinutes > SESSION_MAX
  ) {
    errors.sessionTimeoutMinutes = `Session timeout must be ${SESSION_MIN}–${SESSION_MAX} minutes.`;
  }
  if (
    !Number.isInteger(passwordMinLength) ||
    passwordMinLength < PWD_MIN ||
    passwordMinLength > PWD_MAX
  ) {
    errors.passwordMinLength = `Minimum password length must be ${PWD_MIN}–${PWD_MAX}.`;
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SecurityTab(): JSX.Element {
  const { data: settings } = useSystemSettings();
  const updateMutation = useUpdateSecuritySettings();

  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState<number>(SESSION_MIN);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [passwordMinLength, setPasswordMinLength] = useState<number>(PWD_MIN);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (settings?.security) {
      setSessionTimeoutMinutes(settings.security.sessionTimeoutMinutes);
      setMfaRequired(settings.security.mfaRequired);
      setPasswordMinLength(settings.security.passwordMinLength);
    }
  }, [settings?.security]);

  const errors = validate(sessionTimeoutMinutes, passwordMinLength);
  const hasErrors = Object.keys(errors).length > 0;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setSubmitted(true);
    if (hasErrors) {
      return;
    }
    updateMutation.mutate({ sessionTimeoutMinutes, mfaRequired, passwordMinLength });
  };

  const saveSuccess = updateMutation.isSuccess;
  const savePending = updateMutation.isPending;
  const saveError = updateMutation.isError
    ? (updateMutation.error?.message ?? 'An unexpected error occurred while saving.')
    : null;

  return (
    <div style={{ maxWidth: '960px', padding: 'var(--pf-v5-global--spacer--lg, 1.5rem)' }}>
      <div style={{ maxWidth: '640px' }}>
        <div aria-live="polite">
          {saveSuccess && (
            <HaInlineBanner
              variant="success"
              title="Settings saved"
              description="Security policy has been updated."
              isDismissible
              onDismiss={() => updateMutation.reset()}
            />
          )}
          {saveError !== null && (
            <HaInlineBanner
              variant="danger"
              title="Save failed"
              description={saveError}
              isDismissible
              onDismiss={() => updateMutation.reset()}
            />
          )}
        </div>

        <Form onSubmit={handleSubmit}>
          {/* Session timeout */}
          <HaFormGroup label="Session timeout (minutes)" fieldId="security-session-timeout" isRequired>
            <HaTextInput
              id="security-session-timeout"
              type="number"
              min={SESSION_MIN}
              max={SESSION_MAX}
              value={String(sessionTimeoutMinutes)}
              onChange={(v) => setSessionTimeoutMinutes(clamp(Number.parseInt(v, 10), SESSION_MIN, SESSION_MAX))}
              aria-label="Session timeout in minutes"
              aria-describedby="security-session-timeout-helper"
            />
            <div
              id="security-session-timeout-helper"
              style={{
                fontSize: 'var(--ha-text-sm)',
                color: submitted && errors.sessionTimeoutMinutes ? 'var(--ha-critical)' : 'var(--ha-text-secondary)',
                marginTop: '4px',
              }}
            >
              {submitted && errors.sessionTimeoutMinutes
                ? errors.sessionTimeoutMinutes
                : `Idle time before a session expires (${SESSION_MIN}–${SESSION_MAX} minutes).`}
            </div>
          </HaFormGroup>

          {/* MFA required */}
          <HaFormGroup label="Require MFA for all users" fieldId="security-mfa-required">
            <HaSwitch
              id="security-mfa-required"
              label="Every user must complete multi-factor authentication at sign-in."
              isChecked={mfaRequired}
              onChange={setMfaRequired}
            />
          </HaFormGroup>

          {/* Minimum password length */}
          <HaFormGroup label="Minimum password length" fieldId="security-password-min-length" isRequired>
            <HaTextInput
              id="security-password-min-length"
              type="number"
              min={PWD_MIN}
              max={PWD_MAX}
              value={String(passwordMinLength)}
              onChange={(v) => setPasswordMinLength(clamp(Number.parseInt(v, 10), PWD_MIN, PWD_MAX))}
              aria-label="Minimum password length"
              aria-describedby="security-password-min-length-helper"
            />
            <div
              id="security-password-min-length-helper"
              style={{
                fontSize: 'var(--ha-text-sm)',
                color: submitted && errors.passwordMinLength ? 'var(--ha-critical)' : 'var(--ha-text-secondary)',
                marginTop: '4px',
              }}
            >
              {submitted && errors.passwordMinLength
                ? errors.passwordMinLength
                : `Minimum characters required for user passwords (${PWD_MIN}–${PWD_MAX}).`}
            </div>
          </HaFormGroup>

          <div
            style={{
              display: 'flex',
              gap: '12px',
              marginTop: 'var(--pf-v5-global--spacer--md, 1rem)',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <HaButton
              type="submit"
              variant="primary"
              isLoading={savePending}
              isDisabled={savePending || (submitted && hasErrors)}
              aria-label="Save security settings"
            >
              Save settings
            </HaButton>
          </div>
        </Form>
      </div>
    </div>
  );
}
