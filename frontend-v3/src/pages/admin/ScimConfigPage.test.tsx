/**
 * ScimConfigPage.test.tsx
 *
 * Unit tests for the SCIM 2.0 Configuration admin page.
 *
 * Coverage:
 *   1. Token configured state   — "Configured" text rendered, "Revoke Token" button visible
 *   2. Token not configured     — "Not configured" and "Never used" text, no "Revoke Token"
 *   3. SCIM endpoint URL        — rendered string contains "/api/ha-scim/v2/"
 *   4. Generate token button    — "Generate Token" button is always present
 *
 * Security constraints (HiveArmor platform invariant 5.10):
 *   - NEVER assert on the plaintext token value in any test case
 *
 * Mocked dependencies:
 *   - @/hooks/useScimAdmin       — useScimTokenStatus, useGenerateScimToken, useRevokeScimToken
 *   - @/components/ha-page-header/SiemPageHeader
 *   - @/components/ha-modal/HaModal
 *   - @/components/toast-stack/toastStore
 *
 * Product name: HiveArmor
 */

import React from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import ScimConfigPage from './ScimConfigPage';

import type { ScimTokenStatus } from '@/types/scim';

// ---------------------------------------------------------------------------
// Module mocks — declared before component import (hoisted by Vitest)
// ---------------------------------------------------------------------------

// Mock SiemPageHeader — pure display component, not relevant to these tests
vi.mock('@/components/ha-page-header/SiemPageHeader', () => ({
  SiemPageHeader: ({ title }: { title: string }) => (
    <div data-testid="page-header">{title}</div>
  ),
}));

// Mock HaModal — avoids PatternFly Modal portal/focus-trap in jsdom
vi.mock('@/components/ha-modal/HaModal', () => ({
  HaModal: ({
    isOpen,
    children,
    title,
  }: {
    isOpen: boolean;
    children?: React.ReactNode;
    title?: string;
  }) => {
    if (!isOpen) return null;
    return (
      <div role="dialog" aria-label={title ?? 'modal'}>
        {children}
      </div>
    );
  },
}));

// Mock toastStore — mutations call addToast; keep tests silent
vi.mock('@/components/toast-stack/toastStore', () => ({
  useToastStore: () => ({
    addToast: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Control variables for the SCIM hooks — updated per test
// ---------------------------------------------------------------------------

type UseScimTokenStatusResult = {
  data: ScimTokenStatus | undefined;
  isLoading: boolean;
  isError: boolean;
};

let mockTokenStatus: UseScimTokenStatusResult = {
  data: undefined,
  isLoading: false,
  isError: false,
};

const mockGenerateMutate = vi.fn();
const mockRevokeMutate = vi.fn();

vi.mock('@/hooks/useScimAdmin', () => ({
  useScimTokenStatus: (): UseScimTokenStatusResult => mockTokenStatus,
  useGenerateScimToken: () => ({
    mutate: mockGenerateMutate,
    isPending: false,
  }),
  useRevokeScimToken: () => ({
    mutate: mockRevokeMutate,
    isPending: false,
  }),
}));

// ---------------------------------------------------------------------------
// Render helper — wraps in QueryClientProvider + MemoryRouter
// ---------------------------------------------------------------------------

function renderPage(): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/scim']}>
        <ScimConfigPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockTokenStatus = {
    data: undefined,
    isLoading: false,
    isError: false,
  };
  mockGenerateMutate.mockReset();
  mockRevokeMutate.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScimConfigPage', () => {
  describe('Token configured state', () => {
    it('renders "Configured" status text when a token is configured', () => {
      mockTokenStatus = {
        data: { configured: true, lastUsed: '2026-07-24T10:00:00Z' },
        isLoading: false,
        isError: false,
      };

      renderPage();

      expect(screen.getByText('Configured')).toBeInTheDocument();
    });

    it('renders "Revoke Token" button when a token is configured', () => {
      mockTokenStatus = {
        data: { configured: true, lastUsed: '2026-07-24T10:00:00Z' },
        isLoading: false,
        isError: false,
      };

      renderPage();

      expect(
        screen.getByRole('button', { name: /revoke token/i }),
      ).toBeInTheDocument();
    });
  });

  describe('Token not configured state', () => {
    it('renders "Not configured" status text when no token exists', () => {
      mockTokenStatus = {
        data: { configured: false, lastUsed: null },
        isLoading: false,
        isError: false,
      };

      renderPage();

      expect(screen.getByText('Not configured')).toBeInTheDocument();
    });

    it('renders "Never used" last-used text when token has never been used', () => {
      mockTokenStatus = {
        data: { configured: false, lastUsed: null },
        isLoading: false,
        isError: false,
      };

      renderPage();

      expect(screen.getByText('Never used')).toBeInTheDocument();
    });

    it('does NOT render "Revoke Token" button when no token is configured', () => {
      mockTokenStatus = {
        data: { configured: false, lastUsed: null },
        isLoading: false,
        isError: false,
      };

      renderPage();

      expect(
        screen.queryByRole('button', { name: /revoke token/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe('SCIM endpoint URL', () => {
    it('renders the SCIM base URL path containing /api/ha-scim/v2/', () => {
      mockTokenStatus = {
        data: { configured: false, lastUsed: null },
        isLoading: false,
        isError: false,
      };

      renderPage();

      // The full URL is window.location.origin + '/api/ha-scim/v2/'
      // jsdom sets origin to 'http://localhost', so the rendered text is
      // 'http://localhost/api/ha-scim/v2/' — assert on the invariant path portion.
      const codeEl = document.querySelector('code');
      expect(codeEl).not.toBeNull();
      expect(codeEl?.textContent).toContain('/api/ha-scim/v2/');
    });
  });

  describe('Generate Token button', () => {
    it('renders a "Generate Token" button when status data is available', () => {
      mockTokenStatus = {
        data: { configured: false, lastUsed: null },
        isLoading: false,
        isError: false,
      };

      renderPage();

      expect(
        screen.getByRole('button', { name: /generate token/i }),
      ).toBeInTheDocument();
    });

    it('renders a "Generate Token" button in the configured state too', () => {
      mockTokenStatus = {
        data: { configured: true, lastUsed: '2026-07-24T10:00:00Z' },
        isLoading: false,
        isError: false,
      };

      renderPage();

      expect(
        screen.getByRole('button', { name: /generate token/i }),
      ).toBeInTheDocument();
    });
  });
});
