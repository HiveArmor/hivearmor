import { useState } from 'react';

import { Modal, Button, TextInput } from '@patternfly/react-core';

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  isDanger?: boolean;
  isLoading?: boolean;
  requireTyping?: string;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  isDanger = false,
  isLoading = false,
  requireTyping,
}: ConfirmationModalProps): JSX.Element {
  const [typedValue, setTypedValue] = useState('');

  const handleConfirm = () => {
    if (requireTyping && typedValue !== requireTyping) {
      return;
    }
    onConfirm();
  };

  const handleClose = () => {
    setTypedValue('');
    onClose();
  };

  const isConfirmDisabled =
    isLoading || (requireTyping !== undefined && typedValue !== requireTyping);

  return (
    <Modal
      title={title}
      isOpen={isOpen}
      onClose={handleClose}
      aria-label={title}
      style={{
        '--pf-v5-c-modal-box--BackgroundColor': 'var(--ha-surface-raised)',
        '--pf-v5-c-modal-box--BoxShadow': 'var(--ha-shadow-control)',
        '--pf-v5-c-modal-box--BorderColor': 'var(--ha-border)',
        '--pf-v5-c-modal-box--BorderRadius': 'var(--ha-radius-lg)',
        '--pf-v5-c-modal-box__title--Color': 'var(--ha-text-primary)',
        '--pf-v5-c-modal-box__body--Color': 'var(--ha-text-primary)',
        '--pf-v5-c-modal-box--Width': '480px',
      } as React.CSSProperties}
    >
      <div
        style={{
          fontSize: 'var(--ha-text-sm)',
          color: 'var(--ha-text-primary)',
          lineHeight: 1.5,
          marginBottom: requireTyping ? 'var(--ha-space-4)' : 0,
        }}
      >
        {description}
      </div>
      {requireTyping && (
        <div style={{ marginTop: 'var(--ha-space-4)' }}>
          <label
            htmlFor="confirmation-input"
            style={{
              display: 'block',
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-secondary)',
              marginBottom: 'var(--ha-space-2)',
            }}
          >
            Type <strong>{requireTyping}</strong> to confirm:
          </label>
          <TextInput
            id="confirmation-input"
            type="text"
            value={typedValue}
            onChange={(_event, value) => setTypedValue(value)}
            placeholder={requireTyping}
            isDisabled={isLoading}
            style={{
              '--pf-v5-c-form-control--BackgroundColor': 'var(--ha-surface-primary)',
              '--pf-v5-c-form-control--BorderColor': 'var(--ha-border)',
              '--pf-v5-c-form-control--Color': 'var(--ha-text-primary)',
            } as React.CSSProperties}
          />
        </div>
      )}
      <div
        style={{
          marginTop: 'var(--ha-space-6)',
          display: 'flex',
          gap: 'var(--ha-space-2)',
          justifyContent: 'flex-end',
        }}
      >
        <Button variant="link" onClick={handleClose} isDisabled={isLoading}>
          Cancel
        </Button>
        <Button
          variant={isDanger ? 'danger' : 'primary'}
          onClick={handleConfirm}
          isDisabled={isConfirmDisabled}
          isLoading={isLoading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
