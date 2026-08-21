/**
 * platformSettings.types.ts — Platform Settings types
 */

export interface GeneralSettingsDTO {
  platformName: string; // Display name in masthead
  platformLogoUrl: string | null; // Logo URL (if hosted externally)
  timezone: string; // IANA timezone string, e.g. "America/New_York"
  dateFormat: string; // e.g. "YYYY-MM-DD HH:mm:ss"
  language: string; // ISO 639-1 code
}

export interface AuthSettingsDTO {
  localAuthEnabled: boolean; // Enable local username/password login
  mfaEnforced: boolean; // Force MFA for all users
  sessionTimeoutMinutes: number; // Session inactivity timeout; min 5, max 10080 (7 days)
  maxFailedLoginAttempts: number; // Lockout threshold; min 3, max 20
  lockoutDurationMinutes: number; // Lockout duration; min 1, max 1440
}

export interface NotificationDefaultsDTO {
  defaultEmailSender: string | null;
  alertNotificationsEnabled: boolean;
  incidentNotificationsEnabled: boolean;
  systemNotificationsEnabled: boolean;
}

export interface LoggingSettingsDTO {
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  retainDebugLogsHours: number; // min 1, max 168 (7 days)
}

export interface PlatformSettingsDTO {
  general: GeneralSettingsDTO;
  auth: AuthSettingsDTO;
  notificationDefaults: NotificationDefaultsDTO;
  logging: LoggingSettingsDTO;
}
