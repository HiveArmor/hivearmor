import { useState } from 'react';

import { Button, Form, FormGroup, TextInput } from '@patternfly/react-core';

import { HaModal } from '@/components/ha-modal/HaModal';

interface GenerateSitrepModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (values: { name: string; description: string; periodFrom: string; periodTo: string }) => void;
  isGenerating: boolean;
}

export function GenerateSitrepModal({
  isOpen,
  onClose,
  onGenerate,
  isGenerating,
}: GenerateSitrepModalProps): JSX.Element {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !periodFrom || !periodTo) return;
    onGenerate({ name, description, periodFrom, periodTo });
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setPeriodFrom('');
    setPeriodTo('');
    onClose();
  };

  return (
    <HaModal isOpen={isOpen} onClose={handleClose} title="Generate Security SITREP" width={600}>
      <Form onSubmit={handleSubmit}>
        <FormGroup label="Report Name" isRequired fieldId="sitrep-name">
          <TextInput
            id="sitrep-name"
            value={name}
            onChange={(_event, value) => setName(value)}
            placeholder="e.g., Weekly SITREP 2024-W30"
            isRequired
            style={{
              '--pf-v5-c-form-control--BackgroundColor': 'var(--ha-surface-primary)',
              '--pf-v5-c-form-control--Color': 'var(--ha-text-primary)',
              '--pf-v5-c-form-control--BorderColor': 'var(--ha-border)',
            } as React.CSSProperties}
          />
        </FormGroup>

        <FormGroup label="Description" fieldId="sitrep-description">
          <TextInput
            id="sitrep-description"
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

        <FormGroup label="Period From" isRequired fieldId="sitrep-period-from">
          <TextInput
            id="sitrep-period-from"
            type="date"
            value={periodFrom}
            onChange={(_event, value) => setPeriodFrom(value)}
            isRequired
            style={{
              '--pf-v5-c-form-control--BackgroundColor': 'var(--ha-surface-primary)',
              '--pf-v5-c-form-control--Color': 'var(--ha-text-primary)',
              '--pf-v5-c-form-control--BorderColor': 'var(--ha-border)',
            } as React.CSSProperties}
          />
        </FormGroup>

        <FormGroup label="Period To" isRequired fieldId="sitrep-period-to">
          <TextInput
            id="sitrep-period-to"
            type="date"
            value={periodTo}
            onChange={(_event, value) => setPeriodTo(value)}
            isRequired
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
          <Button type="submit" variant="primary" isDisabled={!name || !periodFrom || !periodTo || isGenerating}>
            {isGenerating ? 'Generating...' : 'Generate'}
          </Button>
        </div>
      </Form>
    </HaModal>
  );
}
