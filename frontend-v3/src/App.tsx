/**
 * App.tsx — Application root.
 * Renders the router provider with QueryClient.
 * Bootstraps auth from localStorage before rendering any route so that
 * AuthGuard never sees isAuthenticated: false while a valid token exists.
 */

import { Suspense } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';

import { useAuthBootstrap } from '@/hooks/useAuthBootstrap';
import { queryClient } from '@/lib/queryClient';
import { router } from '@/router';

function AppInner() {
  const { isBootstrapping } = useAuthBootstrap();

  // Hold the router until bootstrap is resolved so AuthGuard never gets a
  // false isAuthenticated: false mid-hydration and triggers a redirect loop.
  if (isBootstrapping) {
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
            width: 32,
            height: 32,
            border: '3px solid var(--ha-border)',
            borderTopColor: 'var(--ha-primary)',
            borderRadius: '50%',
            animation: 'ha-spin 0.75s linear infinite',
          }}
        />
        <style>{`@keyframes ha-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: 'var(--ha-background)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '3px solid var(--ha-border)',
          borderTopColor: 'var(--ha-primary)', borderRadius: '50%',
          animation: 'ha-spin 0.75s linear infinite' }} />
        <style>{`@keyframes ha-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <RouterProvider router={router} />
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}

export default App;
