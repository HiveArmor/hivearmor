/**
 * AuthGuard
 * Route protection component.
 *
 * States:
 *   isLoading: true  → app is bootstrapping auth from localStorage; render spinner
 *   not authenticated → redirect to /login
 *   authenticated, insufficient role → render AccessDeniedPage in-place (PD-03)
 *   authorized → render children
 *
 * The isLoading guard prevents the redirect loop that occurs when the Zustand
 * store initialises as isAuthenticated: false before useAuthBootstrap resolves.
 */

import { Navigate, useLocation } from 'react-router-dom';

import { AccessDeniedPage } from '@/pages/auth/AccessDeniedPage';
import { useAuthStore } from '@/store/auth.store';

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles?: string[]; // if empty/undefined, any authenticated user may access
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps): JSX.Element {
  const location = useLocation();
  const { isAuthenticated, isLoading, user, hasAnyRole } = useAuthStore();

  // Still bootstrapping — wait; do not redirect yet
  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--ha-background)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            border: '2px solid var(--ha-border)',
            borderTopColor: 'var(--ha-primary)',
            borderRadius: '50%',
            animation: 'ha-spin 0.75s linear infinite',
          }}
        />
      </div>
    );
  }

  // Not authenticated → redirect to login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Authenticated but insufficient role → render access-denied in-place (PD-03)
  if (allowedRoles && allowedRoles.length > 0 && !hasAnyRole(allowedRoles)) {
    return <AccessDeniedPage />;
  }

  // Authorized → render children
  return <>{children}</>;
}
