/**
 * API Client Singleton
 * All backend calls go through this client.
 * Handles JWT auth, tenant headers, error handling, and auto-logout on 401.
 */

import { useAuthStore } from '@/store/auth.store';

const TOKEN_KEY = 'hivearmor_auth_token';
const BASE_PATH = '/api'; // always relative — Vite proxy handles routing
const visualFixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ApiRequestOptions {
  method?: HttpMethod;
  body?: unknown;
  params?: Record<string, string | number | boolean | string[] | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Public authentication/bootstrap calls must not inherit a stale bearer token. */
  auth?: 'required' | 'none';
}

export interface ApiErrorResponse {
  status: number;
  title?: string;
  detail?: string;
  message?: string;
  fieldErrors?: { field: string; message: string }[];
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorResponse,
    message?: string
  ) {
    super(message ?? body.detail ?? body.message ?? `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | string[] | undefined>): string {
  const url = new URL(path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (Array.isArray(value)) {
        value.forEach((v) => url.searchParams.append(key, String(v)));
      } else {
        url.searchParams.set(key, String(value));
      }
    });
  }
  return url.pathname + url.search;
}

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params, headers = {}, signal, auth = 'required' } = options;

  const token = getToken();
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...headers,
  };

  if (auth === 'required' && token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  // Tenant selection is an authenticated authorization claim. Public bootstrap
  // and credential requests must never inherit stale tenant scope from a prior
  // browser session, otherwise the backend correctly rejects them fail-closed.
  const { selectedTenantId } = useAuthStore.getState();
  if (auth === 'required' && selectedTenantId !== null) {
    requestHeaders['X-Tenant-ID'] = String(selectedTenantId);
  }

  const url = buildUrl(`${BASE_PATH}${path}`, params);

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  // Auto-logout on 401
  if (response.status === 401 && auth === 'required' && !visualFixtureMode) {
    useAuthStore.getState().logout();
    window.location.href = '/login';
    throw new ApiError(401, { status: 401, message: 'Session expired' });
  }

  if (!response.ok) {
    let errorBody: ApiErrorResponse;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = { status: response.status, message: response.statusText };
    }
    throw new ApiError(response.status, errorBody);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return response.json() as Promise<T>;
  }

  return response.text() as unknown as T;
}

// Named exports — use these in service files
export const apiClient = {
  get: <T>(path: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),

  put: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', body }),

  patch: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),

  delete: <T>(path: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
