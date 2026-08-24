/**
 * AiLlmTab — AI/LLM configuration tab on the System Settings page.
 *
 * Behaviour:
 *   - Reads initial form values from GET /api/ha-admin/settings (via useSystemSettings).
 *   - Tracks `apiKeyTouched` as `true` only when the user types a value that
 *     differs from the one originally delivered by the GET response (Req 1.6).
 *   - Submit calls PUT /api/ha-admin/settings/ai via useUpdateAiSettings with
 *     { provider, model, endpoint, apiKey, apiKeyTouched } (Req 1.5).
 *   - "Test connection" triggers POST /api/ha-admin/settings/ai/test via useProbeLlm.
 *   - Probe failure ({ ok: false, error }) renders via HaInlineBanner (Req 2.5, 2.6).
 *
 * Platform invariants:
 *   - No hex color literals — all colors via var(--ha-*) design tokens (Req 13.9).
 *   - No `any` types (Req 13.8).
 *   - Ha* PatternFly 6 wrapper components only (Req 13.5).
 *
 * Requirements: 1.5, 1.6, 2.5, 2.6, 13.5, 13.8, 13.9
 */

import React, { useEffect, useRef, useState } from 'react';

import { Form } from '@patternfly/react-core';

import { LlmUsageSection } from './LlmUsageSection';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaFormGroup } from '@/components/ha-form-group/HaFormGroup';
import { HaInlineBanner } from '@/components/ha-inline-banner/HaInlineBanner';
import { HaSelect } from '@/components/ha-select/HaSelect';
import { HaTextInput } from '@/components/ha-text-input/HaTextInput';
import { useProbeLlm } from '@/hooks/useProbeLlm';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useUpdateAiSettings } from '@/hooks/useUpdateAiSettings';
import type { LlmProvider } from '@/types/systemSettings.types';

// ---------------------------------------------------------------------------
// Provider options
// ---------------------------------------------------------------------------

const PROVIDER_OPTIONS: Array<{ value: LlmProvider; label: string }> = [
  { value: 'openai',     label: 'OpenAI' },
  { value: 'azure',      label: 'Azure OpenAI' },
  { value: 'anthropic',  label: 'Anthropic' },
  { value: 'ollama',     label: 'Ollama (self-hosted)' },
  { value: 'custom',     label: 'Custom endpoint' },
];

// Sentinel used by the backend for masked secret values
const MASKED_SENTINEL = '***';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * AI / LLM configuration tab.
 *
 * Mounted inside SystemSettingsPage when the "AI/LLM" tab is active.
 * All server state is driven by TanStack Query hooks; no direct fetch calls.
 */
export function AiLlmTab(): JSX.Element {
  const { data: settings } = useSystemSettings();
  const updateMutation = useUpdateAiSettings();
  const probeMutation = useProbeLlm();

  // ── Form state ────────────────────────────────────────────────────────────
  const [provider, setProvider] = useState<LlmProvider>('openai');
  const [model, setModel]       = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey]     = useState(MASKED_SENTINEL);

  /**
   * The value delivered by GET — used to detect real edits.
   * Stored in a ref so it does not re-render the component when updated.
   */
  const initialApiKey = useRef<string>(MASKED_SENTINEL);

  /**
   * apiKeyTouched is true only when the user has typed a value different from
   * the initial one returned by the server (Req 1.6).
   */
  const [apiKeyTouched, setApiKeyTouched] = useState(false);

  // ── Probe banner state ────────────────────────────────────────────────────
  const [showProbeBanner, setShowProbeBanner] = useState(false);

  // ── Hydrate form from server response ────────────────────────────────────
  useEffect(() => {
    if (settings?.ai) {
      const ai = settings.ai;
      setProvider(ai.provider);
      setModel(ai.model);
      setEndpoint(ai.endpoint);
      setApiKey(ai.apiKey);
      initialApiKey.current = ai.apiKey;
      setApiKeyTouched(false);
    }
  }, [settings?.ai]);

  // Dismiss the probe banner whenever the user changes any field
  useEffect(() => {
    setShowProbeBanner(false);
  }, [provider, model, endpoint, apiKey]);

  // Show probe banner when the probe mutation completes
  useEffect(() => {
    if (probeMutation.data !== undefined) {
      setShowProbeBanner(true);
    }
  }, [probeMutation.data]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleApiKeyChange = (value: string): void => {
    setApiKey(value);
    // Touched only when the typed value differs from what the server sent (Req 1.6)
    setApiKeyTouched(value !== initialApiKey.current);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    updateMutation.mutate({ provider, model, endpoint, apiKey, apiKeyTouched });
  };

  const handleProbe = (): void => {
    setShowProbeBanner(false);
    probeMutation.mutate();
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const probeResult  = probeMutation.data;
  const probePending = probeMutation.isPending;

  // Whether the last save succeeded
  const saveSuccess  = updateMutation.isSuccess;
  const savePending  = updateMutation.isPending;
  const saveError    = updateMutation.isError
    ? (updateMutation.error?.message ?? 'An unexpected error occurred while saving.')
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        maxWidth: '960px',
        padding: 'var(--pf-v5-global--spacer--lg, 1.5rem)',
      }}
    >
      <div style={{ maxWidth: '640px' }}>
      {/* ── Save-level success banner ──────────────────────────────────── */}
      {saveSuccess && (
        <HaInlineBanner
          variant="success"
          title="Settings saved"
          description="AI/LLM configuration has been updated. HiveArmor has reloaded the LLM client."
          isDismissible
          onDismiss={() => updateMutation.reset()}
        />
      )}

      {/* ── Save-level error banner ────────────────────────────────────── */}
      {saveError !== null && (
        <HaInlineBanner
          variant="danger"
          title="Save failed"
          description={saveError}
          isDismissible
          onDismiss={() => updateMutation.reset()}
        />
      )}

      {/* ── Probe result banner ────────────────────────────────────────── */}
      {showProbeBanner && probeResult !== undefined && (
        probeResult.ok ? (
          <HaInlineBanner
            variant="success"
            title="Connection successful"
            description={
              probeResult.latencyMs !== undefined
                ? `LLM endpoint responded in ${probeResult.latencyMs} ms.`
                : 'LLM endpoint responded successfully.'
            }
            isDismissible
            onDismiss={() => {
              setShowProbeBanner(false);
              probeMutation.reset();
            }}
          />
        ) : (
          <HaInlineBanner
            variant="danger"
            title="Connection failed"
            description={probeResult.error ?? 'The LLM endpoint did not respond.'}
            isDismissible
            onDismiss={() => {
              setShowProbeBanner(false);
              probeMutation.reset();
            }}
          />
        )
      )}

      {/* ── Settings form ──────────────────────────────────────────────── */}
      <Form onSubmit={handleSubmit}>
        {/* Provider */}
        <HaFormGroup
          label="Provider"
          fieldId="ai-provider"
          isRequired
        >
          <HaSelect
            options={PROVIDER_OPTIONS}
            value={provider}
            onChange={(value) => setProvider(value as LlmProvider)}
            placeholder="Select a provider"
          />
        </HaFormGroup>

        {/* Model */}
        <HaFormGroup
          label="Model"
          fieldId="ai-model"
          isRequired
        >
          <HaTextInput
            id="ai-model"
            type="text"
            value={model}
            onChange={setModel}
            placeholder="Model identifier"
            aria-label="Model identifier"
            aria-describedby="ai-model-helper"
          />
          <div
            id="ai-model-helper"
            style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', marginTop: '4px' }}
          >
            For example: gpt-4o, claude-3-5-sonnet, llama3
          </div>
        </HaFormGroup>

        {/* Endpoint */}
        <HaFormGroup
          label="Endpoint URL"
          fieldId="ai-endpoint"
          isRequired
        >
          <HaTextInput
            id="ai-endpoint"
            type="url"
            value={endpoint}
            onChange={setEndpoint}
            placeholder="https://api.openai.com/v1"
            aria-label="Endpoint URL"
            aria-describedby="ai-endpoint-helper"
          />
          <div
            id="ai-endpoint-helper"
            style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', marginTop: '4px' }}
          >
            Base URL for the LLM API (e.g. https://api.openai.com/v1)
          </div>
        </HaFormGroup>

        {/* API Key */}
        <HaFormGroup
          label="API Key"
          fieldId="ai-api-key"
        >
          <HaTextInput
            id="ai-api-key"
            type="password"
            value={apiKey}
            onChange={handleApiKeyChange}
            placeholder={MASKED_SENTINEL}
            aria-label="API key"
            autoComplete="new-password"
            aria-describedby="ai-api-key-helper"
          />
          <div
            id="ai-api-key-helper"
            style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', marginTop: '4px' }}
          >
            {apiKeyTouched
              ? 'New key will be saved and encrypted at rest.'
              : 'Leave unchanged to keep the current stored key.'}
          </div>
        </HaFormGroup>

        {/* Action row */}
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
            isDisabled={savePending}
            aria-label="Save AI/LLM settings"
          >
            Save settings
          </HaButton>

          <HaButton
            type="button"
            variant="secondary"
            isLoading={probePending}
            isDisabled={probePending || savePending}
            onClick={handleProbe}
            aria-label="Test LLM connection"
          >
            Test connection
          </HaButton>
        </div>
      </Form>
      </div>

      <LlmUsageSection />
    </div>
  );
}
