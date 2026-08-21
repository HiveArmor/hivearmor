/**
 * useAuthBootstrap
 * Runs once on app startup. Reads the stored JWT from localStorage, calls
 * GET /api/account to validate it and hydrate the auth store, then marks
 * isLoading: false. This prevents the AuthGuard redirect-loop that occurs
 * when the store initialises as isAuthenticated: false on every page load.
 *
 * Usage: call once in App.tsx via useEffect; wrap router in a loading gate.
 */

import { useLayoutEffect } from 'react';

import { getAccount } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';

const TOKEN_KEY = 'hivearmor_auth_token';
const visualFixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

export function useAuthBootstrap(): { isBootstrapping: boolean } {
  const { isLoading, setUser, logout, setLoading } = useAuthStore();

  // Bootstrap before the browser paints. This prevents an authenticated
  // fixture session from briefly rendering /login before the router sees the
  // hydrated user, while production validation remains asynchronous.
  useLayoutEffect(() => {
    // Local visual-validation builds use a fictional analyst profile so pages
    // can be reviewed without a running identity service. This branch is
    // compile-time disabled in production builds.
    if (visualFixtureMode) {
      setUser(
        {
          id: 41,
          login: 'maya.chen',
          firstName: 'Maya',
          lastName: 'Chen',
          email: 'maya.chen@example.test',
          roles: ['ROLE_ANALYST', 'ROLE_SOC_MANAGER'],
          langKey: 'en',
        },
        'foundation-visual-validation-token'
      );
      return;
    }

    const token = localStorage.getItem(TOKEN_KEY);

    if (!token) {
      // No token — mark loading done immediately, AuthGuard can redirect to /login
      setLoading(false);
      return;
    }

    // Token exists — validate it with the backend and hydrate the store
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
      })
      .catch(() => {
        // Token is expired or invalid — clear it and let AuthGuard redirect
        logout();
      });
    // Effect runs once on mount — no deps needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isBootstrapping: isLoading };
}
