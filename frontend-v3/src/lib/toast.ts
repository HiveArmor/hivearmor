/**
 * Toast Notification System
 * Thin helpers that call the Zustand toastStore from non-React contexts (service callbacks, etc.).
 * Use getState() instead of the hook so these functions work outside component trees.
 */

import { useToastStore } from '@/components/toast-stack/toastStore';

export function showSuccessToast(title: string, description?: string): void {
  useToastStore.getState().addToast({
    id: crypto.randomUUID(),
    variant: 'success',
    title,
    description,
  });
}

export function showErrorToast(title: string, description?: string): void {
  useToastStore.getState().addToast({
    id: crypto.randomUUID(),
    variant: 'danger',
    title,
    description,
  });
}

export function showWarningToast(title: string, description?: string): void {
  useToastStore.getState().addToast({
    id: crypto.randomUUID(),
    variant: 'warning',
    title,
    description,
  });
}

export function showInfoToast(title: string, description?: string): void {
  useToastStore.getState().addToast({
    id: crypto.randomUUID(),
    variant: 'info',
    title,
    description,
  });
}
