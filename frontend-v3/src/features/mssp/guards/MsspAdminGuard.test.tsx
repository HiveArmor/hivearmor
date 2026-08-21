/**
 * Unit tests for MsspAdminGuard
 *
 * Validates: Requirements 2.7, 2.8
 *
 * Two branches are tested:
 *   (a) hasAuthority returns true  → children are rendered, access-denied text is absent
 *   (b) hasAuthority returns false → access-denied text is present, children are absent
 *
 * In both cases the navigate function returned by useNavigate must never be invoked.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, test, expect, vi, beforeEach } from "vitest";

import { MsspAdminGuard } from "./MsspAdminGuard";

// ---------------------------------------------------------------------------
// Mock: hasAuthority — controllable boolean
// ---------------------------------------------------------------------------

const mockHasAuthority = vi.fn<(authority: string) => boolean>();

vi.mock("@/lib/auth/hasAuthority", () => ({
  hasAuthority: (authority: string) => mockHasAuthority(authority),
}));

// ---------------------------------------------------------------------------
// Mock: react-router-dom — spy on useNavigate to assert it is never invoked
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCESS_DENIED_TEXT = "Access Denied";

function renderGuard(children: React.ReactNode) {
  return render(
    <MemoryRouter>
      <MsspAdminGuard>{children}</MsspAdminGuard>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MsspAdminGuard", () => {
  beforeEach(() => {
    mockHasAuthority.mockReset();
    mockNavigate.mockReset();
  });

  // -------------------------------------------------------------------------
  // Case (a): authorized — children rendered, access-denied absent
  // -------------------------------------------------------------------------

  test("(a) renders children when hasAuthority returns true", () => {
    mockHasAuthority.mockReturnValue(true);

    renderGuard(<div data-testid="kids">kids</div>);

    expect(screen.getByTestId("kids")).toBeInTheDocument();
    expect(screen.queryByText(ACCESS_DENIED_TEXT)).toBeNull();
  });

  test("(a) useNavigate return value is never invoked when authorized", () => {
    mockHasAuthority.mockReturnValue(true);

    renderGuard(<div data-testid="kids">kids</div>);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case (b): unauthorized — access-denied rendered, children absent
  // -------------------------------------------------------------------------

  test("(b) renders access-denied content when hasAuthority returns false", () => {
    mockHasAuthority.mockReturnValue(false);

    renderGuard(<div data-testid="kids">kids</div>);

    expect(screen.getByText(ACCESS_DENIED_TEXT)).toBeInTheDocument();
    expect(screen.queryByTestId("kids")).toBeNull();
  });

  test("(b) useNavigate return value is never invoked when unauthorized", () => {
    mockHasAuthority.mockReturnValue(false);

    renderGuard(<div data-testid="kids">kids</div>);

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
