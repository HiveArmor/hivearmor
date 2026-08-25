/**
 * Shared authenticated fetch for MSSP portal APIs.
 * Always attaches Bearer JWT from localStorage — never credentials-only cookie auth.
 */

const TOKEN_KEY = 'hivearmor_auth_token';

export async function msspFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(path.startsWith('/api/') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`, {
    ...options,
    headers,
  });
}

export function msspHttpError(status: number): Error {
  return new Error(String(status));
}
