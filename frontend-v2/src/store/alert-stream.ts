import { create } from "zustand";

export type StreamStatus = "connecting" | "connected" | "reconnecting" | "error";

export interface LiveAlert {
  id: string;
  name: string;
  severity: string;
  status: string;
  timestamp: string;
  [key: string]: unknown;
}

interface AlertStreamState {
  // Alert stream
  newAlertCount: number;
  latestAlerts: LiveAlert[];
  alertStreamStatus: StreamStatus;

  // EPS stream
  eps: number;
  epsHistory: number[]; // rolling 60-point buffer
  epsStreamStatus: StreamStatus;

  // Actions
  pushAlert: (alert: LiveAlert) => void;
  resetAlertCount: () => void;
  setAlertStreamStatus: (status: StreamStatus) => void;
  pushEps: (value: number) => void;
  setEpsStreamStatus: (status: StreamStatus) => void;
}

export const useAlertStreamStore = create<AlertStreamState>((set) => ({
  newAlertCount: 0,
  latestAlerts: [],
  alertStreamStatus: "connecting",

  eps: 0,
  epsHistory: [],
  epsStreamStatus: "connecting",

  pushAlert: (alert) =>
    set((s) => ({
      newAlertCount: s.newAlertCount + 1,
      // Keep the 20 most recent alerts
      latestAlerts: [alert, ...s.latestAlerts].slice(0, 20),
    })),

  resetAlertCount: () => set({ newAlertCount: 0 }),

  setAlertStreamStatus: (alertStreamStatus) => set({ alertStreamStatus }),

  pushEps: (value) =>
    set((s) => ({
      eps: value,
      // Rolling 60-point buffer
      epsHistory: [...s.epsHistory, value].slice(-60),
    })),

  setEpsStreamStatus: (epsStreamStatus) => set({ epsStreamStatus }),
}));
