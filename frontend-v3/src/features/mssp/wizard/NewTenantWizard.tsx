import type { CSSProperties, ReactElement } from "react";
import { useState } from "react";

import { Form } from "@patternfly/react-core";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { createTenant } from "../api/msspTenantApi";
import { MsspConflictError } from "../api/msspTypes";
import type { NewTenantRequest } from "../api/msspTypes";

import { HaButton } from "@/components/ha-button/HaButton";
import { HaFormGroup } from "@/components/ha-form-group/HaFormGroup";
import { HaInlineBanner } from "@/components/ha-inline-banner/HaInlineBanner";
import { HaSelect } from "@/components/ha-select/HaSelect";
import { HaTextInput } from "@/components/ha-text-input/HaTextInput";

// ---------------------------------------------------------------------------
// Prefix validation — shared constant (Requirement 10.3)
// ---------------------------------------------------------------------------

const PREFIX_REGEX = /^[a-z0-9-]{2,20}$/;

// ---------------------------------------------------------------------------
// Wizard state
// ---------------------------------------------------------------------------

interface WizardState {
  name: string;
  clientPrefix: string;
  adminEmail: string;
  adminLogin: string;
  maxUsers: string;
  licenceType: string;
}

const INITIAL_STATE: WizardState = {
  name: "",
  clientPrefix: "",
  adminEmail: "",
  adminLogin: "",
  maxUsers: "",
  licenceType: "",
};

const STEP_LABELS: Record<number, string> = {
  1: "Tenant details",
  2: "Admin user",
  3: "Licence",
  4: "Review",
};

const LICENCE_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "professional", label: "Professional" },
  { value: "enterprise", label: "Enterprise" },
];

// ---------------------------------------------------------------------------
// Styles (no hex literals — all CSS custom properties from tokens.css)
// ---------------------------------------------------------------------------

const CONTAINER_STYLE: CSSProperties = {
  padding: "24px",
  backgroundColor: "var(--ha-surface-primary)",
  minHeight: "400px",
  color: "var(--ha-text-primary)",
};

const STEP_NAV_STYLE: CSSProperties = {
  display: "flex",
  marginBottom: "24px",
  borderBottom: "1px solid var(--ha-border)",
};

const FOOTER_STYLE: CSSProperties = {
  display: "flex",
  gap: "8px",
  justifyContent: "flex-end",
  paddingTop: "24px",
  borderTop: "1px solid var(--ha-border)",
  marginTop: "24px",
};

const REVIEW_ROW_STYLE: CSSProperties = {
  display: "flex",
  gap: "8px",
  marginBottom: "8px",
  fontSize: "var(--ha-text-sm)",
};

const REVIEW_LABEL_STYLE: CSSProperties = {
  color: "var(--ha-text-secondary)",
  minWidth: "140px",
  flexShrink: 0,
};

const REVIEW_VALUE_STYLE: CSSProperties = {
  color: "var(--ha-text-primary)",
  fontFamily: "var(--ha-font-mono, monospace)",
};

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepNav({ currentStep }: { currentStep: number }): ReactElement {
  return (
    <div role="tablist" aria-label="Wizard steps" style={STEP_NAV_STYLE}>
      {([1, 2, 3, 4] as const).map((step) => {
        const isActive = currentStep === step;
        const isCompleted = currentStep > step;

        return (
          <div
            key={step}
            role="tab"
            aria-selected={isActive}
            aria-label={`Step ${step}: ${STEP_LABELS[step]}`}
            style={{
              padding: "8px 16px",
              fontSize: "var(--ha-text-sm)",
              fontWeight: isActive ? 600 : 400,
              color: isActive
                ? "var(--ha-primary)"
                : isCompleted
                  ? "var(--ha-positive)"
                  : "var(--ha-text-secondary)",
              borderBottom: isActive
                ? "2px solid var(--ha-primary)"
                : "2px solid transparent",
              cursor: "default",
              userSelect: "none",
              whiteSpace: "nowrap",
            }}
          >
            {step}. {STEP_LABELS[step]}
            {isCompleted && (
              <span aria-hidden="true" style={{ marginLeft: "6px", color: "var(--ha-positive)" }}>
                ✓
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Tenant details
// ---------------------------------------------------------------------------

interface Step1Props {
  state: WizardState;
  onChange: (key: keyof WizardState, value: string) => void;
}

function StepTenantDetails({ state, onChange }: Step1Props): ReactElement {
  const prefixInvalid = state.clientPrefix !== "" && !PREFIX_REGEX.test(state.clientPrefix);

  return (
    <Form noValidate>
      <HaFormGroup label="Tenant name" fieldId="wizard-name" isRequired>
        <HaTextInput
          id="wizard-name"
          value={state.name}
          onChange={(v) => onChange("name", v)}
          placeholder="e.g. Acme Corp"
          aria-label="Tenant name"
        />
      </HaFormGroup>

      <HaFormGroup label="Client prefix" fieldId="wizard-prefix" isRequired>
        <HaTextInput
          id="wizard-prefix"
          value={state.clientPrefix}
          onChange={(v) => onChange("clientPrefix", v)}
          placeholder="e.g. acme"
          aria-label="Client prefix"
          validated={prefixInvalid ? "error" : "default"}
          aria-describedby={prefixInvalid ? "wizard-prefix-helper" : undefined}
        />
        {prefixInvalid && (
          <div
            id="wizard-prefix-helper"
            role="alert"
            style={{
              fontSize: "var(--ha-text-xs)",
              color: "var(--ha-critical)",
              marginTop: "4px",
            }}
          >
            {"Prefix must match ^[a-z0-9-]{2,20}$"}
          </div>
        )}
      </HaFormGroup>
    </Form>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Admin user
// ---------------------------------------------------------------------------

interface Step2Props {
  state: WizardState;
  onChange: (key: keyof WizardState, value: string) => void;
}

function StepAdminUser({ state, onChange }: Step2Props): ReactElement {
  return (
    <Form noValidate>
      <HaFormGroup label="Admin email" fieldId="wizard-admin-email" isRequired>
        <HaTextInput
          id="wizard-admin-email"
          type="email"
          value={state.adminEmail}
          onChange={(v) => onChange("adminEmail", v)}
          placeholder="admin@example.com"
          aria-label="Admin email"
        />
      </HaFormGroup>

      <HaFormGroup label="Admin login" fieldId="wizard-admin-login" isRequired>
        <HaTextInput
          id="wizard-admin-login"
          value={state.adminLogin}
          onChange={(v) => onChange("adminLogin", v)}
          placeholder="e.g. acme-admin"
          aria-label="Admin login"
        />
      </HaFormGroup>
    </Form>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Licence
// ---------------------------------------------------------------------------

interface Step3Props {
  state: WizardState;
  onChange: (key: keyof WizardState, value: string) => void;
}

function StepLicence({ state, onChange }: Step3Props): ReactElement {
  return (
    <Form noValidate>
      <HaFormGroup label="Max users" fieldId="wizard-max-users" isRequired>
        <HaTextInput
          id="wizard-max-users"
          type="number"
          value={state.maxUsers}
          onChange={(v) => onChange("maxUsers", v)}
          placeholder="e.g. 50"
          aria-label="Max users"
        />
      </HaFormGroup>

      <HaFormGroup label="Licence type" fieldId="wizard-licence-type" isRequired>
        <HaSelect
          options={LICENCE_OPTIONS}
          value={state.licenceType}
          onChange={(v) => onChange("licenceType", v)}
          placeholder="Select licence type"
        />
      </HaFormGroup>
    </Form>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Review
// ---------------------------------------------------------------------------

interface Step4Props {
  state: WizardState;
  error: string | null;
  onDismissError: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

function ReviewRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div style={REVIEW_ROW_STYLE}>
      <span style={REVIEW_LABEL_STYLE}>{label}</span>
      <span style={REVIEW_VALUE_STYLE}>{value}</span>
    </div>
  );
}

function StepReview({ state, error, onDismissError, onSubmit, isSubmitting }: Step4Props): ReactElement {
  return (
    <div>
      {error !== null && (
        <HaInlineBanner
          variant="danger"
          title="Provisioning failed"
          description={error}
          onDismiss={onDismissError}
        />
      )}

      <div
        style={{
          backgroundColor: "var(--ha-surface-raised)",
          border: "1px solid var(--ha-border)",
          borderRadius: "var(--ha-radius-base, 4px)",
          padding: "16px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            fontSize: "var(--ha-text-xs)",
            color: "var(--ha-text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: "12px",
          }}
        >
          Tenant details
        </div>
        <ReviewRow label="Tenant name" value={state.name} />
        <ReviewRow label="Client prefix" value={state.clientPrefix} />
      </div>

      <div
        style={{
          backgroundColor: "var(--ha-surface-raised)",
          border: "1px solid var(--ha-border)",
          borderRadius: "var(--ha-radius-base, 4px)",
          padding: "16px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            fontSize: "var(--ha-text-xs)",
            color: "var(--ha-text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: "12px",
          }}
        >
          Admin user
        </div>
        <ReviewRow label="Admin email" value={state.adminEmail} />
        <ReviewRow label="Admin login" value={state.adminLogin} />
      </div>

      <div
        style={{
          backgroundColor: "var(--ha-surface-raised)",
          border: "1px solid var(--ha-border)",
          borderRadius: "var(--ha-radius-base, 4px)",
          padding: "16px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            fontSize: "var(--ha-text-xs)",
            color: "var(--ha-text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: "12px",
          }}
        >
          Licence
        </div>
        <ReviewRow label="Max users" value={state.maxUsers} />
        <ReviewRow label="Licence type" value={state.licenceType} />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <HaButton
          variant="primary"
          onClick={onSubmit}
          isDisabled={isSubmitting}
          isLoading={isSubmitting}
          aria-label="Provision tenant"
        >
          Provision tenant
        </HaButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isStep1Valid(state: WizardState): boolean {
  return state.name.trim().length > 0 && PREFIX_REGEX.test(state.clientPrefix);
}

function isStep2Valid(state: WizardState): boolean {
  return state.adminEmail.trim().length > 0 && state.adminLogin.trim().length > 0;
}

function isStep3Valid(state: WizardState): boolean {
  const maxUsers = parseInt(state.maxUsers, 10);
  return !isNaN(maxUsers) && maxUsers > 0 && state.licenceType.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Main wizard component
// ---------------------------------------------------------------------------

export function NewTenantWizard(): ReactElement {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleChange = (key: keyof WizardState, value: string): void => {
    setState((prev) => ({ ...prev, [key]: value }));
    // Clear submit error when user edits fields on review step
    if (step === 4) {
      setError(null);
    }
  };

  const mutation = useMutation({
    mutationFn: (req: NewTenantRequest) => createTenant(req),
    onSuccess: (created) => {
      navigate(`/mssp/tenants/${created.id}`);
    },
    onError: (err: unknown) => {
      if (err instanceof MsspConflictError) {
        const fieldLabel =
          err.field === "adminLogin" ? "Admin login" : "Client prefix";
        setError(
          `Conflict: a tenant or user with this ${fieldLabel} already exists. ` +
            `Please go back and choose a different value.`
        );
      } else if (err instanceof Error && err.message === "400") {
        setError(
          "The submitted data is invalid. Please review all fields and try again."
        );
      } else {
        setError(
          "An unexpected error occurred while provisioning the tenant. Please try again."
        );
      }
    },
  });

  const handleSubmit = (): void => {
    const maxUsers = parseInt(state.maxUsers, 10);
    mutation.mutate({
      name: state.name,
      clientPrefix: state.clientPrefix,
      adminEmail: state.adminEmail,
      adminLogin: state.adminLogin,
      maxUsers,
      licenceType: state.licenceType,
    });
  };

  const canAdvance =
    step === 1
      ? isStep1Valid(state)
      : step === 2
        ? isStep2Valid(state)
        : step === 3
          ? isStep3Valid(state)
          : false;

  const renderStepContent = (): ReactElement => {
    if (step === 1) {
      return <StepTenantDetails state={state} onChange={handleChange} />;
    }
    if (step === 2) {
      return <StepAdminUser state={state} onChange={handleChange} />;
    }
    if (step === 3) {
      return <StepLicence state={state} onChange={handleChange} />;
    }
    return (
      <StepReview
        state={state}
        error={error}
        onDismissError={() => setError(null)}
        onSubmit={handleSubmit}
        isSubmitting={mutation.isPending}
      />
    );
  };

  return (
    <div data-testid="new-tenant-wizard" style={CONTAINER_STYLE}>
      <div
        style={{
          fontSize: "var(--ha-text-lg)",
          fontWeight: 600,
          color: "var(--ha-text-primary)",
          marginBottom: "24px",
        }}
      >
        New tenant — Step {step} of 4: {STEP_LABELS[step]}
      </div>

      <StepNav currentStep={step} />

      <div style={{ minHeight: "240px" }}>{renderStepContent()}</div>

      {step < 4 && (
        <div style={FOOTER_STYLE}>
          {step > 1 && (
            <HaButton
              variant="secondary"
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
              isDisabled={mutation.isPending}
            >
              Back
            </HaButton>
          )}
          <HaButton
            variant="primary"
            onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
            isDisabled={!canAdvance}
            aria-label={`Advance to step ${step + 1}: ${STEP_LABELS[(step + 1) as 1 | 2 | 3 | 4]}`}
          >
            Next: {STEP_LABELS[(step + 1) as 1 | 2 | 3 | 4]}
          </HaButton>
        </div>
      )}

      {step === 4 && (
        <div style={FOOTER_STYLE}>
          <HaButton
            variant="secondary"
            onClick={() => setStep(3)}
            isDisabled={mutation.isPending}
          >
            Back
          </HaButton>
        </div>
      )}
    </div>
  );
}
