/**
 * Property 9: MsspOverviewPage and TenantDetailPage render exactly one page-state branch
 *
 * Feature: sprint-23-mssp-portal,
 * Property 9: MsspOverviewPage and TenantDetailPage render exactly one page-state branch
 *
 * Validates: Requirements 7.8, 7.9, 7.10, 7.11, 13.7, 13.8
 *
 * For each generated (status, data) tuple:
 *   - Render the page
 *   - Assert exactly one of the testid markers is present in the DOM
 *   - Assert all other testid markers are absent
 *
 * MsspOverviewPage testids: mssp-overview-loading, mssp-overview-error,
 *                            mssp-overview-empty, mssp-overview-populated
 * TenantDetailPage testids: tenant-detail-loading, tenant-detail-notfound,
 *                            tenant-detail-populated
 *
 * Minimum iterations: 100
 */

import { render, screen } from "@testing-library/react";
import * as fc from "fast-check";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, test, expect, vi, afterEach, beforeEach } from "vitest";

import { MsspOverviewPage } from "./MsspOverviewPage";
import { TenantDetailPage } from "./TenantDetailPage";

// ---------------------------------------------------------------------------
// Shared mocked useQuery return value — mutated per iteration before render
// ---------------------------------------------------------------------------

interface UseQueryReturnValue {
  isLoading: boolean;
  isError: boolean;
  data: unknown;
  error: Error | null;
  refetch: () => void;
}

let _queryReturnValue: UseQueryReturnValue = {
  isLoading: false,
  isError: false,
  data: undefined,
  error: null,
  refetch: () => undefined,
};

function setQueryReturn(v: UseQueryReturnValue): void {
  _queryReturnValue = v;
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/**
 * Mock @tanstack/react-query — both pages call useQuery; we intercept it so
 * no network calls are made and we control the loading/error/data state.
 *
 * TanStack Query v5 uses { isLoading, isError, data, error, refetch }.
 */
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: () => _queryReturnValue,
    useMutation: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      data: undefined,
      reset: vi.fn(),
    }),
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
    }),
  };
});

/**
 * Mock msspNavStore — TenantDetailPage calls useMsspNavStore to record the
 * last-visited tenant id. Stub to a no-op so it doesn't read real Zustand.
 */
vi.mock("@/features/mssp/store/msspNavStore", () => ({
  useMsspNavStore: (sel: (s: { lastTenantId: null; setLastTenantId: () => void }) => unknown) =>
    sel({ lastTenantId: null, setLastTenantId: vi.fn() }),
}));

/**
 * Mock HaChart — ReactECharts renders a canvas element that requires
 * a real browser environment. In jsdom it throws; we stub it to a
 * lightweight placeholder so the page-state branches can render.
 */
vi.mock("@/components/ha-chart/HaChart", () => ({
  HaChart: () => <div data-testid="ha-chart-stub" />,
}));

/**
 * Mock SiemDataGrid — AgGridReact requires ResizeObserver and real DOM
 * measurements. Stub to a lightweight placeholder.
 */
vi.mock("@/components/siem-data-grid/SiemDataGrid", () => ({
  SiemDataGrid: () => <div data-testid="siem-data-grid-stub" />,
}));

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generate a minimal valid MsspOverviewDTO with an empty tenants array
 * (triggers the "empty" branch of MsspOverviewPage).
 */
const emptyOverviewArbitrary = fc.constant({
  tenantCount: 0,
  activeUserCount: 0,
  totalEps: 0,
  alertsToday: 0,
  tenants: [] as {
    id: number;
    name: string;
    clientPrefix: string;
    userCount: number;
    eps: number;
    healthStatus: "HEALTHY" | "DEGRADED" | "OFFLINE";
    lastEventAt: string | null;
  }[],
});

/**
 * Generate a minimal valid MsspOverviewDTO with ≥1 tenant
 * (triggers the "populated" branch).
 */
const populatedOverviewArbitrary = fc
  .array(
    fc.record({
      id: fc.integer({ min: 1, max: 1_000_000 }),
      name: fc.string({ minLength: 1, maxLength: 40 }),
      clientPrefix: fc.stringOf(
        fc.mapToConstant(
          { num: 26, build: (n) => String.fromCharCode(97 + n) },
          { num: 10, build: (n) => String.fromCharCode(48 + n) },
        ),
        { minLength: 2, maxLength: 8 },
      ),
      userCount: fc.integer({ min: 0, max: 500 }),
      eps: fc.integer({ min: 0, max: 100_000 }),
      healthStatus: fc.constantFrom(
        "HEALTHY" as const,
        "DEGRADED" as const,
        "OFFLINE" as const,
      ),
      lastEventAt: fc.option(fc.date().map((d) => d.toISOString()), { nil: null }),
    }),
    { minLength: 1, maxLength: 5 },
  )
  .map((tenants) => ({
    tenantCount: tenants.length,
    activeUserCount: tenants.reduce((s, t) => s + t.userCount, 0),
    totalEps: tenants.reduce((s, t) => s + t.eps, 0),
    alertsToday: 0,
    tenants,
  }));

/**
 * Generate a minimal valid TenantDetailDTO (populated branch).
 */
const tenantDetailArbitrary = fc.record({
  id: fc.integer({ min: 1, max: 1_000_000 }),
  name: fc.string({ minLength: 1, maxLength: 40 }),
  clientPrefix: fc.stringOf(
    fc.mapToConstant(
      { num: 26, build: (n) => String.fromCharCode(97 + n) },
    ),
    { minLength: 2, maxLength: 8 },
  ),
  maxUsers: fc.integer({ min: 1, max: 1_000 }),
  licenceType: fc.constantFrom("standard", "enterprise"),
  contactEmail: fc.option(fc.emailAddress(), { nil: null }),
  userCount: fc.integer({ min: 0, max: 500 }),
  eps: fc.integer({ min: 0, max: 100_000 }),
  epsSparkline: fc.array(fc.integer({ min: 0, max: 10_000 }), {
    minLength: 60,
    maxLength: 60,
  }),
  alertsTrend7d: fc.array(fc.integer({ min: 0, max: 1_000 }), {
    minLength: 7,
    maxLength: 7,
  }),
});

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/**
 * Render MsspOverviewPage in a minimal MemoryRouter context.
 * The real page calls useParams indirectly (it doesn't — only TenantDetailPage does).
 */
function renderOverviewPage() {
  return render(
    <MemoryRouter initialEntries={["/mssp/overview"]}>
      <Routes>
        <Route path="/mssp/overview" element={<MsspOverviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * Render TenantDetailPage with a fixed tenantId param so useParams works.
 */
function renderDetailPage() {
  return render(
    <MemoryRouter initialEntries={["/mssp/tenants/42"]}>
      <Routes>
        <Route path="/mssp/tenants/:tenantId" element={<TenantDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const OVERVIEW_TESTIDS = [
  "mssp-overview-loading",
  "mssp-overview-error",
  "mssp-overview-empty",
  "mssp-overview-populated",
] as const;

const DETAIL_TESTIDS = [
  "tenant-detail-loading",
  "tenant-detail-notfound",
  "tenant-detail-populated",
] as const;

/**
 * Assert exactly one testid from `candidates` is present in the current DOM.
 * Returns the matched testid for debugging.
 */
function assertExactlyOne(
  candidates: readonly string[],
  label: string,
): string {
  const present = candidates.filter(
    (id) => screen.queryByTestId(id) !== null,
  );

  expect(
    present.length,
    `[${label}] Expected exactly 1 of ${JSON.stringify(candidates)} to be present, ` +
      `but found ${present.length}: ${JSON.stringify(present)}`,
  ).toBe(1);

  return present[0] ?? candidates[0];
}

// ---------------------------------------------------------------------------
// Suite: MsspOverviewPage
// ---------------------------------------------------------------------------

describe(
  "Feature: sprint-23-mssp-portal, Property 9: MsspOverviewPage and TenantDetailPage render exactly one page-state branch",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    // ── MsspOverviewPage ──────────────────────────────────────────────────────

    test(
      "MsspOverviewPage: exactly one of {loading, error, empty, populated} is rendered",
      () => {
        /**
         * We generate one of four discriminated query states for the overview page:
         *   0 → isLoading = true                  → mssp-overview-loading
         *   1 → isError = true                    → mssp-overview-error
         *   2 → data.tenants is empty             → mssp-overview-empty
         *   3 → data.tenants has ≥1 element       → mssp-overview-populated
         */
        fc.assert(
          fc.property(
            fc.oneof(
              // Branch 0: loading
              fc.constant({ tag: "loading" as const }),
              // Branch 1: error
              fc.constant({ tag: "error" as const }),
              // Branch 2: empty data
              emptyOverviewArbitrary.map((d) => ({ tag: "empty" as const, data: d })),
              // Branch 3: populated data
              populatedOverviewArbitrary.map((d) => ({ tag: "populated" as const, data: d })),
            ),
            (scenario) => {
              // Configure the shared mock return value
              switch (scenario.tag) {
                case "loading":
                  setQueryReturn({
                    isLoading: true,
                    isError: false,
                    data: undefined,
                    error: null,
                    refetch: () => undefined,
                  });
                  break;
                case "error":
                  setQueryReturn({
                    isLoading: false,
                    isError: true,
                    data: undefined,
                    error: new Error("500"),
                    refetch: () => undefined,
                  });
                  break;
                case "empty":
                  setQueryReturn({
                    isLoading: false,
                    isError: false,
                    data: scenario.data,
                    error: null,
                    refetch: () => undefined,
                  });
                  break;
                case "populated":
                  setQueryReturn({
                    isLoading: false,
                    isError: false,
                    data: scenario.data,
                    error: null,
                    refetch: () => undefined,
                  });
                  break;
              }

              const { unmount } = renderOverviewPage();

              const matched = assertExactlyOne(OVERVIEW_TESTIDS, `overview/${scenario.tag}`);

              // Additionally verify the correct branch fired
              const expectedTestId = {
                loading: "mssp-overview-loading",
                error: "mssp-overview-error",
                empty: "mssp-overview-empty",
                populated: "mssp-overview-populated",
              }[scenario.tag];

              expect(
                matched,
                `[overview/${scenario.tag}] Expected testid "${expectedTestId}" but got "${matched}"`,
              ).toBe(expectedTestId);

              unmount();
            },
          ),
          { numRuns: 100, endOnFailure: true },
        );
      },
    );

    // ── TenantDetailPage ──────────────────────────────────────────────────────

    test(
      "TenantDetailPage: exactly one of {loading, notfound, populated} is rendered",
      () => {
        /**
         * Three discriminated query states for the detail page:
         *   0 → isLoading = true               → tenant-detail-loading
         *   1 → isError = true (404)            → tenant-detail-notfound
         *   2 → data is a valid TenantDetailDTO → tenant-detail-populated
         */
        fc.assert(
          fc.property(
            fc.oneof(
              // Branch 0: loading
              fc.constant({ tag: "loading" as const }),
              // Branch 1: not-found (404 error)
              fc.constant({ tag: "notfound" as const }),
              // Branch 2: populated
              tenantDetailArbitrary.map((d) => ({ tag: "populated" as const, data: d })),
            ),
            (scenario) => {
              switch (scenario.tag) {
                case "loading":
                  setQueryReturn({
                    isLoading: true,
                    isError: false,
                    data: undefined,
                    error: null,
                    refetch: () => undefined,
                  });
                  break;
                case "notfound":
                  setQueryReturn({
                    isLoading: false,
                    isError: true,
                    data: undefined,
                    error: new Error("404"),
                    refetch: () => undefined,
                  });
                  break;
                case "populated":
                  setQueryReturn({
                    isLoading: false,
                    isError: false,
                    data: scenario.data,
                    error: null,
                    refetch: () => undefined,
                  });
                  break;
              }

              const { unmount } = renderDetailPage();

              const matched = assertExactlyOne(DETAIL_TESTIDS, `detail/${scenario.tag}`);

              const expectedTestId = {
                loading: "tenant-detail-loading",
                notfound: "tenant-detail-notfound",
                populated: "tenant-detail-populated",
              }[scenario.tag];

              expect(
                matched,
                `[detail/${scenario.tag}] Expected testid "${expectedTestId}" but got "${matched}"`,
              ).toBe(expectedTestId);

              unmount();
            },
          ),
          { numRuns: 100, endOnFailure: true },
        );
      },
    );
  },
);
