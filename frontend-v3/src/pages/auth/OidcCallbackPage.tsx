/**
 * OidcCallbackPage — handles the OIDC redirect back from the backend.
 *
 * The backend redirects the browser to:
 *   /oidc-callback?token=<jwt>&source=oidc
 *
 * This page:
 *  1. Reads `token` and `source` from the URL query string.
 *  2. When both are present and source === 'oidc':
 *     a. Persists the JWT to localStorage under 'hivearmor_auth_token'.
 *     b. Fetches the account to hydrate the Zustand auth store (same pattern
 *        as LoginPage and useAuthBootstrap — setUser requires a HaUser object).
 *     c. Strips the token from the address bar via history.replaceState.
 *     d. Navigates to '/' using replace history.
 *  3. When either condition is absent, redirects to /login?error=oidc_callback_failed.
 *
 * Security constraints:
 *  - MUST NOT log the token value at any severity level.
 *  - MUST NOT use raw hex colour literals — all colours from CSS tokens.
 *  - No `any` type annotations.
 */

import { useEffect } from 'react';

import { Spinner } from '@patternfly/react-core';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { getAccount } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';

const TOKEN_KEY = 'hivearmor_auth_token';

export default function OidcCallbackPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);

  useEffect(() => {
    const token = searchParams.get('token');
    const source = searchParams.get('source');

    if (!token || source !== 'oidc') {
      navigate('/login?error=oidc_callback_failed', { replace: true });
      return;
    }

    // Persist the JWT so apiClient includes it in the /account call below
    localStorage.setItem(TOKEN_KEY, token);

    // Strip the token from the address bar before any further navigation —
    // prevents it from lingering in browser history or being copied from the URL
    window.history.replaceState({}, '', '/oidc-callback');

    // Hydrate the Zustand store with the real account (roles, name, etc.)
    getAccount()
      .then((account) => {
        setUser(
          {
            id: account.id,
            login: account.login,
            firstName: account.firstName,
            lastName: account.lastName,
            email: account.email,
            roles: account.authorities,
            langKey: account.langKey,
            imageUrl: account.imageUrl,
          },
          token
        );
        navigate('/', { replace: true });
      })
      .catch(() => {
        // Account fetch failed — token may be invalid or backend unreachable
        localStorage.removeItem(TOKEN_KEY);
        navigate('/login?error=oidc_callback_failed', { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--ha-background)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        color: 'var(--ha-text-secondary)',
      }}
      role="status"
      aria-label="Completing sign-in"
      aria-live="polite"
    >
      <Spinner size="xl" aria-label="Completing sign-in" />
      <span style={{ fontSize: '0.875rem' }}>Completing sign-in…</span>
    </div>
  );
}
