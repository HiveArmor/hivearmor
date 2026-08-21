/**
 * Unit tests for the MSSP Portal sidebar section in HaNavigation.
 *
 * Validates: Requirement 4.6
 *
 * Two branches are tested:
 *   (a) hasAuthority returns true  → "MSSP Portal" heading and all five child link
 *       labels are present in the rendered DOM
 *   (b) hasAuthority returns false → "MSSP Portal" heading and every child link label
 *       are absent from the rendered DOM
 *
 * HaNavigation is the actual sidebar component (AppSidebar per spec naming convention).
 * It is wrapped in a MemoryRouter because it internally calls useLocation/useNavigate.
 * Zustand stores are mocked so the component renders in isolation.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, test, expect, vi, beforeEach } from "vitest";

import { HaNavigation } from "@/components/ha-navigation/HaNavigation";

// ---------------------------------------------------------------------------
// Mock: hasAuthority — controllable boolean
// ---------------------------------------------------------------------------

const mockHasAuthority = vi.fn<(authority: string) => boolean>();

vi.mock("@/lib/auth/hasAuthority", () => ({
  hasAuthority: (authority: string) => mockHasAuthority(authority),
}));

// ---------------------------------------------------------------------------
// Mock: msspNavStore — no last-visited tenant (covers the base case where
// "Tenant detail" and "Tenant users" are conditionally hidden)
// ---------------------------------------------------------------------------

vi.mock("@/features/mssp/store/msspNavStore", () => ({
  useMsspNavStore: (selector: (s: { lastTenantId: string | null }) => unknown) =>
    selector({ lastTenantId: null }),
}));

// ---------------------------------------------------------------------------
// Mock: sidebar.store — expanded sidebar so labels are rendered in the DOM
// ---------------------------------------------------------------------------

vi.mock("@/store/sidebar.store", () => ({
  useSidebarStore: () => ({
    collapsed: false,
    toggle: vi.fn(),
    setCollapsed: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Mock: auth.store — authenticated user with no special roles
// ---------------------------------------------------------------------------

vi.mock("@/store/auth.store", () => ({
  useAuthStore: () => ({
    user: { id: 1, login: "user", firstName: "Test", lastName: "User", email: "u@test.com", roles: [] },
    token: "tok",
    isAuthenticated: true,
    isLoading: false,
    selectedTenantId: null,
    hasRole: () => false,
    hasAnyRole: () => false,
    getDefaultLanding: () => "/queue",
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderNav() {
  return render(
    <MemoryRouter>
      <HaNavigation />
    </MemoryRouter>,
  );
}

// Labels defined by Requirement 4.2 (always-visible three)
const ALWAYS_VISIBLE_LABELS = ["Overview", "Tenants", "New tenant"] as const;
// Labels only shown when lastTenantId !== null (mocked as null above)
const DYNAMIC_LABELS = ["Tenant detail", "Tenant users"] as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AppSidebar MSSP Portal section", () => {
  beforeEach(() => {
    mockHasAuthority.mockReset();
  });

  // -------------------------------------------------------------------------
  // Case (a): authorized — MSSP Portal heading and child links are visible
  // -------------------------------------------------------------------------

  test("(a) shows MSSP Portal section heading when hasAuthority returns true", () => {
    mockHasAuthority.mockImplementation((a) => a === "MSSP_ADMIN");

    renderNav();

    expect(screen.getByText("MSSP Portal")).toBeInTheDocument();
  });

  test("(a) shows always-visible child link labels when authorized", () => {
    mockHasAuthority.mockImplementation((a) => a === "MSSP_ADMIN");

    renderNav();

    for (const label of ALWAYS_VISIBLE_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  // -------------------------------------------------------------------------
  // Case (b): unauthorized — MSSP Portal heading and all child labels absent
  // -------------------------------------------------------------------------

  test("(b) hides MSSP Portal section heading when hasAuthority returns false", () => {
    mockHasAuthority.mockReturnValue(false);

    renderNav();

    expect(screen.queryByText("MSSP Portal")).toBeNull();
  });

  test("(b) hides always-visible child link labels when not authorized", () => {
    mockHasAuthority.mockReturnValue(false);

    renderNav();

    for (const label of ALWAYS_VISIBLE_LABELS) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  test("(b) hides dynamic child link labels when not authorized", () => {
    mockHasAuthority.mockReturnValue(false);

    renderNav();

    for (const label of DYNAMIC_LABELS) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });
});
