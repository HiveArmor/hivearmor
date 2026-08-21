import { useState } from 'react';

import { Button, Form, FormGroup, TextInput } from '@patternfly/react-core';

import { HaModal } from '@/components/ha-modal/HaModal';

interface GenerateIncidentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (values: { name: string; description: string; incidentId: string }) => void;
  isGenerating: boolean;
}

export function GenerateIncidentReportModal({
  isOpen,
  onClose,
  onGenerate,
  isGenerating,
}: GenerateIncidentReportModalProps): JSX.Element {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [incidentId, setIncidentId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !incidentId) return;
    onGenerate({ name, description, incidentId });
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setIncidentId('');
    onClose();
  };

  return (
    <HaModal isOpen={isOpen} onClose={handleClose} title="Generate Incident Report" width={600}>
      <Form onSubmit={handleSubmit}>
        <FormGroup label="Report Name" isRequired fieldId="incident-report-name">
          <TextInput
            id="incident-report-name"
            value={name}
            onChange={(_event, value) => setName(value)}
            placeholder="e.g., Incident Report #12345"
            isRequired
            style={{
              '--pf-v5-c-form-control--BackgroundColor': 'var(--ha-surface-primary)',
              '--pf-v5-c-form-control--Color': 'var(--ha-text-primary)',
              '--pf-v5-c-form-control--BorderColor': 'var(--ha-border)',
            } as React.CSSProperties}
          />
        </FormGroup>

        <FormGroup label="Incident ID" isRequired fieldId="incident-id">
          <TextInput
            id="incident-id"
            value={incidentId}
            onChange={(_event, value) => setIncidentId(value)}
            placeholder="Enter incident ID"
            isRequired
            type="number"
            style={{
              '--pf-v5-c-form-control--BackgroundColor': 'var(--ha-surface-primary)',
              '--pf-v5-c-form-control--Color': 'var(--ha-text-primary)',
              '--pf-v5-c-form-control--BorderColor': 'var(--ha-border)',
            } as React.CSSProperties}
          />
        </FormGroup>

        <FormGroup label="Description" fieldId="incident-report-description">
          <TextInput
            id="incident-report-description"
            value={description}
            onChange={(_event, value) => setDescription(value)}
            placeholder="Optional description"
            style={{
              '--pf-v5-c-form-control--BackgroundColor': 'var(--ha-surface-primary)',
              '--pf-v5-c-form-control--Color': 'var(--ha-text-primary)',
              '--pf-v5-c-form-control--BorderColor': 'var(--ha-border)',
            } as React.CSSProperties}
          />
        </FormGroup>

        <div style={{ display: 'flex', gap: '8px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={handleClose} isDisabled={isGenerating}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isDisabled={!name || !incidentId || isGenerating}>
            {isGenerating ? 'Generating...' : 'Generate'}
          </Button>
        </div>
      </Form>
    </HaModal>
  );
}
