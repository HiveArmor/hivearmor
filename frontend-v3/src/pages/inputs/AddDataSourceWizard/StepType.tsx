/**
 * StepType — Step 1 of the AddDataSourceWizard.
 *
 * Renders a list of selectable data source type cards.  The "Next" button
 * in the parent wizard is disabled until a type is selected (Req 11.3).
 *
 * The component is intentionally stateless — all selection state lives in the
 * parent's useReducer (WizardState.type).  It fires `selectType` dispatch
 * events upward.
 *
 * Security invariants:
 *   - No `any` types (Req 13.8).
 *   - No hex color literals — all colors via `--ha-*` tokens (Req 13.9).
 *
 * Requirements: 11.2, 11.3, 13.5, 13.8, 13.9
 */

import type { HaDataSourceType } from '@/types/dataSource.types';

// ---------------------------------------------------------------------------
// Type metadata
// ---------------------------------------------------------------------------

interface TypeOption {
  value: HaDataSourceType;
  label: string;
  description: string;
}

const TYPE_OPTIONS: TypeOption[] = [
  {
    value: 'syslog',
    label: 'Syslog',
    description: 'Receive syslog events over UDP/TCP from network devices and servers.',
  },
  {
    value: 'wineventlog',
    label: 'Windows Event Log',
    description: 'Collect Windows security, system, and application event logs.',
  },
  {
    value: 'agent',
    label: 'HiveArmor Agent',
    description: 'Endpoint agent collecting logs and telemetry from a managed host.',
  },
  {
    value: 'kafka',
    label: 'Kafka',
    description: 'Consume log events from an Apache Kafka topic.',
  },
  {
    value: 'aws',
    label: 'AWS',
    description: 'Pull CloudTrail, VPC Flow Logs, or GuardDuty findings via an IAM role.',
  },
  {
    value: 'azure',
    label: 'Azure',
    description: 'Collect activity logs and Defender alerts from an Azure subscription.',
  },
  {
    value: 'gcp',
    label: 'Google Cloud Platform',
    description: 'Stream audit logs and security findings from a GCP project.',
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StepTypeProps {
  selectedType: HaDataSourceType | null;
  onSelectType: (type: HaDataSourceType) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders the type-selection grid.  Each card is keyboard-accessible (role
 * button, tabIndex, Enter/Space triggers selection).
 */
export function StepType({ selectedType, onSelectType }: StepTypeProps): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '4px 0',
      }}
    >
      <p
        style={{
          fontSize: 'var(--ha-text-sm)',
          color: 'var(--ha-text-secondary)',
          margin: '0 0 8px',
        }}
      >
        Choose the type of data source you want to register. Each type requires
        different configuration fields.
      </p>

      <div
        role="listbox"
        aria-label="Data source type"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '10px',
        }}
      >
        {TYPE_OPTIONS.map((opt) => {
          const isSelected = selectedType === opt.value;

          return (
            <div
              key={opt.value}
              role="option"
              aria-selected={isSelected}
              tabIndex={0}
              onClick={() => onSelectType(opt.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectType(opt.value);
                }
              }}
              style={{
                padding: '14px 16px',
                border: `1px solid ${isSelected ? 'var(--ha-primary)' : 'var(--ha-border)'}`,
                borderRadius: 'var(--ha-radius-base, 4px)',
                backgroundColor: isSelected
                  ? 'var(--ha-fill-primary-subtle)'
                  : 'var(--ha-surface-primary)',
                cursor: 'pointer',
                outline: 'none',
                transition: 'border-color 0.15s, background-color 0.15s',
              }}
              onFocus={(e) => {
                (e.currentTarget as HTMLDivElement).style.boxShadow =
                  '0 0 0 2px var(--ha-primary)';
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
              }}
            >
              <div
                style={{
                  fontSize: 'var(--ha-text-sm)',
                  fontWeight: 600,
                  color: isSelected ? 'var(--ha-primary)' : 'var(--ha-text-primary)',
                  marginBottom: '4px',
                }}
              >
                {opt.label}
              </div>
              <div
                style={{
                  fontSize: 'var(--ha-text-xs, 0.75rem)',
                  color: 'var(--ha-text-secondary)',
                  lineHeight: 1.4,
                }}
              >
                {opt.description}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
