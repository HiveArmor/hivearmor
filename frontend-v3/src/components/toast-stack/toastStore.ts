import { create } from 'zustand';

export interface ToastItem {
  id: string;
  variant: 'success' | 'danger' | 'warning' | 'info';
  title: string;
  description?: string;
  timeout?: number;
}

/** @deprecated Use ToastItem — kept for backward compatibility */
export type ToastMessage = ToastItem;

interface ToastState {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id'> & { id?: string }) => void;
  /** @deprecated Use addToast */
  add: (toast: Omit<ToastItem, 'id'>) => void;
  remove: (id: string) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (toast) =>
    set((state) => {
      const id = toast.id ?? crypto.randomUUID();
      const newToasts = [...state.toasts, { ...toast, id }].slice(-5);
      return { toasts: newToasts };
    }),

  add: (toast) =>
    set((state) => {
      const id = crypto.randomUUID();
      const newToasts = [...state.toasts, { ...toast, id }].slice(-5);
      return { toasts: newToasts };
    }),

  remove: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  clearAll: () => set({ toasts: [] }),
}));
