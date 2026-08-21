/**
 * Alert Stream Store
 * Manages SSE alert stream connection state and event buffer.
 * Events are capped at 100 most recent.
 */

import { create } from 'zustand';

export interface AlertStreamEvent {
  id: string;
  severity: string;
  title: string;
  timestamp: string;
  tenant: string;
}

interface AlertStreamState {
  connected: boolean;
  events: AlertStreamEvent[];
  newAlertCount: number;
  latestEvent: AlertStreamEvent | null;

  setConnected: (connected: boolean) => void;
  addEvent: (event: AlertStreamEvent) => void;
  clearNewAlertCount: () => void;
}

export const useAlertStreamStore = create<AlertStreamState>((set) => ({
  connected: false,
  events: [],
  newAlertCount: 0,
  latestEvent: null,

  setConnected: (connected) => set({ connected }),

  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, 100),
      newAlertCount: state.newAlertCount + 1,
      latestEvent: event,
    })),

  clearNewAlertCount: () => set({ newAlertCount: 0 }),
}));
