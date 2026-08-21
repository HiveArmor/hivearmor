/**
 * Auth Service
 * Authentication and account management API calls.
 */

import { apiClient } from '@/lib/apiClient';
import type {
  AccountDTO,
  AuthenticateRequest,
  AuthenticateResponse,
  ChangePasswordRequest,
  ResetPasswordFinishRequest,
  ResetPasswordInitRequest,
} from '@/types/api.types';

export async function authenticate(req: AuthenticateRequest): Promise<AuthenticateResponse> {
  const response = await apiClient.post<AuthenticateResponse>('/authenticate', req, { auth: 'none' });
  // Backend returns "token" but we use "id_token" internally — normalize it
  if (response.token && !response.id_token) {
    response.id_token = response.token;
  }
  return response;
}

export async function getAccount(): Promise<AccountDTO> {
  return apiClient.get<AccountDTO>('/account');
}

export async function changePassword(req: ChangePasswordRequest): Promise<void> {
  return apiClient.post<void>('/account/change-password', req);
}

export async function resetPasswordInit(req: ResetPasswordInitRequest): Promise<void> {
  return apiClient.post<void>('/account/reset-password/init', req, { auth: 'none' });
}

export async function resetPasswordFinish(req: ResetPasswordFinishRequest): Promise<void> {
  return apiClient.post<void>('/account/reset-password/finish', req, { auth: 'none' });
}

export async function verifyTfaCode(code: string): Promise<AuthenticateResponse> {
  return apiClient.post<AuthenticateResponse>('/tfa/verify-code', { code });
}
