/**
 * StepConfig — Step 2 of the AddDataSourceWizard.
 *
 * Renders the required configuration fields for the selected data source type.
 * Field set is driven by REQUIRED_FIELDS[type] from the state machine.  The
 * "Next" button in the parent is disabled until every required field is
 * non-empty (Req 11.4 — enforced by canAdvance in the reducer).
 *
 * Security invariants:
 *   - No `any` types (Req 13.8).
 *   - No hex color literals — all colors via `--ha-*` tokens (Req 13.9).
 *
 * Requirements: 11.2, 11.4, 13.5, 13.8, 13.9
 */

import { REQUIRED_FIELDS } from './addDataSourceWizard.machine';

import { HaFormGroup } from '@/components/ha-form-group/HaFormGroup';
import { HaTextInput } from '@/components/ha-text-input/HaTextInput';
import type { HaDataSourceType } from '@/types/dataSource.types';

// ---------------------------------------------------------------------------
// Field metadata — human-readable labels and optional placeholders
// ---------------------------------------------------------------------------

const FIELD_META: Record<string, { label: string; placeholder?: string }> = {
  host:           { label: 'Host',            placeholder: 'e.g. 192.168.1.1' },
  port:           { label: 'Port',            placeholder: 'e.g. 514' },
  agentId:        { label: 'Agent ID',        placeholder: 'UUID of the registered agent' },
  brokers:        { label: 'Brokers',         placeholder: 'host1:9092,host2:9092' },
  topic:          { label: 'Topic',           placeholder: 'e.g. hivearmor-logs' },
  region:         { label: 'AWS Region',      placeholder: 'e.g. us-east-1' },
  roleArn:        { label: 'IAM Role ARN',    placeholder: 'arn:aws:iam::123456789012:role/...' },
  tenantId:       { label: 'Tenant ID',       placeholder: 'Azure AD tenant GUID' },
  subscriptionId: { label: 'Subscription ID', placeholder: 'Azure subscription GUID' },
  projectId:      { label: 'Project ID',      placeholder: 'GCP project ID' },
};

function getFieldMeta(key: string): { label: string; placeholder?: string } {
  return FIELD_META[key] ?? { label: key };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StepConfigProps {
  type: HaDataSourceType;
  /** Human-readable source name (also a required field — separate from typed config). */
  name: string;
  config: Record<string, string>;
  onNameChange: (value: string) => void;
  onFieldChange: (key: string, value: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders the name field plus every required field for the selected type.
 * The field set is derived from REQUIRED_FIELDS so it is always in sync with
 * the reducer's canAdvance guard.
 */
export function StepConfig({
  type,
  name,
  config,
  onNameChange,
  onFieldChange,
}: StepConfigProps): JSX.Element {
  const requiredKeys = REQUIRED_FIELDS[type];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px 0' }}>
      <p
        style={{
          fontSize: 'var(--ha-text-sm)',
          color: 'var(--ha-text-secondary)',
          margin: '0 0 4px',
        }}
      >
        Fill in the required fields for your <strong style={{ color: 'var(--ha-text-primary)' }}>{type}</strong> data source.
        All fields are required.
      </p>

      {/* Display name — always required */}
      <HaFormGroup fieldId="ha-ds-name" label="Display Name" isRequired>
        <HaTextInput
          id="ha-ds-name"
          value={name}
          onChange={onNameChange}
          placeholder="e.g. Production Firewall"
          isRequired
          maxLength={128}
          aria-label="Data source display name"
        />
      </HaFormGroup>

      {/* Type-specific required fields */}
      {requiredKeys.map((key) => {
        const meta = getFieldMeta(key);
        const fieldId = `ha-ds-config-${key}`;

        return (
          <HaFormGroup key={key} fieldId={fieldId} label={meta.label} isRequired>
            <HaTextInput
              id={fieldId}
              value={config[key] ?? ''}
              onChange={(value) => onFieldChange(key, value)}
              placeholder={meta.placeholder}
              isRequired
              aria-label={meta.label}
            />
          </HaFormGroup>
        );
      })}
    </div>
  );
}
