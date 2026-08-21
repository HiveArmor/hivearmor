/**
 * Property-based test for NewTenantWizard step-1 "Next" button state
 *
 * Feature: sprint-23-mssp-portal,
 * Property 4: clientPrefix bean-validation predicate is exactly ^[a-z0-9-]{2,20}$
 *
 * Validates: Requirements 8.5, 8.6, 10.4, 10.5
 *
 * Property: For any arbitrary string `prefix`, when step 1 of NewTenantWizard
 * is rendered with a non-empty tenant name and `prefix` as the clientPrefix,
 * the "Next" button is disabled if and only if `prefix` does NOT match
 * the regex /^[a-z0-9-]{2,20}$/.
 *
 * Minimum iterations: 100
 */

import { render, screen, fireEvent, act } from "@testing-library/react";
import * as fc from "fast-check";
import { describe, test, expect, vi, afterEach, beforeEach } from "vitest";

import { NewTenantWizard } from "./NewTenantWizard";

// ---------------------------------------------------------------------------
// Mocks — isolate the wizard from network, router, and query state
// ---------------------------------------------------------------------------

/**
 * Mock react-router-dom — the wizard calls useNavigate inside its mutation
 * onSuccess handler; we stub it with a no-op to avoid "no router" errors.
 */
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

/**
 * Mock @tanstack/react-query — the wizard calls useMutation to provision the
 * tenant on step 4. We stub it so no HTTP calls are made and the mutation
 * never fires during these step-1 property tests.
 */
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation: () => ({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      data: undefined,
      reset: vi.fn(),
    }),
  };
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The exact regex that NewTenantWizard uses as PREFIX_REGEX and that
 * NewTenantRequest.clientPrefix uses as its @Pattern constraint.
 */
const PREFIX_REGEX = /^[a-z0-9-]{2,20}$/;

/**
 * A fixed valid tenant name used in every iteration so that the "name is
 * non-empty" condition of isStep1Valid is always satisfied. This isolates
 * the test to the clientPrefix validation branch.
 */
const FIXED_VALID_NAME = "Test Tenant";

/**
 * aria-label of the Next button on step 1 (step + 1 = 2, label "Admin user").
 * Derived from NewTenantWizard.tsx:
 *   aria-label={`Advance to step ${step + 1}: ${STEP_LABELS[(step + 1)]}`}
 */
const NEXT_BUTTON_ARIA_LABEL = "Advance to step 2: Admin user";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Render NewTenantWizard in the initial state (step 1) and return the
 * unmount function for cleanup.
 */
function renderWizard() {
  return render(<NewTenantWizard />);
}

/**
 * Type into the Tenant name field and then type into the Client prefix field.
 * Uses fireEvent.change so that React state updates are synchronous.
 */
function fillStep1(name: string, prefix: string): void {
  // Fill in tenant name via the aria-label on HaTextInput
  const nameInput = screen.getByRole("textbox", { name: /tenant name/i });
  fireEvent.change(nameInput, { target: { value: name } });

  // Fill in client prefix via the aria-label on HaTextInput
  const prefixInput = screen.getByRole("textbox", { name: /client prefix/i });
  fireEvent.change(prefixInput, { target: { value: prefix } });
}

/**
 * Return the Next button element (or throw if absent).
 */
function getNextButton(): HTMLButtonElement {
  return screen.getByRole("button", {
    name: NEXT_BUTTON_ARIA_LABEL,
  }) as HTMLButtonElement;
}

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe(
  "Feature: sprint-23-mssp-portal, Property 4: clientPrefix bean-validation predicate is exactly ^[a-z0-9-]{2,20}$",
  () => {
    beforeEach(() => {
      mockNavigate.mockReset();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    test(
      "Next button is disabled iff clientPrefix does NOT match /^[a-z0-9-]{2,20}$/",
      () => {
        fc.assert(
          fc.property(
            /*
             * Generate a mix of valid and invalid prefix strings.
             *
             * Four sub-arbitraries are combined via fc.oneof so both branches
             * are exercised across the 100 iterations:
             *   (a) Valid: chars [a-z0-9-], length 2–20
             *   (b) Invalid: too short (0–1 chars)
             *   (c) Invalid: too long (21–35 chars)
             *   (d) Invalid: contains at least one uppercase letter
             *   (e) Invalid: contains a space
             */
            fc.oneof(
              // (a) Valid prefix
              fc.stringOf(
                fc.mapToConstant(
                  { num: 26, build: (n) => String.fromCharCode(97 + n) },   // a-z
                  { num: 10, build: (n) => String.fromCharCode(48 + n) },   // 0-9
                  { num: 1,  build: () => "-" },                             // -
                ),
                { minLength: 2, maxLength: 20 },
              ),
              // (b) Too short
              fc.stringOf(
                fc.mapToConstant(
                  { num: 26, build: (n) => String.fromCharCode(97 + n) },
                ),
                { minLength: 0, maxLength: 1 },
              ),
              // (c) Too long
              fc.stringOf(
                fc.mapToConstant(
                  { num: 26, build: (n) => String.fromCharCode(97 + n) },
                ),
                { minLength: 21, maxLength: 35 },
              ),
              // (d) Contains uppercase letter (guaranteed invalid)
              fc
                .tuple(
                  fc.stringOf(
                    fc.mapToConstant(
                      { num: 26, build: (n) => String.fromCharCode(97 + n) },
                    ),
                    { minLength: 1, maxLength: 10 },
                  ),
                  fc.stringOf(
                    fc.mapToConstant(
                      { num: 26, build: (n) => String.fromCharCode(65 + n) },  // A-Z
                    ),
                    { minLength: 1, maxLength: 5 },
                  ),
                )
                .map(([lower, upper]) => lower + upper),
              // (e) Contains a space (guaranteed invalid)
              fc
                .stringOf(
                  fc.mapToConstant(
                    { num: 26, build: (n) => String.fromCharCode(97 + n) },
                  ),
                  { minLength: 2, maxLength: 9 },
                )
                .map((s) => s + " suffix"),
            ),
            (prefix) => {
              const expectedValid = PREFIX_REGEX.test(prefix);

              // Render a fresh wizard for each iteration
              const { unmount } = renderWizard();

              // Fill in the form fields (wrapping in act ensures React flush)
              act(() => {
                fillStep1(FIXED_VALID_NAME, prefix);
              });

              // Query the Next button
              const nextBtn = getNextButton();

              /*
               * PatternFly v6 <Button isDisabled> renders a native <button>
               * element with the HTML disabled attribute set. We use the
               * .disabled DOM property for the assertion.
               *
               * Expected invariant:
               *   nextBtn.disabled === !expectedValid
               *
               * i.e. the button is disabled (true) when the prefix is invalid,
               * and enabled (false) when the prefix is valid.
               */
              expect(
                nextBtn.disabled,
                `prefix="${prefix}" matched regex=${expectedValid} → ` +
                  `expected button disabled=${!expectedValid} but got disabled=${nextBtn.disabled}`,
              ).toBe(!expectedValid);

              // Clean up between iterations to avoid DOM accumulation
              unmount();
            },
          ),
          {
            numRuns: 100,
            endOnFailure: true,
          },
        );
      },
    );
  },
);
