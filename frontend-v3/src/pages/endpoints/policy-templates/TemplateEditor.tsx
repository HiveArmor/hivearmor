/**
 * PT-2 tabbed template editor shell. Assembles the 11 section tabs via HaTabs,
 * validates, and saves via create-envelope (POST /templates) or edit (PUT /{id}).
 */

import { useMemo, useState } from 'react';

import {
  CertificateTab,
  ChangeTab,
  EventTab,
  FimTab,
  GenericTab,
  MonitorTab,
  OsqueryTab,
  ScansTab,
  ScriptTab,
  type TabProps,
  UebaTab,
  UserLogTab,
} from './TemplateEditorTabs';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaTabs } from '@/components/ha-tabs/HaTabs';
import { validatePolicyTemplateForm } from '@/lib/policyTemplateSchema';
import { TAB_ENFORCEMENT, TEMPLATE_TAB_KEYS } from '@/types/policyTemplates';
import type { PolicyTemplateFormValues, TemplateTabKey } from '@/types/policyTemplates';


import './TemplateEditor.css';

const TAB_TITLES: Record<TemplateTabKey, string> = {
  generic: 'Generic',
  monitor: 'Monitor',
  event: 'Event',
  ueba: 'UEBA',
  userLog: 'User Log',
  fim: 'FIM',
  change: 'Change',
  script: 'Script',
  certificate: 'Certificate',
  osquery: 'Osquery',
  scans: 'Scans',
};

const TAB_COMPONENTS: Record<TemplateTabKey, (p: TabProps) => JSX.Element> = {
  generic: GenericTab,
  monitor: MonitorTab,
  event: EventTab,
  ueba: UebaTab,
  userLog: UserLogTab,
  fim: FimTab,
  change: ChangeTab,
  script: ScriptTab,
  certificate: CertificateTab,
  osquery: OsqueryTab,
  scans: ScansTab,
};

export interface TemplateEditorProps {
  form: PolicyTemplateFormValues;
  onChange: (next: PolicyTemplateFormValues) => void;
  onSave: () => void;
  onCancel: () => void;
  canMutate: boolean;
  canWriteGlobal: boolean;
  isEdit: boolean;
  busy: boolean;
}

export function TemplateEditor({
  form,
  onChange,
  onSave,
  onCancel,
  canMutate,
  canWriteGlobal,
  isEdit,
  busy,
}: TemplateEditorProps): JSX.Element {
  const [activeKey, setActiveKey] = useState<TemplateTabKey>('generic');
  const errors = useMemo(() => validatePolicyTemplateForm(form), [form]);
  const disabled = !canMutate;

  const tabs = TEMPLATE_TAB_KEYS.map((key) => {
    const Component = TAB_COMPONENTS[key];
    const enforcement = TAB_ENFORCEMENT[key];
    const title = (
      <span className="tmpl-editor__tab-label">
        {TAB_TITLES[key]}
        {enforcement.status === 'authored' && (
          <span
            className="tmpl-editor__tab-dot"
            aria-label="Authored, not yet enforced by agent"
            title="Authored — not yet enforced by agent"
          />
        )}
      </span>
    );
    return {
      key,
      title,
      content: (
        <Component
          form={form}
          onChange={onChange}
          disabled={disabled}
          canWriteGlobal={canWriteGlobal}
          isEdit={isEdit}
        />
      ),
    };
  });

  return (
    <div className="tmpl-editor">
      <HaTabs
        tabs={tabs}
        activeKey={activeKey}
        onSelect={(k) => setActiveKey(k as TemplateTabKey)}
        className="tmpl-editor__tabs"
      />

      {errors.length > 0 && (
        <div className="tmpl-editor__errors" role="alert">
          <strong>Fix before saving:</strong>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="tmpl-editor__footer">
        <HaButton variant="secondary" onClick={onCancel}>
          Cancel
        </HaButton>
        {canMutate && (
          <HaButton
            variant="primary"
            onClick={onSave}
            isDisabled={busy || errors.length > 0}
          >
            {busy ? 'Saving…' : isEdit ? 'Save (bumps version)' : 'Create template'}
          </HaButton>
        )}
      </div>
    </div>
  );
}
