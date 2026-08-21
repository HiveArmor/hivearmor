/**
 * platformSettings.service.ts — Platform Settings API
 */

import { apiClient } from '@/lib/apiClient';
import type { PlatformSettingsDTO } from '@/types/platformSettings.types';

export const platformSettingsService = {
  getSettings: () => apiClient.get<PlatformSettingsDTO>('/ha-settings'),

  updateSettings: (settings: PlatformSettingsDTO) =>
    apiClient.put<PlatformSettingsDTO>('/ha-settings', settings),
};
