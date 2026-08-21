import { useEffect } from 'react';

import { Alert, AlertActionCloseButton, AlertGroup } from '@patternfly/react-core';

import type { ToastItem } from './toastStore';
import { useToastStore } from './toastStore';

export function ToastStack(): JSX.Element {
  const { toasts, removeToast } = useToastStore();

  return (
    <AlertGroup
      isToast
      isLiveRegion
      aria-label="Notifications"
      style={{ zIndex: 'var(--ha-z-toast)' } as React.CSSProperties}
    >
      {toasts.map((toast) => (
        <ToastItemAlert key={toast.id} toast={toast} onClose={removeToast} />
      ))}
    </AlertGroup>
  );
}

interface ToastItemAlertProps {
  toast: ToastItem;
  onClose: (id: string) => void;
}

function ToastItemAlert({ toast, onClose }: ToastItemAlertProps): JSX.Element {
  useEffect(() => {
    const timeout = toast.timeout ?? 5000;
    const timer = setTimeout(() => onClose(toast.id), timeout);
    return () => clearTimeout(timer);
  }, [toast.id, toast.timeout, onClose]);

  return (
    <Alert
      variant={toast.variant}
      title={toast.title}
      actionClose={
        <AlertActionCloseButton
          aria-label="Close notification"
          variantLabel={toast.variant}
          onClose={() => onClose(toast.id)}
        />
      }
    >
      {toast.description}
    </Alert>
  );
}
