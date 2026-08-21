import { useId } from 'react';

import { Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core';

import { HaButton } from '@/components/ha-button/HaButton';

import './HaConfirmationModal.css';

export interface HaConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export function HaConfirmationModal({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'primary',
  onConfirm,
  onCancel,
}: HaConfirmationModalProps): JSX.Element {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      variant="small"
      width="min(480px, calc(100vw - 32px))"
      className="ha-confirmation-modal"
      backdropClassName="ha-confirmation-modal__backdrop"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <ModalHeader
        labelId={titleId}
        title={title}
        titleIconVariant={variant === 'danger' ? 'warning' : 'info'}
      />
      <ModalBody className="ha-confirmation-modal__body">
        <p id={descriptionId}>{message}</p>
        {variant === 'danger' && (
          <div className="ha-confirmation-modal__guardrail" role="note">
            This decision is recorded in the audit trail. Verify the investigation record before continuing.
          </div>
        )}
      </ModalBody>
      <ModalFooter className="ha-confirmation-modal__footer">
        <HaButton variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </HaButton>
        <HaButton variant={variant} onClick={onConfirm}>
          {confirmLabel}
        </HaButton>
      </ModalFooter>
    </Modal>
  );
}
