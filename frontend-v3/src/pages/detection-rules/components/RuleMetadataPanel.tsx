/**
 * RuleMetadataPanel — Structured metadata form for rule editor (S23)
 */

import { HaFormGroup } from '@/components/ha-form-group/HaFormGroup';
import { HaMultiSelect } from '@/components/ha-multi-select/HaMultiSelect';
import { HaTextInput } from '@/components/ha-text-input/HaTextInput';
import { HaToggle } from '@/components/ha-toggle/HaToggle';

export interface RuleMetadataPanelProps {
  ruleName: string;
  ruleActive: boolean;
  dataTypes: string[];
  sigmaRuleId: string;
  nameError: string;
  dataTypesError: string;
  onRuleNameChange: (value: string) => void;
  onRuleActiveChange: (value: boolean) => void;
  onDataTypesChange: (value: string[]) => void;
  onSigmaRuleIdChange: (value: string) => void;
  onNameBlur: () => void;
  dataTypeOptions: string[];
}

export function RuleMetadataPanel({
  ruleName,
  ruleActive,
  dataTypes,
  sigmaRuleId,
  nameError,
  dataTypesError,
  onRuleNameChange,
  onRuleActiveChange,
  onDataTypesChange,
  onSigmaRuleIdChange,
  onNameBlur,
  dataTypeOptions,
}: RuleMetadataPanelProps): JSX.Element {
  const characterCount = ruleName.length;
  const showCharacterCount = characterCount > 160;

  return (
    <div style={{ padding: 24 }}>
      <HaFormGroup label="Rule Name" fieldId="rule-name" isRequired>
        <HaTextInput
          id="rule-name"
          value={ruleName}
          onChange={onRuleNameChange}
          onBlur={onNameBlur}
          placeholder="e.g. Brute Force Login Detected"
          validated={nameError ? 'error' : 'default'}
          maxLength={200}
        />
        {nameError && (
          <div style={{ marginTop: 4, fontSize: 'var(--ha-text-xs)', color: 'var(--ha-critical)' }}>
            {nameError}
          </div>
        )}
        {showCharacterCount && !nameError && (
          <div style={{ marginTop: 4, fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
            {characterCount}/200 characters
          </div>
        )}
      </HaFormGroup>

      <div style={{ marginTop: 24 }}>
        <HaFormGroup label="Data Types" fieldId="data-types" isRequired>
          <HaMultiSelect
            id="data-types"
            options={dataTypeOptions}
            selected={dataTypes}
            onChange={onDataTypesChange}
            placeholder="Select data types…"
          />
          {dataTypesError && (
            <div style={{ marginTop: 4, fontSize: 'var(--ha-text-xs)', color: 'var(--ha-critical)' }}>
              {dataTypesError}
            </div>
          )}
        </HaFormGroup>
      </div>

      <div style={{ marginTop: 24 }}>
        <HaFormGroup label="Active" fieldId="rule-active">
          <HaToggle
            id="rule-active"
            isChecked={ruleActive}
            onChange={onRuleActiveChange}
            label={ruleActive ? 'Active' : 'Inactive'}
          />
          {!ruleActive && (
            <div style={{ marginTop: 8, fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
              This rule will not generate alerts until activated.
            </div>
          )}
        </HaFormGroup>
      </div>

      <div style={{ marginTop: 24 }}>
        <HaFormGroup label="Sigma Rule ID" fieldId="sigma-rule-id">
          <HaTextInput
            id="sigma-rule-id"
            value={sigmaRuleId}
            onChange={onSigmaRuleIdChange}
            placeholder="e.g. a1b2c3d4-e5f6-..."
          />
          <div style={{ marginTop: 4, fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
            Optional. UUID of the upstream Sigma rule if this rule originates from Sigma.
          </div>
        </HaFormGroup>
      </div>
    </div>
  );
}
