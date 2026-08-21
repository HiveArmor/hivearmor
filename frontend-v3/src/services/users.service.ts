/**
 * Users Service
 * User and admin management API calls.
 */

import { apiClient, type PaginatedResponse } from '@/lib/apiClient';
import type { CreateUserRequest, UpdateUserRequest, UserDTO } from '@/types/api.types';

export interface UserListParams {
  page?: number;
  size?: number;
  sort?: string;
  activated?: boolean;
}

export async function getUsers(params?: UserListParams): Promise<PaginatedResponse<UserDTO>> {
  const token = localStorage.getItem('hivearmor_auth_token');
  const queryParams = new URLSearchParams();
  if (params?.page !== undefined) queryParams.set('page', String(params.page));
  if (params?.size !== undefined) queryParams.set('size', String(params.size));
  if (params?.sort) queryParams.set('sort', params.sort);
  if (params?.activated !== undefined) queryParams.set('activated', String(params.activated));

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

  const items = await response.json();
  const total = parseInt(response.headers.get('X-Total-Count') ?? '0', 10);
  return { items, total };
}

export async function createUser(req: CreateUserRequest): Promise<UserDTO> {
  return apiClient.post<UserDTO>('/users', req);
}

export async function updateUser(req: UpdateUserRequest): Promise<UserDTO> {
  return apiClient.put<UserDTO>('/users', req);
}

export async function deleteUser(login: string): Promise<void> {
  return apiClient.delete<void>(`/users/${login}`);
}
