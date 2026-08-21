import { Children, isValidElement, useId } from 'react';

import { Modal, ModalBody, ModalHeader } from '@patternfly/react-core';

export interface HaModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string | number;
  className?: string;
}

export function HaModal({
  isOpen,
  onClose,
  title,
  children,
  width,
  className = '',
}: HaModalProps): JSX.Element {
  const titleId = useId();
  const hasStructuredContent = Children.toArray(children).some(
    (child) => isValidElement(child) && (child.type === ModalHeader || child.type === ModalBody),
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      aria-label={hasStructuredContent ? title : undefined}
      aria-labelledby={hasStructuredContent ? undefined : titleId}
      className={className}
      width={width}
      maxWidth="calc(100vw - 32px)"
      style={{
        ...(width != null && {
          '--pf-v6-c-modal-box--Width': typeof width === 'number' ? `${width}px` : width,
        }),
        '--pf-v6-c-modal-box--MaxWidth': 'calc(100vw - 32px)',
        '--pf-v6-c-modal-box--BackgroundColor': 'var(--ha-surface-elevated)',
        '--pf-v6-c-modal-box--BoxShadow': 'var(--ha-shadow-medium)',
        '--pf-v6-c-modal-box--BorderColor': 'var(--ha-border-default)',
        '--pf-v6-c-modal-box--BorderRadius': 'var(--ha-radius-panel)',
        '--pf-v6-c-modal-box__title--Color': 'var(--ha-foreground-primary)',
        '--pf-v6-c-modal-box__body--Color': 'var(--ha-foreground-primary)',
      } as React.CSSProperties}
    >
      {hasStructuredContent ? children : (
        <>
          <ModalHeader title={title} labelId={titleId} />
          <ModalBody>{children}</ModalBody>
        </>
      )}
    </Modal>
  );
}
