/**
 * Property test for MsspAdminGuard render branches
 *
 * Feature: sprint-23-mssp-portal, Property 2: MsspAdminGuard renders exactly one of {children, AccessDeniedPage} and never navigates
 *
 * Validates: Requirements 2.3, 2.4, 2.5, 2.7, 2.8, 3.3, 3.9, 3.10
 *
 * Property: For every combination of (authorized: boolean, childId: integer),
 *   - Exactly one of {children subtree, AccessDeniedPage marker} appears in the DOM
 *   - Never both, never neither
 *   - The `navigateFn` returned by useNavigate is never called
 *   - No <Navigate> element appears (query by data-testid="react-router-navigate")
 */

import { render, screen } from "@testing-library/react";
import * as fc from "fast-check";
import { MemoryRouter } from "react-router-dom";
import { describe, test, expect, vi, afterEach } from "vitest";

import { MsspAdminGuard } from "./MsspAdminGuard";

// ---------------------------------------------------------------------------
// Mock: hasAuthority — controllable boolean per iteration
// ---------------------------------------------------------------------------

const mockHasAuthority = vi.fn<(authority: string) => boolean>();

vi.mock("@/lib/auth/hasAuthority", () => ({
  hasAuthority: (authority: string) => mockHasAuthority(authority),
}));

// ---------------------------------------------------------------------------
// Mock: react-router-dom — intercept useNavigate so we can assert it is
// never invoked. We keep all other exports intact (MemoryRouter, etc.).
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// ---------------------------------------------------------------------------
// Mock: AccessDeniedPage dependencies
//
// The real AccessDeniedPage calls useNavigate, reads from useAuthStore, and
// imports CSS + HaButton. We mock the two runtime modules so the component
// renders its content without needing a full application context.
// ---------------------------------------------------------------------------

vi.mock("@/store/auth.store", () => ({
  useAuthStore: (_selector: (s: { user: null }) => null) => null,
}));

vi.mock("@/components/ha-button", () => ({
  HaButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

// AccessDeniedPage.css is a side-effect import — stub it so jsdom doesn't choke.
vi.mock("@/pages/auth/AccessDeniedPage.css", () => ({}));

// ---------------------------------------------------------------------------
// Property test suite
// ---------------------------------------------------------------------------

describe(
  "Feature: sprint-23-mssp-portal, Property 2: MsspAdminGuard renders exactly one of {children, AccessDeniedPage} and never navigates",
  () => {
    afterEach(() => {
      mockHasAuthority.mockReset();
      mockNavigate.mockReset();
    });

    test("Property 2", () => {
      fc.assert(
        fc.property(
          // Generate arbitrary authorization outcome
          fc.boolean(),
          // Generate arbitrary child id (0..99) to produce unique data-testid per iteration
          fc.integer({ min: 0, max: 99 }),
          (authorized, childId) => {
            mockHasAuthority.mockReturnValue(authorized);

            const { unmount } = render(
              <MemoryRouter>
                <MsspAdminGuard>
                  <span data-testid={`child-${childId}`}>child content</span>
                </MsspAdminGuard>
              </MemoryRouter>,
            );

            // --- Assertion 1: exactly one of {children, AccessDeniedPage} is present ---

            const childPresent =
              screen.queryByTestId(`child-${childId}`) !== null;

            // AccessDeniedPage renders the heading "Access Denied"
            const deniedPresent =
              screen.queryByText("Access Denied") !== null;

            // XOR: exactly one must be true (never both, never neither)
            expect(
              childPresent !== deniedPresent,
              `Expected exactly one of {children, AccessDeniedPage} — got childPresent=${childPresent}, deniedPresent=${deniedPresent} (authorized=${authorized})`,
            ).toBe(true);

            // --- Assertion 2: rendered branch matches authorization status ---

            expect(
              childPresent,
              `Expected childPresent === authorized (${authorized}), but childPresent=${childPresent}`,
            ).toBe(authorized);

            expect(
              deniedPresent,
              `Expected deniedPresent === !authorized (!${authorized}), but deniedPresent=${deniedPresent}`,
            ).toBe(!authorized);

            // --- Assertion 3: navigateFn is never called ---

            expect(
              mockNavigate,
              "useNavigate return value must never be invoked by MsspAdminGuard",
            ).not.toHaveBeenCalled();

            // --- Assertion 4: no <Navigate> element in DOM ---

            expect(
              screen.queryByTestId("react-router-navigate"),
              "<Navigate> element must not appear in the rendered output",
            ).toBeNull();

            // Clean up DOM between iterations
            unmount();
          },
        ),
        { numRuns: 100 },
      );
    });
  },
);
