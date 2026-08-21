import { useState } from 'react';

import { Button, Form, FormGroup, FormSelect, FormSelectOption, TextArea, TextInput } from '@patternfly/react-core';

import { HaModal } from '@/components/ha-modal/HaModal';

interface CreateTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (values: { name: string; description: string; reportType: string }) => void;
  isCreating: boolean;
}

export function CreateTemplateModal({
  isOpen,
  onClose,
  onCreate,
  isCreating,
}: CreateTemplateModalProps): JSX.Element {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [reportType, setReportType] = useState('SITREP');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    onCreate({ name, description, reportType });
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setReportType('SITREP');
    onClose();
  };

  return (
    <HaModal isOpen={isOpen} onClose={handleClose} title="New Report Template" width={600}>
      <Form onSubmit={handleSubmit}>
        <FormGroup label="Template Name" isRequired fieldId="template-name">
          <TextInput
            id="template-name"
            value={name}
            onChange={(_event, value) => setName(value)}
            placeholder="e.g., Weekly SITREP Template"
            isRequired
            style={{
              '--pf-v5-c-form-control--BackgroundColor': 'var(--ha-surface-primary)',
              '--pf-v5-c-form-control--Color': 'var(--ha-text-primary)',
              '--pf-v5-c-form-control--BorderColor': 'var(--ha-border)',
            } as React.CSSProperties}
          />
        </FormGroup>

        <FormGroup label="Report Type" isRequired fieldId="template-report-type">
          <FormSelect
            id="template-report-type"
            value={reportType}
            onChange={(_event, value) => setReportType(value)}
            style={{
              '--pf-v5-c-form-control--BackgroundColor': 'var(--ha-surface-primary)',
              '--pf-v5-c-form-control--Color': 'var(--ha-text-primary)',
              '--pf-v5-c-form-control--BorderColor': 'var(--ha-border)',
            } as React.CSSProperties}
          >
            <FormSelectOption value="SITREP" label="Security SITREP" />
            <FormSelectOption value="INCIDENT" label="Incident Report" />
            <FormSelectOption value="AFTER_ACTION" label="After-Action Review" />
          </FormSelect>
        </FormGroup>

        <FormGroup label="Description" fieldId="template-description">
          <TextArea
            id="template-description"
            value={description}
            onChange={(_event, value) => setDescription(value)}
            placeholder="Describe this template's purpose and contents"
            rows={4}
            style={{
              '--pf-v5-c-form-control--BackgroundColor': 'var(--ha-surface-primary)',
              '--pf-v5-c-form-control--Color': 'var(--ha-text-primary)',
              '--pf-v5-c-form-control--BorderColor': 'var(--ha-border)',
            } as React.CSSProperties}
          />
        </FormGroup>

        <div style={{ display: 'flex', gap: '8px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={handleClose} isDisabled={isCreating}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isDisabled={!name || isCreating}>
            {isCreating ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </Form>
    </HaModal>
  );
}
