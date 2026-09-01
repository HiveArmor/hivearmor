/**
 * NewTenantWizard — MSSP tenant provisioning honesty (Prompt 47 / Wave C3 slice 3).
 *
 * Production create: POST /api/ha-mssp/tenants (MSSP_ADMIN-gated).
 * Successful POST persists ha_client + inactive admin user — not activation, indices, or IAM governance.
 */

import type { ReactElement } from "react";
import { useState } from "react";

import { Form } from "@patternfly/react-core";
import { useMutation } from "@tanstack/react-query";
import { Building2, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import {
  MSSP_ROUTES,
  MSSP_TENANT_LIFECYCLE_GOVERNANCE_LIVE,
  NEW_TENANT_JOB_SENTENCE,
  NEW_TENANT_PROVISION_FAIL_CLOSED_TITLE,
} from "./msspTenantCreate.honesty";
import { createTenant } from "../api/msspTenantApi";
import { MsspConflictError } from "../api/msspTypes";
import type { NewTenantRequest } from "../api/msspTypes";

import "./NewTenantWizard.css";

import { HaButton } from "@/components/ha-button/HaButton";
import { HaFormGroup } from "@/components/ha-form-group/HaFormGroup";
import { HaInlineBanner } from "@/components/ha-inline-banner/HaInlineBanner";
import { HaSelect } from "@/components/ha-select/HaSelect";
import { HaTextInput } from "@/components/ha-text-input/HaTextInput";
import { ROUTES } from "@/constants/routes.constants";

const PREFIX_REGEX = /^[a-z0-9-]{2,20}$/;

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

function PageHeader(): ReactElement {
  return (
    <header className="mssp-tenant-new-header">
      <div className="mssp-tenant-new-header__identity">
        <span className="mssp-tenant-new-header__mark">
          <Building2 size={18} aria-hidden="true" />
        </span>
        <div className="mssp-tenant-new-header__copy">
          <div className="mssp-tenant-new-header__eyebrow">
            <span>MSSP PORTAL · NEW TENANT</span>
            <span className="mssp-tenant-new-header__badge">STAGING CANDIDATE</span>
          </div>
          <h1>New tenant</h1>
          <p className="mssp-tenant-new-header__job">{NEW_TENANT_JOB_SENTENCE}</p>
          <p className="mssp-tenant-new-page__projection-note" role="note">
            Create via POST /api/ha-mssp/tenants with clientPrefix matching ^[a-z0-9-]&#123;2,20&#125;$.
            Admin user is created inactive — activation, membership governance, and lifecycle audit
            remain partial (IAM-005).
          </p>
        </div>
      </div>
    </header>
  );
}

function MetaLinks(): ReactElement {
  return (
    <p className="mssp-tenant-new-page__meta">
      <Link to={MSSP_ROUTES.OVERVIEW}>Overview</Link>
      <span aria-hidden="true">·</span>
      <Link to={MSSP_ROUTES.TENANTS}>Tenants</Link>
      <span aria-hidden="true">·</span>
      <Link to={ROUTES.ADMIN_TENANTS}>Platform tenants</Link>
      <span aria-hidden="true">·</span>
      <Link to={ROUTES.ADMIN_USERS}>Identity &amp; Tenancy</Link>
      <span aria-hidden="true">·</span>
      <span className="mssp-tenant-new-page__access">MSSP Administrator</span>
    </p>
  );
}

function TrustBanner(): ReactElement {
  return (
    <div
      className="mssp-tenant-new-trust"
      role="status"
      data-testid="new-tenant-create-trust-banner"
    >
      <ShieldCheck size={13} aria-hidden="true" />
      <span>
        <strong>Provisioning fail-closed:</strong> HiveArmor navigates to tenant detail only after
        HTTP 201 with a persisted id — never to API Location headers and never with simulated
        success. No success toast implies production readiness.
      </span>
    </div>
  );
}

function ProvisionFailClosedBanner(): ReactElement {
  return (
    <div
      className="mssp-tenant-new-provision-note"
      role="status"
      data-testid="new-tenant-provision-fail-closed-banner"
    >
      <strong>{NEW_TENANT_PROVISION_FAIL_CLOSED_TITLE}</strong>
    </div>
  );
}

function StepNav({ currentStep }: { currentStep: number }): ReactElement {
  return (
    <div role="tablist" aria-label="Wizard steps" className="mssp-tenant-new-wizard__step-nav">
      {([1, 2, 3, 4] as const).map((step) => {
        const isActive = currentStep === step;
        const isCompleted = currentStep > step;
        const stepClass = isActive
          ? "mssp-tenant-new-wizard__step mssp-tenant-new-wizard__step--active"
          : isCompleted
            ? "mssp-tenant-new-wizard__step mssp-tenant-new-wizard__step--completed"
            : "mssp-tenant-new-wizard__step mssp-tenant-new-wizard__step--pending";

        return (
          <div
            key={step}
            role="tab"
            aria-selected={isActive}
            aria-label={`Step ${step}: ${STEP_LABELS[step]}`}
            className={stepClass}
          >
            {step}. {STEP_LABELS[step]}
            {isCompleted && (
              <span aria-hidden="true" style={{ marginLeft: "6px" }}>
                ✓
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

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
          <div id="wizard-prefix-helper" role="alert" className="mssp-tenant-new-prefix-error">
            {"Prefix must match ^[a-z0-9-]{2,20}$"}
          </div>
        )}
      </HaFormGroup>
    </Form>
  );
}

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

interface Step4Props {
  state: WizardState;
  error: string | null;
  onDismissError: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

function ReviewRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="mssp-tenant-new-review-row">
      <span className="mssp-tenant-new-review-row__label">{label}</span>
      <span className="mssp-tenant-new-review-row__value">{value}</span>
    </div>
  );
}

function StepReview({ state, error, onDismissError, onSubmit, isSubmitting }: Step4Props): ReactElement {
  return (
    <div>
      {error !== null && (
        <HaInlineBanner
          variant="danger"
          title="Provisioning request failed"
          description={error}
          onDismiss={onDismissError}
        />
      )}

      <div className="mssp-tenant-new-review-block">
        <div className="mssp-tenant-new-review-block__label">Tenant details</div>
        <ReviewRow label="Tenant name" value={state.name} />
        <ReviewRow label="Client prefix" value={state.clientPrefix} />
      </div>

      <div className="mssp-tenant-new-review-block">
        <div className="mssp-tenant-new-review-block__label">Admin user</div>
        <ReviewRow label="Admin email" value={state.adminEmail} />
        <ReviewRow label="Admin login" value={state.adminLogin} />
      </div>

      <div className="mssp-tenant-new-review-block">
        <div className="mssp-tenant-new-review-block__label">Licence</div>
        <ReviewRow label="Max users" value={state.maxUsers} />
        <ReviewRow label="Licence type" value={state.licenceType} />
      </div>

      <div className="mssp-tenant-new-review-submit">
        <p className="mssp-tenant-new-review-submit__hint" role="note">
          Submit sends POST /api/ha-mssp/tenants. A 201 response opens tenant detail at
          /mssp/tenants/&#123;id&#125; — admin account remains inactive until activation completes.
        </p>
        <HaButton
          variant="primary"
          onClick={onSubmit}
          isDisabled={isSubmitting}
          isLoading={isSubmitting}
          aria-label="Submit provisioning request"
        >
          Submit provisioning request
        </HaButton>
      </div>
    </div>
  );
}

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

function provisioningErrorMessage(err: unknown): string {
  if (err instanceof MsspConflictError) {
    const fieldLabel = err.field === "adminLogin" ? "Admin login" : "Client prefix";
    return (
      `Conflict: a tenant or user with this ${fieldLabel} already exists. ` +
      "Please go back and choose a different value."
    );
  }
  if (err instanceof Error) {
    if (err.message === "401" || err.message === "403") {
      return "MSSP access restricted — required permission: MSSP Administrator.";
    }
    if (err.message === "400") {
      return "The submitted data is invalid. Please review all fields and try again.";
    }
  }
  return "An unexpected error occurred while submitting the provisioning request. Please try again.";
}

export function NewTenantWizard(): ReactElement {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleChange = (key: keyof WizardState, value: string): void => {
    setState((prev) => ({ ...prev, [key]: value }));
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
      setError(provisioningErrorMessage(err));
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
    <section
      className="mssp-tenant-new-page"
      aria-label="New MSSP tenant"
      data-mssp-tenant-create-honesty="true"
      data-tenant-lifecycle-governance={MSSP_TENANT_LIFECYCLE_GOVERNANCE_LIVE ? "live" : "fail-closed"}
      data-testid="new-tenant-wizard"
    >
      <PageHeader />
      <MetaLinks />
      <TrustBanner />
      <ProvisionFailClosedBanner />

      <div className="mssp-tenant-new-workspace">
        <div className="mssp-tenant-new-wizard">
          <p className="mssp-tenant-new-wizard__title">
            Step {step} of 4: {STEP_LABELS[step]}
          </p>

          <StepNav currentStep={step} />

          <div className="mssp-tenant-new-wizard__content">{renderStepContent()}</div>

          {step < 4 && (
            <div className="mssp-tenant-new-wizard__footer">
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
            <div className="mssp-tenant-new-wizard__footer">
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
      </div>
    </section>
  );
}
