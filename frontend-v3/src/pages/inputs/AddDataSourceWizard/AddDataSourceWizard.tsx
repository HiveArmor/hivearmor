/**
 * AddDataSourceWizard — three-step modal wizard for registering a new data source.
 *
 * Steps (fixed order, Req 11.2):
 *   1. Type     — select the data source type (Req 11.3)
 *   2. Config   — fill in required fields for the selected type (Req 11.4)
 *   3. Review   — confirm and submit (Req 11.5, 11.6)
 *
 * State management:
 *   - Wizard step/type/config/submitting are managed by the pure reducer from
 *     addDataSourceWizard.machine.ts via useReducer.
 *   - canAdvance(state) gates the "Next" button on steps 1 and 2 (Req 11.3, 11.4).
 *   - On "Finish", calls POST /api/ha-inputs/sources via dataSourcesService.create.
 *     - HTTP 201: invalidates dataSources TanStack Query cache, closes the modal.
 *     - 4xx/5xx: keeps the modal open on Step 3, shows HaInlineBanner (Req 11.6).
 *
 * Security invariants:
 *   - No `any` types (Req 13.8).
 *   - No hex color literals — all colors via `--ha-*` tokens (Req 13.9).
 *   - JWT injected by apiClient from localStorage['hivearmor_auth_token'] (Req 13.6).
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 13.5, 13.8, 13.9
 */

import { useReducer, useState, useEffect } from 'react';
import type { CSSProperties } from 'react';

import {
  Form,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@patternfly/react-core';
import { useQueryClient } from '@tanstack/react-query';

import {
  canAdvance,
  initialWizardState,
  reduce,
} from './addDataSourceWizard.machine';
import { StepConfig } from './StepConfig';
import { StepReview } from './StepReview';
import { StepType } from './StepType';

import { HaButton } from '@/components/ha-button/HaButton';
import { DATA_SOURCES_QUERY_KEY } from '@/hooks/useDataSources';
import { dataSourcesService } from '@/services/dataSources.service';
import type { HaDataSourceType } from '@/types/dataSource.types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AddDataSourceWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEP_LABELS: Record<number, string> = {
  1: 'Type',
  2: 'Configuration',
  3: 'Review',
};

// ---------------------------------------------------------------------------
// Modal CSS custom properties (no hex literals — Req 13.9)
// ---------------------------------------------------------------------------

const MODAL_STYLE: CSSProperties = {
  '--pf-v5-c-modal-box--BackgroundColor': 'var(--ha-surface-raised)',
  '--pf-v5-c-modal-box--BoxShadow': 'var(--ha-shadow-control)',
  '--pf-v5-c-modal-box--BorderColor': 'var(--ha-border)',
  '--pf-v5-c-modal-box--BorderRadius': 'var(--ha-radius-lg)',
  '--pf-v5-c-modal-box__title--Color': 'var(--ha-text-primary)',
  '--pf-v5-c-modal-box__body--Color': 'var(--ha-text-primary)',
  '--pf-v5-c-modal-box--Width': '680px',
} as CSSProperties;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddDataSourceWizard({
  isOpen,
  onClose,
}: AddDataSourceWizardProps): JSX.Element {
  const [state, dispatch] = useReducer(reduce, initialWizardState);
  const queryClient = useQueryClient();

  // ── Local error state ──────────────────────────────────────────────────────
  // The pure reducer sets submitting:true on 'finish' but has no 'submitFailure'
  // event.  Error display lives here so the reducer stays pure (Req 11.6).
  const [localSubmitError, setLocalSubmitError] = useState<string | null>(null);
  const [errorDismissed, setErrorDismissed] = useState(false);

  // Clear error whenever the modal is closed/re-opened.
  useEffect(() => {
    if (!isOpen) {
      setLocalSubmitError(null);
      setErrorDismissed(false);
    }
  }, [isOpen]);

  const visibleError = errorDismissed ? null : localSubmitError;

  // ── Derived values ─────────────────────────────────────────────────────────

  // The display name is stored in config['name'] so all form state lives in the
  // single WizardState.config map without polluting WizardState's shape.
  const nameValue = state.config['name'] ?? '';
  const nameIsNonEmpty = nameValue.trim().length > 0;

  // "Next" is gated by canAdvance (type-specific fields) PLUS display name on step 2.
  const nextEnabled =
    state.step === 1
      ? canAdvance(state)
      : state.step === 2
        ? canAdvance(state) && nameIsNonEmpty
        : false; // step 3 uses "Finish"

  // True while waiting for the POST response; cleared when error arrives.
  const isSubmitting = state.submitting && localSubmitError === null;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSelectType = (type: HaDataSourceType): void => {
    dispatch({ kind: 'selectType', value: type });
  };

  const handleNameChange = (value: string): void => {
    dispatch({ kind: 'setConfigField', key: 'name', value });
  };

  const handleFieldChange = (key: string, value: string): void => {
    dispatch({ kind: 'setConfigField', key, value });
  };

  const handleDismissError = (): void => {
    setErrorDismissed(true);
  };

  const handleClose = (): void => {
    onClose();
  };

  const handleFinish = async (): Promise<void> => {
    if (!state.type || !nameIsNonEmpty) return;

    dispatch({ kind: 'finish' });
    setLocalSubmitError(null);
    setErrorDismissed(false);

    // Strip the synthetic 'name' key — it is not a type-specific config field.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { name: _configName, ...typeConfig } = state.config;

    try {
      await dataSourcesService.create({
        name: nameValue,
        type: state.type,
        config: typeConfig,
        enabled: true,
      });

      // Req 11.5: invalidate cache on HTTP 201 (service throws on non-2xx).
      void queryClient.invalidateQueries({ queryKey: DATA_SOURCES_QUERY_KEY });
      onClose();
    } catch (err: unknown) {
      // Req 11.6: keep modal open on Step 3, render HaInlineBanner with the error.
      const message =
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred. Please try again.';
      setLocalSubmitError(message);
    }
  };

  // ── Step content ───────────────────────────────────────────────────────────

  const renderStepContent = (): JSX.Element => {
    if (state.step === 1) {
      return (
        <StepType selectedType={state.type} onSelectType={handleSelectType} />
      );
    }

    if (state.step === 2 && state.type !== null) {
      return (
        <StepConfig
          type={state.type}
          name={nameValue}
          config={state.config}
          onNameChange={handleNameChange}
          onFieldChange={handleFieldChange}
        />
      );
    }

    // Step 3 — state.type is non-null here because step 2 guards on type !== null.
    const confirmedType = state.type ?? 'syslog';
    return (
      <StepReview
        name={nameValue}
        type={confirmedType}
        config={state.config}
        submitError={visibleError}
        onDismissError={handleDismissError}
      />
    );
  };

  // ── Footer ─────────────────────────────────────────────────────────────────

  const footer = (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', width: '100%' }}>
      {state.step > 1 && (
        <HaButton
          variant="secondary"
          onClick={() => dispatch({ kind: 'back' })}
          isDisabled={isSubmitting}
        >
          Back
        </HaButton>
      )}

      <HaButton variant="secondary" onClick={handleClose} isDisabled={isSubmitting}>
        Cancel
      </HaButton>

      {/* Next — steps 1 and 2 (Req 11.3, 11.4: disabled when canAdvance is false) */}
      {state.step < 3 && (
        <HaButton
          variant="primary"
          onClick={() => dispatch({ kind: 'next' })}
          isDisabled={!nextEnabled}
          aria-label={`Advance to step ${state.step + 1}: ${STEP_LABELS[state.step + 1]}`}
        >
          Next: {STEP_LABELS[state.step + 1]}
        </HaButton>
      )}

      {/* Finish — step 3 only (Req 11.5) */}
      {state.step === 3 && (
        <HaButton
          variant="primary"
          onClick={() => void handleFinish()}
          isDisabled={isSubmitting || !state.type || !nameIsNonEmpty}
          isLoading={isSubmitting}
          aria-label="Create data source"
        >
          Finish
        </HaButton>
      )}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      aria-label="Add Data Source"
      style={MODAL_STYLE}
    >
      <ModalHeader
        title={`Add Data Source — Step ${state.step} of 3: ${STEP_LABELS[state.step]}`}
      />

      <ModalBody>
        {/* Step progress tabs */}
        <div
          role="tablist"
          aria-label="Wizard steps"
          style={{
            display: 'flex',
            marginBottom: '24px',
            borderBottom: '1px solid var(--ha-border)',
          }}
        >
          {([1, 2, 3] as const).map((step) => {
            const isActive = state.step === step;
            const isCompleted = state.step > step;

            return (
              <div
                key={step}
                role="tab"
                aria-selected={isActive}
                aria-label={`Step ${step}: ${STEP_LABELS[step]}`}
                style={{
                  padding: '8px 20px',
                  fontSize: 'var(--ha-text-sm)',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive
                    ? 'var(--ha-primary)'
                    : isCompleted
                      ? 'var(--ha-positive)'
                      : 'var(--ha-text-secondary)',
                  borderBottom: isActive
                    ? '2px solid var(--ha-primary)'
                    : '2px solid transparent',
                  cursor: 'default',
                  userSelect: 'none',
                }}
              >
                {step}. {STEP_LABELS[step]}
                {isCompleted && (
                  <span
                    aria-hidden="true"
                    style={{ marginLeft: '6px', color: 'var(--ha-positive)' }}
                  >
                    ✓
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Active step */}
        <Form noValidate>{renderStepContent()}</Form>
      </ModalBody>

      <ModalFooter>{footer}</ModalFooter>
    </Modal>
  );
}
