/**
 * GeneralTab — General configuration tab on the System Settings page.
 *
 * Behaviour (mirrors AiLlmTab):
 *   - Reads initial values from GET /api/ha-admin/settings (useSystemSettings),
 *     hydrating local state from settings.general inside a useEffect.
 *   - Submit calls PUT /api/ha-admin/settings/general via useUpdateGeneralSettings
 *     with { siteName, timezone, defaultLocale }.
 *   - Client-side validation blocks Save on invalid input and surfaces inline
 *     messages (Req 3.1, 5).
 *   - Success/error rendered via HaInlineBanner inside an aria-live region.
 *
 * Platform invariants:
 *   - No hex color literals — all colors via var(--ha-*) design tokens (Req 6).
 *   - No `any` types (Req 6).
 *   - Ha* PatternFly 6 wrapper components only (Req 6).
 *
 * Requirements: 1.2, 3.1, 5, 6
 */

import React, { useEffect, useState } from 'react';

import { Form } from '@patternfly/react-core';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaFormGroup } from '@/components/ha-form-group/HaFormGroup';
import { HaInlineBanner } from '@/components/ha-inline-banner/HaInlineBanner';
import { HaSelect } from '@/components/ha-select/HaSelect';
import { HaTextInput } from '@/components/ha-text-input/HaTextInput';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useUpdateGeneralSettings } from '@/hooks/useUpdateGeneralSettings';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

// A reasonable, representative IANA timezone list (Req 3.1).
const TIMEZONE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'UTC',                  label: 'UTC' },
  { value: 'America/New_York',     label: 'America/New_York' },
  { value: 'America/Chicago',      label: 'America/Chicago' },
  { value: 'America/Denver',       label: 'America/Denver' },
  { value: 'America/Los_Angeles',  label: 'America/Los_Angeles' },
  { value: 'America/Sao_Paulo',    label: 'America/Sao_Paulo' },
  { value: 'Europe/London',        label: 'Europe/London' },
  { value: 'Europe/Paris',         label: 'Europe/Paris' },
  { value: 'Europe/Berlin',        label: 'Europe/Berlin' },
  { value: 'Europe/Madrid',        label: 'Europe/Madrid' },
  { value: 'Africa/Johannesburg',  label: 'Africa/Johannesburg' },
  { value: 'Asia/Dubai',           label: 'Asia/Dubai' },
  { value: 'Asia/Kolkata',         label: 'Asia/Kolkata' },
  { value: 'Asia/Singapore',       label: 'Asia/Singapore' },
  { value: 'Asia/Tokyo',           label: 'Asia/Tokyo' },
  { value: 'Australia/Sydney',     label: 'Australia/Sydney' },
];

const LOCALE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'en',    label: 'English (en)' },
  { value: 'es',    label: 'Español (es)' },
  { value: 'fr',    label: 'Français (fr)' },
  { value: 'de',    label: 'Deutsch (de)' },
  { value: 'pt-BR', label: 'Português — Brasil (pt-BR)' },
  { value: 'ja',    label: '日本語 (ja)' },
];

const KNOWN_TIMEZONES = new Set(TIMEZONE_OPTIONS.map((o) => o.value));
const KNOWN_LOCALES = new Set(LOCALE_OPTIONS.map((o) => o.value));

const SITE_NAME_MIN = 1;
const SITE_NAME_MAX = 120;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface GeneralErrors {
  siteName?: string;
  timezone?: string;
  defaultLocale?: string;
}

function validate(siteName: string, timezone: string, defaultLocale: string): GeneralErrors {
  const errors: GeneralErrors = {};
  const trimmed = siteName.trim();
  if (trimmed.length < SITE_NAME_MIN || trimmed.length > SITE_NAME_MAX) {
    errors.siteName = `Site name is required and must be ${SITE_NAME_MIN}–${SITE_NAME_MAX} characters.`;
  }
  if (!KNOWN_TIMEZONES.has(timezone)) {
    errors.timezone = 'Select a valid timezone.';
  }
  if (!KNOWN_LOCALES.has(defaultLocale)) {
    errors.defaultLocale = 'Select a valid locale.';
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GeneralTab(): JSX.Element {
  const { data: settings } = useSystemSettings();
  const updateMutation = useUpdateGeneralSettings();

  const [siteName, setSiteName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [defaultLocale, setDefaultLocale] = useState('en');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (settings?.general) {
      setSiteName(settings.general.siteName);
      setTimezone(settings.general.timezone);
      setDefaultLocale(settings.general.defaultLocale);
    }
  }, [settings?.general]);

  const errors = validate(siteName, timezone, defaultLocale);
  const hasErrors = Object.keys(errors).length > 0;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setSubmitted(true);
    if (hasErrors) {
      return;
    }
    updateMutation.mutate({ siteName: siteName.trim(), timezone, defaultLocale });
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
              description="General configuration has been updated."
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
          {/* Site name */}
          <HaFormGroup label="Site name" fieldId="general-site-name" isRequired>
            <HaTextInput
              id="general-site-name"
              type="text"
              value={siteName}
              onChange={setSiteName}
              placeholder="HiveArmor"
              aria-label="Site name"
              aria-describedby="general-site-name-helper"
            />
            <div
              id="general-site-name-helper"
              style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', marginTop: '4px' }}
            >
              {submitted && errors.siteName
                ? errors.siteName
                : `Display name shown across HiveArmor (${SITE_NAME_MIN}–${SITE_NAME_MAX} characters).`}
            </div>
          </HaFormGroup>

          {/* Timezone */}
          <HaFormGroup label="Timezone" fieldId="general-timezone" isRequired>
            <HaSelect
              id="general-timezone"
              options={TIMEZONE_OPTIONS}
              value={timezone}
              onChange={setTimezone}
              placeholder="Select a timezone"
              ariaLabel="Timezone"
            />
            {submitted && errors.timezone && (
              <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-critical)', marginTop: '4px' }}>
                {errors.timezone}
              </div>
            )}
          </HaFormGroup>

          {/* Default locale */}
          <HaFormGroup label="Default locale" fieldId="general-locale" isRequired>
            <HaSelect
              id="general-locale"
              options={LOCALE_OPTIONS}
              value={defaultLocale}
              onChange={setDefaultLocale}
              placeholder="Select a locale"
              ariaLabel="Default locale"
            />
            {submitted && errors.defaultLocale && (
              <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-critical)', marginTop: '4px' }}>
                {errors.defaultLocale}
              </div>
            )}
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
              aria-label="Save general settings"
            >
              Save settings
            </HaButton>
          </div>
        </Form>
      </div>
    </div>
  );
}
