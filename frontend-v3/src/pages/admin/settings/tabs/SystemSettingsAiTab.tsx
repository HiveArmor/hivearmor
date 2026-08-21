/**
 * SystemSettingsAiTab.tsx — AI Provider configuration tab (Sprint 27, Task 6.9)
 *
 * Features:
 *  - TanStack Query v5 `useQuery` on `llmAdminService.getStatus`
 *  - Provider select (disabled / openai / azure / ollama)
 *  - Save button (calls updateConfig → invalidates status query)
 *  - Connection status badge ("Configured" / "Not configured")
 *  - Latency badge (status.latencyMs)
 *  - Ollama panel rendered ONLY when status.provider === 'ollama':
 *      · Base URL input
 *      · Model dropdown (populated from llmAdminService.listModels)
 *      · Pull button + model input
 *      · Pull progress indicator
 *
 * Zero hard-coded hex colours — all via var(--ha-*) CSS custom properties.
 * Zero `any` TypeScript types.
 *
 * Requirements: 7.4, 7.5, 9.4
 */

import { useCallback, useRef, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, CloudDownload, Loader2, Zap } from 'lucide-react';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaSelect } from '@/components/ha-select/HaSelect';
import { HaTextInput } from '@/components/ha-text-input/HaTextInput';
import { llmAdminService } from '@/services/llmAdmin.service';
import type { LlmConfigUpdateDTO, OllamaPullProgress } from '@/types/llmAdmin.types';
import { LlmAdminError } from '@/types/llmAdmin.types';

// ─── Query keys ──────────────────────────────────────────────────────────────

const QUERY_KEYS = {
  llmStatus: ['llm', 'status'] as const,
  llmModels: ['llm', 'models'] as const,
} as const;

// ─── Provider options ─────────────────────────────────────────────────────────

const PROVIDER_OPTIONS = [
  { value: 'disabled', label: 'Disabled' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'azure', label: 'Azure OpenAI' },
  { value: 'ollama', label: 'Ollama (self-hosted)' },
] satisfies Array<{ value: string; label: string }>;

// ─── Pull state ──────────────────────────────────────────────────────────────

type PullState =
  | { phase: 'idle' }
  | { phase: 'pulling'; lastProgress: OllamaPullProgress | null }
  | { phase: 'done' }
  | { phase: 'error'; message: string };

// ─── Inline style helpers ─────────────────────────────────────────────────────

const S = {
  section: {
    background: 'var(--ha-surface-primary)',
    border: '1px solid var(--ha-border)',
    borderRadius: 'var(--ha-radius-base)',
    padding: '24px',
  } satisfies React.CSSProperties,

  sectionTitle: {
    fontSize: 'var(--ha-text-md)',
    fontWeight: 600 as const,
    color: 'var(--ha-text-primary)',
    marginBottom: '16px',
    marginTop: 0,
  } satisfies React.CSSProperties,

  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  } satisfies React.CSSProperties,

  fieldLabel: {
    fontSize: 'var(--ha-text-sm)',
    fontWeight: 500 as const,
    color: 'var(--ha-text-primary)',
  } satisfies React.CSSProperties,

  fieldHint: {
    fontSize: 'var(--ha-text-xs)',
    color: 'var(--ha-text-secondary)',
    marginTop: '2px',
  } satisfies React.CSSProperties,

  badge: (color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: 'var(--ha-radius-sm)',
    fontSize: 'var(--ha-text-xs)',
    fontWeight: 600,
    color,
    background: `color-mix(in srgb, ${color} 15%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
  }),

  progressBar: (percent: number): React.CSSProperties => ({
    height: '6px',
    borderRadius: 'var(--ha-radius-sm)',
    background: 'var(--ha-border)',
    overflow: 'hidden',
    position: 'relative' as const,
    width: '100%',
    marginTop: '8px',
    marginBottom: '4px',
    ...(percent > 0 && {
      backgroundImage: `linear-gradient(to right, var(--ha-primary) ${percent}%, var(--ha-border) ${percent}%)`,
    }),
  }),
} as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ configured }: { configured: boolean }): JSX.Element {
  const color = configured ? 'var(--ha-positive)' : 'var(--ha-critical)';
  return (
    <span style={S.badge(color)}>
      {configured ? <Check size={10} /> : <AlertCircle size={10} />}
      {configured ? 'Configured' : 'Not configured'}
    </span>
  );
}

function LatencyBadge({ latencyMs }: { latencyMs: number | null }): JSX.Element | null {
  if (latencyMs === null) return null;
  return (
    <span style={S.badge('var(--ha-medium)')}>
      <Zap size={10} />
      {latencyMs} ms
    </span>
  );
}

function PullProgressView({ state }: { state: PullState }): JSX.Element | null {
  if (state.phase === 'idle') return null;

  if (state.phase === 'error') {
    return (
      <div
        role="alert"
        style={{
          padding: '10px 14px',
          background: 'var(--ha-fill-critical-subtle)',
          border: '1px solid var(--ha-critical)',
          borderRadius: 'var(--ha-radius-base)',
          fontSize: 'var(--ha-text-sm)',
          color: 'var(--ha-critical)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '12px',
        }}
      >
        <AlertCircle size={14} />
        {state.message}
      </div>
    );
  }

  if (state.phase === 'done') {
    return (
      <div
        style={{
          padding: '10px 14px',
          background: 'var(--ha-fill-low-subtle)',
          border: '1px solid var(--ha-positive)',
          borderRadius: 'var(--ha-radius-base)',
          fontSize: 'var(--ha-text-sm)',
          color: 'var(--ha-positive)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '12px',
        }}
      >
        <Check size={14} />
        Model pulled successfully
      </div>
    );
  }

  // phase === 'pulling'
  const progress = state.lastProgress;
  const hasBytes =
    progress !== null &&
    progress.total !== null &&
    progress.completed !== null &&
    progress.total > 0;
  const percent = hasBytes && progress
    ? Math.round(((progress.completed ?? 0) / (progress.total ?? 1)) * 100)
    : 0;

  return (
    <div style={{ marginTop: '12px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: 'var(--ha-text-sm)',
          color: 'var(--ha-text-secondary)',
          marginBottom: '6px',
        }}
      >
        <Loader2
          size={14}
          style={{ animation: 'spin 1s linear infinite', color: 'var(--ha-primary)' }}
        />
        <span>{progress?.status ?? 'Pulling model…'}</span>
        {hasBytes && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--ha-font-mono)', fontSize: 'var(--ha-text-xs)' }}>
            {percent}%
          </span>
        )}
      </div>
      {hasBytes && (
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Model pull progress: ${percent}%`}
          style={S.progressBar(percent)}
        />
      )}
    </div>
  );
}

// ─── Ollama panel ─────────────────────────────────────────────────────────────

interface OllamaPanelProps {
  baseUrl: string;
  onBaseUrlChange: (v: string) => void;
  selectedModel: string;
  onModelChange: (v: string) => void;
}

function OllamaPanel({
  baseUrl,
  onBaseUrlChange,
  selectedModel,
  onModelChange,
}: OllamaPanelProps): JSX.Element {
  const [pullModelName, setPullModelName] = useState<string>('');
  const [pullState, setPullState] = useState<PullState>({ phase: 'idle' });
  const pullAbortRef = useRef<boolean>(false);

  const { data: modelsData, isLoading: modelsLoading } = useQuery({
    queryKey: QUERY_KEYS.llmModels,
    queryFn: llmAdminService.listModels,
    retry: 1,
  });

  const modelOptions =
    modelsData?.models.map((m) => ({ value: m.name, label: m.name })) ?? [];

  const handlePull = useCallback(async (): Promise<void> => {
    const model = pullModelName.trim();
    if (!model) return;

    pullAbortRef.current = false;
    setPullState({ phase: 'pulling', lastProgress: null });

    try {
      for await (const progress of llmAdminService.pullModel(model)) {
        if (pullAbortRef.current) break;
        setPullState({ phase: 'pulling', lastProgress: progress });
      }
      if (!pullAbortRef.current) {
        setPullState({ phase: 'done' });
      }
    } catch (err) {
      const message =
        err instanceof LlmAdminError
          ? `Pull failed (HTTP ${err.status})`
          : err instanceof Error
            ? err.message
            : 'Pull failed';
      setPullState({ phase: 'error', message });
    }
  }, [pullModelName]);

  const isPulling = pullState.phase === 'pulling';

  return (
    <section style={{ ...S.section, marginTop: '24px' }}>
      <h2 style={S.sectionTitle}>Ollama Settings</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Base URL */}
        <div style={S.fieldGroup}>
          <label htmlFor="ollama-base-url" style={S.fieldLabel}>
            Base URL
          </label>
          <HaTextInput
            id="ollama-base-url"
            value={baseUrl}
            onChange={onBaseUrlChange}
            placeholder="http://ollama:11434"
            aria-describedby="ollama-base-url-hint"
          />
          <span id="ollama-base-url-hint" style={S.fieldHint}>
            HTTP endpoint for the Ollama service (e.g. http://ollama:11434)
          </span>
        </div>

        {/* Model dropdown */}
        <div style={S.fieldGroup}>
          <label htmlFor="ollama-model-select" style={S.fieldLabel}>
            Active Model
          </label>
          {modelsLoading ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: 'var(--ha-text-sm)',
                color: 'var(--ha-text-secondary)',
              }}
            >
              <Loader2
                size={14}
                style={{ animation: 'spin 1s linear infinite', color: 'var(--ha-primary)' }}
              />
              Loading available models…
            </div>
          ) : (
            <HaSelect
              options={
                modelOptions.length > 0
                  ? modelOptions
                  : [{ value: '', label: 'No models available — pull one below', isDisabled: true }]
              }
              value={selectedModel}
              onChange={onModelChange}
              placeholder="Select model"
            />
          )}
          <span style={S.fieldHint}>
            Model must already be available in Ollama. Use the pull tool below to fetch new models.
          </span>
        </div>

        {/* Pull section */}
        <div
          style={{
            borderTop: '1px solid var(--ha-border)',
            paddingTop: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <span style={{ ...S.fieldLabel, fontSize: 'var(--ha-text-base)' }}>Pull New Model</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="ollama-pull-input" style={{ ...S.fieldHint, display: 'block', marginBottom: '4px' }}>
                Model name (e.g. llama3.2:3b)
              </label>
              <HaTextInput
                id="ollama-pull-input"
                value={pullModelName}
                onChange={setPullModelName}
                placeholder="llama3.2:3b"
                isDisabled={isPulling}
                aria-label="Model name to pull"
              />
            </div>
            <HaButton
              variant="secondary"
              icon={<CloudDownload size={14} />}
              onClick={handlePull}
              isDisabled={isPulling || pullModelName.trim().length === 0}
              aria-label={isPulling ? 'Pulling model…' : 'Pull model from Ollama registry'}
            >
              {isPulling ? 'Pulling…' : 'Pull'}
            </HaButton>
          </div>
          <PullProgressView state={pullState} />
        </div>
      </div>
    </section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SystemSettingsAiTab(): JSX.Element {
  const queryClient = useQueryClient();

  // ── Server state ──────────────────────────────────────────────────────────
  const {
    data: status,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEYS.llmStatus,
    queryFn: llmAdminService.getStatus,
    refetchInterval: 60_000, // refresh badge every minute in the background
  });

  // ── Local form state ──────────────────────────────────────────────────────
  const [provider, setProvider] = useState<LlmConfigUpdateDTO['provider']>('disabled');
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync form when status loads (only on first successful fetch)
  const initializedRef = useRef<boolean>(false);
  if (status && !initializedRef.current) {
    initializedRef.current = true;
    const providerValue = status.provider as LlmConfigUpdateDTO['provider'];
    if (['disabled', 'openai', 'azure', 'ollama'].includes(providerValue)) {
      setProvider(providerValue);
    }
  }

  // ── Save mutation ─────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (dto: LlmConfigUpdateDTO) => llmAdminService.updateConfig(dto),
    onSuccess: () => {
      setSaveStatus('success');
      setSaveError(null);
      initializedRef.current = false; // allow re-sync after next status fetch
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.llmStatus });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.llmModels });
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
    onError: (err: unknown) => {
      setSaveStatus('error');
      const message =
        err instanceof LlmAdminError
          ? `Save failed (HTTP ${err.status})`
          : err instanceof Error
            ? err.message
            : 'Save failed';
      setSaveError(message);
    },
  });

  const handleSave = (): void => {
    const dto: LlmConfigUpdateDTO = {
      provider,
      ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
      ...(selectedModel.trim() ? { model: selectedModel.trim() } : {}),
    };
    saveMutation.mutate(dto);
  };

  // ── Render states ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '300px',
          gap: '12px',
          color: 'var(--ha-text-secondary)',
          fontSize: 'var(--ha-text-sm)',
        }}
      >
        <Loader2
          size={20}
          style={{ animation: 'spin 1s linear infinite', color: 'var(--ha-primary)' }}
        />
        Loading AI configuration…
      </div>
    );
  }

  if (isError) {
    const errorMessage =
      error instanceof LlmAdminError
        ? `HTTP ${error.status} — check backend connectivity`
        : error instanceof Error
          ? error.message
          : 'Unknown error';
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '300px',
          gap: '16px',
        }}
      >
        <AlertCircle size={40} style={{ color: 'var(--ha-critical)' }} />
        <p style={{ fontSize: 'var(--ha-text-base)', color: 'var(--ha-text-secondary)', textAlign: 'center' }}>
          Failed to load AI status: {errorMessage}
        </p>
        <HaButton variant="secondary" onClick={() => void refetch()}>
          Retry
        </HaButton>
      </div>
    );
  }

  const isOllama = provider === 'ollama';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        padding: '24px',
        maxWidth: '760px',
      }}
    >
      {/* ── Save feedback banners ────────────────────────────────────────── */}
      {saveStatus === 'success' && (
        <div
          role="status"
          style={{
            padding: '10px 14px',
            background: 'var(--ha-fill-low-subtle)',
            border: '1px solid var(--ha-positive)',
            borderRadius: 'var(--ha-radius-base)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-positive)',
          }}
        >
          <Check size={16} />
          Configuration saved — provider reloaded
        </div>
      )}

      {saveStatus === 'error' && saveError && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            background: 'var(--ha-fill-critical-subtle)',
            border: '1px solid var(--ha-critical)',
            borderRadius: 'var(--ha-radius-base)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-critical)',
          }}
        >
          <AlertCircle size={16} />
          {saveError}
        </div>
      )}

      {/* ── Provider & status section ────────────────────────────────────── */}
      <section style={S.section}>
        <h2 style={S.sectionTitle}>AI Provider</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Status row */}
          {status && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                background: 'var(--ha-surface-raised)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--ha-text-sm)',
                  color: 'var(--ha-text-secondary)',
                  marginRight: 'auto',
                }}
              >
                Connection status
              </span>
              <StatusBadge configured={status.configured} />
              <LatencyBadge latencyMs={status.latencyMs} />
            </div>
          )}

          {/* Provider select */}
          <div style={S.fieldGroup}>
            <label htmlFor="ai-provider-select" style={S.fieldLabel}>
              Provider
            </label>
            <HaSelect
              options={PROVIDER_OPTIONS}
              value={provider}
              onChange={(v) => {
                const next = v as LlmConfigUpdateDTO['provider'];
                setProvider(next);
                // Reset model selection when switching providers
                if (next !== provider) {
                  setSelectedModel('');
                }
              }}
              placeholder="Select provider"
            />
            <span style={S.fieldHint}>
              Choose the LLM backend. Selecting &quot;Disabled&quot; turns off all AI features.
            </span>
          </div>

          {/* Save button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <HaButton
              variant="primary"
              onClick={handleSave}
              isDisabled={saveMutation.isPending}
              isLoading={saveMutation.isPending}
              aria-label={saveMutation.isPending ? 'Saving configuration…' : 'Save AI configuration'}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save Configuration'}
            </HaButton>
          </div>
        </div>
      </section>

      {/* ── Ollama panel — rendered ONLY when provider === 'ollama' ─────────
           Requirement 7.5: non-Ollama providers hide Ollama-specific UI.
      ──────────────────────────────────────────────────────────────────── */}
      {isOllama && (
        <OllamaPanel
          baseUrl={baseUrl}
          onBaseUrlChange={setBaseUrl}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />
      )}
    </div>
  );
}
