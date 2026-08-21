/**
 * systemSettings.service.ts — System Settings API service.
 *
 * Wraps all /api/ha-admin/settings/* endpoints via the shared apiClient.
 * apiClient injects the JWT from localStorage['hivearmor_auth_token'] and
 * routes all requests through the Vite proxy — never use absolute URLs here.
 *
 * Endpoints covered:
 *   GET  /api/ha-admin/settings             → fetch masked settings
 *   PUT  /api/ha-admin/settings/ai          → update AI/LLM tab
 *   PUT  /api/ha-admin/settings/email       → update Email/SMTP tab
 *   PUT  /api/ha-admin/settings/general     → update General tab
 *   PUT  /api/ha-admin/settings/security    → update Security tab
 *   POST /api/ha-admin/settings/ai/test     → probe currently configured LLM
 *
 * Requirements: 1.3, 1.4, 13.6, 13.7, 13.8
 */

import { apiClient } from '@/lib/apiClient';
import type {
  LlmProbeResult,
  SystemSettings,
  SystemSettingsAi,
  SystemSettingsEmail,
  SystemSettingsGeneral,
  SystemSettingsSecurity,
} from '@/types/systemSettings.types';

export const systemSettingsService = {
  /**
   * Fetch all settings with secrets masked as "***".
   * Maps to: GET /api/ha-admin/settings
   */
  getSettings: (): Promise<SystemSettings> =>
    apiClient.get<SystemSettings>('/ha-admin/settings'),

  /**
   * Update AI/LLM settings and trigger a hot-reload of the LLM client.
   * The backend publishes LlmConfigChangedEvent after a successful PUT.
   * Maps to: PUT /api/ha-admin/settings/ai
   *
   * The caller MUST set apiKeyTouched=true only when the user has edited the
   * apiKey field (Req 1.6 / 2.7).
   */
  updateAiSettings: (payload: SystemSettingsAi): Promise<SystemSettingsAi> =>
    apiClient.put<SystemSettingsAi>('/ha-admin/settings/ai', payload),

  /**
   * Update Email/SMTP settings.
   * Maps to: PUT /api/ha-admin/settings/email
   */
  updateEmailSettings: (payload: SystemSettingsEmail): Promise<SystemSettingsEmail> =>
    apiClient.put<SystemSettingsEmail>('/ha-admin/settings/email', payload),

  /**
   * Update General settings (site name, timezone, locale).
   * Maps to: PUT /api/ha-admin/settings/general
   */
  updateGeneralSettings: (payload: SystemSettingsGeneral): Promise<SystemSettingsGeneral> =>
    apiClient.put<SystemSettingsGeneral>('/ha-admin/settings/general', payload),

  /**
   * Update Security settings (session timeout, MFA, password policy).
   * Maps to: PUT /api/ha-admin/settings/security
   */
  updateSecuritySettings: (
    payload: SystemSettingsSecurity,
  ): Promise<SystemSettingsSecurity> =>
    apiClient.put<SystemSettingsSecurity>('/ha-admin/settings/security', payload),

  /**
   * Issue a live probe against the currently configured LLM endpoint.
   * The backend sanitizes error messages — apiKey is never leaked in the response.
   * Maps to: POST /api/ha-admin/settings/ai/test
   */
  probeLlm: (): Promise<LlmProbeResult> =>
    apiClient.post<LlmProbeResult>('/ha-admin/settings/ai/test'),
};
