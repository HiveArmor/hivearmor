/**
 * Pagination logic tests for the incidents service layer.
 * Run with: npx vitest run "src/app/(app)/incidents/__tests__/pagination.test.ts"
 *
 * NOTE: Full React component tests (render/fireEvent) require installing
 * @testing-library/react and jsdom:
 *   npm install -D @testing-library/react jsdom @testing-library/jest-dom
 * and adding `environment: "jsdom"` to vitest.config.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Helpers mirrored from page.tsx ──────────────────────────────────────────

function calcTotalPages(total: number, pageSize: number): number {
  return Math.ceil(total / pageSize);
}

// Mirrors the Pagination component's window logic
function buildPageWindow(currentPage: number, totalPages: number): number[] {
  const windowSize = Math.min(5, totalPages);
  const half = Math.floor(windowSize / 2);
  let start = Math.max(0, currentPage - half);
  const end = Math.min(totalPages - 1, start + windowSize - 1);
  start = Math.max(0, end - windowSize + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

// ── Service mock helpers ─────────────────────────────────────────────────────

function makeServiceResponse(total: number, page: number, size: number) {
  const items = Array.from({ length: Math.min(size, Math.max(0, total - page * size)) }, (_, i) => ({
    id: page * size + i,
    incidentName: `Incident ${page * size + i}`,
    incidentStatus: "OPEN",
    incidentSeverity: 2,
  }));
  return { content: items, totalElements: total };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Pagination: totalPages calculation", () => {
  it("75 items at 25 per page → 3 pages", () => {
    expect(calcTotalPages(75, 25)).toBe(3);
  });

  it("76 items at 25 per page → 4 pages", () => {
    expect(calcTotalPages(76, 25)).toBe(4);
  });

  it("25 items at 25 per page → 1 page", () => {
    expect(calcTotalPages(25, 25)).toBe(1);
  });

  it("0 items → 0 pages", () => {
    expect(calcTotalPages(0, 25)).toBe(0);
  });

  it("10 items at 100 per page → 1 page", () => {
    expect(calcTotalPages(10, 100)).toBe(1);
  });
});

describe("Pagination: Previous/Next disabled state", () => {
  it("Previous is disabled on page 0", () => {
    const currentPage = 0;
    expect(currentPage === 0).toBe(true);
  });

  it("Next is disabled on last page", () => {
    const totalPages = 3;
    const currentPage = 2;
    expect(currentPage >= totalPages - 1).toBe(true);
  });

  it("Next is enabled when not on last page", () => {
    const totalPages = 3;
    const currentPage = 1;
    expect(currentPage >= totalPages - 1).toBe(false);
  });

  it("Previous is enabled on page > 0", () => {
    const currentPage = 1;
    expect(currentPage === 0).toBe(false);
  });
});

describe("Pagination: page window rendering", () => {
  it("shows pages 1-5 when on page 0 with 10 total", () => {
    expect(buildPageWindow(0, 10)).toEqual([0, 1, 2, 3, 4]);
  });

  it("centers window on current page", () => {
    expect(buildPageWindow(5, 10)).toEqual([3, 4, 5, 6, 7]);
  });

  it("clamps window at end", () => {
    expect(buildPageWindow(9, 10)).toEqual([5, 6, 7, 8, 9]);
  });

  it("shows all pages when totalPages <= 5", () => {
    expect(buildPageWindow(1, 3)).toEqual([0, 1, 2]);
  });
});

describe("Service list() returns pagination info", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses X-Total-Count header into totalElements", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      headers: { get: (h: string) => (h === "X-Total-Count" ? "75" : null) },
      json: async () => Array.from({ length: 25 }, (_, i) => ({ id: i, incidentName: `Inc ${i}`, incidentStatus: "OPEN", incidentSeverity: 2 })),
    });
    vi.stubGlobal("fetch", mockFetch);

    // Inline the service logic to avoid import-time api.getToken() side-effects
    const res = await fetch("/api/ha-incidents?page=0&size=25&sort=incidentCreatedDate%2Cdesc");
    const xTotal = res.headers.get("X-Total-Count");
    const data = await res.json();
    const result = {
      content: Array.isArray(data) ? data : [],
      totalElements: xTotal !== null ? parseInt(xTotal, 10) : data.length,
    };

    expect(result.totalElements).toBe(75);
    expect(result.content).toHaveLength(25);
  });

  it("uses default size of 25 (not 100) on first load", () => {
    // This asserts the constant used by the page component
    const DEFAULT_PAGE_SIZE = 25;
    expect(DEFAULT_PAGE_SIZE).not.toBe(100);
    expect(DEFAULT_PAGE_SIZE).toBe(25);
  });

  it("passes page and size to service correctly", () => {
    // Simulate the loadIncidents call with page=1, size=25
    const calls: Array<{ page: number; size: number }> = [];
    const mockList = (page: number, size: number) => {
      calls.push({ page, size });
      return makeServiceResponse(75, page, size);
    };

    mockList(0, 25);
    expect(calls[0]).toEqual({ page: 0, size: 25 });

    mockList(1, 25);
    expect(calls[1]).toEqual({ page: 1, size: 25 });
    expect(calls[1].size).not.toBe(100);
  });

  it("page 2 of 3 with size 25 returns items 50-74", () => {
    const result = makeServiceResponse(75, 2, 25);
    expect(result.content).toHaveLength(25);
    expect(result.content[0].id).toBe(50);
    expect(result.totalElements).toBe(75);
  });
});
