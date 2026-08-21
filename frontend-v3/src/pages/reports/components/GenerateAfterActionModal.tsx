import { useState } from 'react';

import { Button, Form, FormGroup, TextArea, TextInput } from '@patternfly/react-core';

import { HaModal } from '@/components/ha-modal/HaModal';

interface GenerateAfterActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (values: { name: string; description: string; incidentId: string }) => void;
  isGenerating: boolean;
}

export function GenerateAfterActionModal({
  isOpen,
  onClose,
  onGenerate,
  isGenerating,
}: GenerateAfterActionModalProps): JSX.Element {
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
    <HaModal isOpen={isOpen} onClose={handleClose} title="New After-Action Report" width={600}>
      <Form onSubmit={handleSubmit}>
        <FormGroup label="Report Name" isRequired fieldId="aar-name">
          <TextInput
            id="aar-name"
            value={name}
            onChange={(_event, value) => setName(value)}
            placeholder="e.g., After-Action Review #12345"
            isRequired
            style={{
              '--pf-v5-c-form-control--BackgroundColor': 'var(--ha-surface-primary)',
              '--pf-v5-c-form-control--Color': 'var(--ha-text-primary)',
              '--pf-v5-c-form-control--BorderColor': 'var(--ha-border)',
            } as React.CSSProperties}
          />
        </FormGroup>

        <FormGroup label="Incident ID" isRequired fieldId="aar-incident-id">
          <TextInput
            id="aar-incident-id"
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

        <FormGroup label="Description" fieldId="aar-description">
          <TextArea
            id="aar-description"
            value={description}
            onChange={(_event, value) => setDescription(value)}
            placeholder="Optional description or notes"
            rows={4}
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
