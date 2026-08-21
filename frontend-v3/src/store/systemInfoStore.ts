/**
 * System Info Store
 * Holds system metadata fetched from /api/ha-admin/system-info.
 * In-memory only — no persistence to localStorage or sessionStorage.
 */

import { create } from 'zustand';

export interface SystemInfo {
  appName: string;
  version: string;
  airGapMode: boolean;
  osVersion: string;
  javaVersion: string;
}

interface SystemInfoState {
  appName: string | null;
  version: string | null;
  airGapMode: boolean;
  osVersion: string | null;
  javaVersion: string | null;
  isLoaded: boolean;

  // Actions
  setSystemInfo: (info: SystemInfo) => void;
}

export const useSystemInfoStore = create<SystemInfoState>((set) => ({
  appName: null,
  version: null,
  airGapMode: false,
  osVersion: null,
  javaVersion: null,
  isLoaded: false,

  setSystemInfo: (info) =>
    set({
      appName: info.appName,
      version: info.version,
      airGapMode: info.airGapMode,
      osVersion: info.osVersion,
      javaVersion: info.javaVersion,
      isLoaded: true,
    }),
}));
