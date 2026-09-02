/**
 * EmailTab — Email/SMTP configuration tab on the System Settings page.
 *
 * Behaviour (mirrors AiLlmTab):
 *   - Reads initial values from GET /api/ha-admin/settings (useSystemSettings),
 *     hydrating local state from settings.email inside a useEffect.
 *   - Submit calls PUT /api/ha-admin/settings/email via useUpdateEmailSettings.
 *   - The password field defaults to the masked sentinel "***"; a touched-ref
 *     tracks whether the user actually edited it, so the real value is only sent
 *     when changed — otherwise "***" is sent and the backend preserves the
 *     stored password (Req 3.2).
 *   - "Send test email" prompts for a recipient (default = from address), calls
 *     useSendTestEmail, and renders a success/danger banner. The test uses the
 *     SAVED settings, so helper text tells the user to Save first (Req 3.2, 4).
 *   - Client-side validation blocks Save; numeric port clamps to range (Req 5).
 *   - Banners live inside an aria-live region.
 *
 * Platform invariants:
 *   - No hex color literals — all colors via var(--ha-*) design tokens (Req 6).
 *   - No `any` types (Req 6).
 *   - Ha* PatternFly 6 wrapper components only (Req 6).
 *
 * Requirements: 1.2, 3.2, 4, 5, 6
 */

import React, { useEffect, useRef, useState } from 'react';

import { Form } from '@patternfly/react-core';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaFormGroup } from '@/components/ha-form-group/HaFormGroup';
import { HaInlineBanner } from '@/components/ha-inline-banner/HaInlineBanner';
import { HaSwitch } from '@/components/ha-switch/HaSwitch';
import { HaTextInput } from '@/components/ha-text-input/HaTextInput';
import { useSendTestEmail } from '@/hooks/useSendTestEmail';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useUpdateEmailSettings } from '@/hooks/useUpdateEmailSettings';

// Sentinel the backend uses for masked secret values (mirrors AiLlmTab).
const MASKED_SENTINEL = '***';

const PORT_MIN = 1;
const PORT_MAX = 65535;

// Simple, permissive email format check (client-side gate only).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clampPort(value: number): number {
  if (Number.isNaN(value)) {
    return PORT_MIN;
  }
  return Math.min(Math.max(value, PORT_MIN), PORT_MAX);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface EmailErrors {
  host?: string;
  port?: string;
  from?: string;
}

function validate(host: string, port: number, from: string): EmailErrors {
  const errors: EmailErrors = {};
  if (host.trim().length === 0) {
    errors.host = 'SMTP host is required.';
  }
  if (!Number.isInteger(port) || port < PORT_MIN || port > PORT_MAX) {
    errors.port = `Port must be ${PORT_MIN}–${PORT_MAX}.`;
  }
  if (!EMAIL_RE.test(from.trim())) {
    errors.from = 'A valid From address is required.';
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmailTab(): JSX.Element {
  const { data: settings } = useSystemSettings();
  const updateMutation = useUpdateEmailSettings();
  const testMutation = useSendTestEmail();

  const [host, setHost] = useState('');
  const [port, setPort] = useState<number>(587);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(MASKED_SENTINEL);
  const [from, setFrom] = useState('');
  const [useTls, setUseTls] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  // Value delivered by GET — used to detect real password edits (Req 3.2).
  const initialPassword = useRef<string>(MASKED_SENTINEL);
  const [passwordTouched, setPasswordTouched] = useState(false);

  // Test-send recipient (defaults to the From address).
  const [recipient, setRecipient] = useState('');
  const [recipientDirty, setRecipientDirty] = useState(false);

  useEffect(() => {
    if (settings?.email) {
      const email = settings.email;
      setHost(email.host);
      setPort(email.port);
      setUsername(email.username);
      setPassword(email.password);
      setFrom(email.from);
      setUseTls(email.useTls);
      initialPassword.current = email.password;
      setPasswordTouched(false);
    }
  }, [settings?.email]);

  // Keep recipient defaulted to the From address until the user edits it.
  useEffect(() => {
    if (!recipientDirty) {
      setRecipient(from);
    }
  }, [from, recipientDirty]);

  const errors = validate(host, port, from);
  const hasErrors = Object.keys(errors).length > 0;

  const handlePasswordChange = (value: string): void => {
    setPassword(value);
    setPasswordTouched(value !== initialPassword.current);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setSubmitted(true);
    if (hasErrors) {
      return;
    }
    // Only send the real password when the user edited it; otherwise send the
    // sentinel so the backend preserves the stored password.
    updateMutation.mutate({
      host: host.trim(),
      port,
      username,
      password: passwordTouched ? password : MASKED_SENTINEL,
      from: from.trim(),
      useTls,
    });
  };

  const handleSendTest = (): void => {
    testMutation.reset();
    testMutation.mutate(recipient.trim());
  };

  const saveSuccess = updateMutation.isSuccess;
  const savePending = updateMutation.isPending;
  const saveError = updateMutation.isError
    ? (updateMutation.error?.message ?? 'An unexpected error occurred while saving.')
    : null;

  const testPending = testMutation.isPending;
  const testResult = testMutation.data;
  const testMutationError = testMutation.isError
    ? (testMutation.error?.message ?? 'The test email could not be sent.')
    : null;

  const recipientValid = EMAIL_RE.test(recipient.trim());

  return (
    <div style={{ maxWidth: '960px', padding: 'var(--pf-v5-global--spacer--lg, 1.5rem)' }}>
      <div style={{ maxWidth: '640px' }}>
        <div aria-live="polite">
          {saveSuccess && (
            <HaInlineBanner
              variant="success"
              title="Settings saved"
              description="Email/SMTP configuration has been updated."
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

          {/* Test-send result banner */}
          {testResult !== undefined && (
            testResult.ok ? (
              <HaInlineBanner
                variant="success"
                title="Test email sent"
                description={`Test email sent to ${recipient.trim()}.`}
                isDismissible
                onDismiss={() => testMutation.reset()}
              />
            ) : (
              <HaInlineBanner
                variant="danger"
                title="Test email failed"
                description={testResult.error ?? 'The SMTP server did not accept the message.'}
                isDismissible
                onDismiss={() => testMutation.reset()}
              />
            )
          )}
          {testMutationError !== null && testResult === undefined && (
            <HaInlineBanner
              variant="danger"
              title="Test email failed"
              description={testMutationError}
              isDismissible
              onDismiss={() => testMutation.reset()}
            />
          )}
        </div>

        <Form onSubmit={handleSubmit}>
          {/* Host */}
          <HaFormGroup label="SMTP host" fieldId="email-host" isRequired>
            <HaTextInput
              id="email-host"
              type="text"
              value={host}
              onChange={setHost}
              placeholder="smtp.example.com"
              aria-label="SMTP host"
              aria-describedby="email-host-helper"
            />
            {submitted && errors.host && (
              <div id="email-host-helper" style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-critical)', marginTop: '4px' }}>
                {errors.host}
              </div>
            )}
          </HaFormGroup>

          {/* Port */}
          <HaFormGroup label="Port" fieldId="email-port" isRequired>
            <HaTextInput
              id="email-port"
              type="number"
              min={PORT_MIN}
              max={PORT_MAX}
              value={String(port)}
              onChange={(v) => setPort(clampPort(Number.parseInt(v, 10)))}
              aria-label="SMTP port"
              aria-describedby="email-port-helper"
            />
            <div
              id="email-port-helper"
              style={{
                fontSize: 'var(--ha-text-sm)',
                color: submitted && errors.port ? 'var(--ha-critical)' : 'var(--ha-text-secondary)',
                marginTop: '4px',
              }}
            >
              {submitted && errors.port ? errors.port : `Common values: 587 (STARTTLS), 465 (SSL), 25 (${PORT_MIN}–${PORT_MAX}).`}
            </div>
          </HaFormGroup>

          {/* Username */}
          <HaFormGroup label="Username" fieldId="email-username">
            <HaTextInput
              id="email-username"
              type="text"
              value={username}
              onChange={setUsername}
              placeholder="Optional"
              aria-label="SMTP username"
            />
          </HaFormGroup>

          {/* Password */}
          <HaFormGroup label="Password" fieldId="email-password">
            <HaTextInput
              id="email-password"
              type="password"
              value={password}
              onChange={handlePasswordChange}
              placeholder={MASKED_SENTINEL}
              aria-label="SMTP password"
              autoComplete="new-password"
              aria-describedby="email-password-helper"
            />
            <div
              id="email-password-helper"
              style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', marginTop: '4px' }}
            >
              {passwordTouched
                ? 'New password will be saved and encrypted at rest.'
                : 'Leave unchanged to keep the current stored password.'}
            </div>
          </HaFormGroup>

          {/* From address */}
          <HaFormGroup label="From address" fieldId="email-from" isRequired>
            <HaTextInput
              id="email-from"
              type="email"
              value={from}
              onChange={setFrom}
              placeholder="hivearmor@example.com"
              aria-label="From address"
              aria-describedby="email-from-helper"
            />
            {submitted && errors.from && (
              <div id="email-from-helper" style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-critical)', marginTop: '4px' }}>
                {errors.from}
              </div>
            )}
          </HaFormGroup>

          {/* Use TLS */}
          <HaFormGroup label="Use TLS / STARTTLS" fieldId="email-use-tls">
            <HaSwitch
              id="email-use-tls"
              label="Encrypt the connection to the SMTP server."
              isChecked={useTls}
              onChange={setUseTls}
            />
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
              aria-label="Save email settings"
            >
              Save settings
            </HaButton>
          </div>
        </Form>

        {/* ── Test-send section ─────────────────────────────────────────── */}
        <div style={{ marginTop: 'var(--pf-v5-global--spacer--lg, 1.5rem)' }}>
          <HaFormGroup label="Send test email" fieldId="email-test-recipient">
            <HaTextInput
              id="email-test-recipient"
              type="email"
              value={recipient}
              onChange={(v) => {
                setRecipientDirty(true);
                setRecipient(v);
              }}
              placeholder="recipient@example.com"
              aria-label="Test email recipient"
              aria-describedby="email-test-helper"
            />
            <div
              id="email-test-helper"
              style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', marginTop: '4px' }}
            >
              The test uses the currently saved SMTP settings, so save your changes first.
            </div>
          </HaFormGroup>
          <div style={{ marginTop: '12px' }}>
            <HaButton
              type="button"
              variant="secondary"
              isLoading={testPending}
              isDisabled={testPending || savePending || !recipientValid}
              onClick={handleSendTest}
              aria-label="Send test email"
            >
              Send test email
            </HaButton>
          </div>
        </div>
      </div>
    </div>
  );
}
