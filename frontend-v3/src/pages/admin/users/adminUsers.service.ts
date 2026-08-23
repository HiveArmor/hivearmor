/**
 * Admin Users Service
 * API calls for user management and authorities.
 * ADM-01 §2
 */

import type { AuthorityDTO, UserFormData } from './adminUsers.types';

import type { PaginatedResponse } from '@/lib/apiClient';
import { apiClient } from '@/lib/apiClient';
import type { UserDTO } from '@/types/api.types';

export interface UserListParams {
  login?: string;
  email?: string;
  activated?: boolean;
  authorities?: string;
  page: number;
  size: number;
  sort?: string;
}

/**
 * Get paginated list of users
 * ADM-01 §2
 * Backend verified: hasRole('ROLE_ADMIN')
 */
export async function getUsers(params: UserListParams): Promise<PaginatedResponse<UserDTO>> {
  const token = localStorage.getItem('hivearmor_auth_token');
  const queryParams = new URLSearchParams();

  if (params.login) queryParams.set('login', params.login);
  if (params.email) queryParams.set('email', params.email);
  if (params.activated !== undefined) queryParams.set('activated', String(params.activated));
  if (params.authorities) queryParams.set('authorities', params.authorities);
  queryParams.set('page', String(params.page));
  queryParams.set('size', String(params.size));
  if (params.sort) queryParams.set('sort', params.sort);

  const url = `/api/users?${queryParams.toString()}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const items = (await response.json()) as UserDTO[];
  const total = parseInt(response.headers.get('X-Total-Count') ?? '0', 10);
  return { items, total };
}

/**
 * Create new user
 * ADM-01 §2
 * Backend verified: hasRole('ROLE_ADMIN')
 */
export async function createUser(data: UserFormData): Promise<UserDTO> {
  return apiClient.post<UserDTO>('/users', {
    login: data.login,
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    authorities: data.authorities,
    langKey: 'en',
    activated: data.activated,
    password: data.password,
  });
}

/**
 * Update existing user
 * ADM-01 §2
 * Backend verified: hasRole('ROLE_ADMIN')
 */
export async function updateUser(user: UserDTO, data: UserFormData): Promise<UserDTO> {
  return apiClient.put<UserDTO>('/users', {
    id: user.id,
    login: data.login,
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    authorities: data.authorities,
    langKey: 'en',
    activated: data.activated,
  });
}

/**
 * Deactivate user
 * ADM-01 §2
 * Backend verified: hasRole('ROLE_ADMIN')
 */
export async function deleteUser(login: string): Promise<void> {
  return apiClient.delete<void>(`/users/${login}`);
}

/**
 * Get all application authorities (roles)
 * ADM-01 §2
 * GAP-SEC-01 CRITICAL: AuthorityResource has no @PreAuthorize.
 * This endpoint is completely unprotected at the backend level.
 * This screen MUST NOT be deployed to production until the backend is fixed.
 * Frontend route guard (ROLE_ADMIN) is a UX convenience only, not a security gate.
 */
export async function getAuthorities(): Promise<AuthorityDTO[]> {
  const names = await apiClient.get<string[]>('/users/authorities');
  return names.map((name) => ({ id: name, name }));
}
