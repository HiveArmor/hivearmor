/**
 * useSendTestEmail — TanStack Query v5 mutation hook for
 * POST /api/ha-admin/settings/email/test.
 *
 * Sends a test email through the currently persisted SMTP settings (the same
 * pattern as the AI probe — it uses the SAVED configuration, so the user should
 * Save before testing). The backend always returns HTTP 200 with { ok, error? };
 * failure messages are sanitized and never include the SMTP password.
 *
 * Modelled as a mutation (not a query) because it is a side-effecting action the
 * user explicitly triggers — not a background refetch.
 *
 * Security invariants:
 *   - apiClient injects JWT from localStorage['hivearmor_auth_token'].
 *   - No direct localStorage access in this hook.
 *   - No `any` types (Req 13.8).
 *
 * Requirements: 3.2, 4, 13.6, 13.7, 13.8
 */

import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import { systemSettingsService } from '@/services/systemSettings.service';
import type { SmtpTestResult } from '@/types/systemSettings.types';

/**
 * Mutation hook for sending a test email via the saved SMTP settings.
 *
 * @example
 * const { mutate, data, isPending } = useSendTestEmail();
 * mutate('ops@example.test');
 * if (data?.ok) { ... } else { console.warn(data?.error); }
 */
export function useSendTestEmail(): UseMutationResult<SmtpTestResult, Error, string> {
  return useMutation<SmtpTestResult, Error, string>({
    mutationFn: (recipient: string) =>
      systemSettingsService.sendTestEmail(recipient),
  });
}
