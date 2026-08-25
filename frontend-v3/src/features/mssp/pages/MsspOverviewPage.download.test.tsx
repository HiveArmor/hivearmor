/**
 * Frontend unit test for DownloadAggregateButton
 *
 * Requirements: 12.8, 19.7, 19.11
 *
 * Asserts:
 *   1. fetch is called exactly once with the correct URL and Authorization header
 *   2. No fetch call carries the JWT token in the URL
 *   3. When fetch resolves with status 403, an error banner is rendered
 *      and no anchor click is dispatched
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

import { DownloadAggregateButton } from "./DownloadAggregateButton";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MOCK_TOKEN = "test-jwt-token-abc123";
const ENDPOINT = "/api/ha-mssp/reports/aggregate";

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Stub localStorage globally so window.localStorage.getItem is intercepted
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => {
      if (key === "hivearmor_auth_token") return MOCK_TOKEN;
      return null;
    }),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  });

  // Stub URL.createObjectURL / revokeObjectURL (not available in jsdom)
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:mock-url"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Test 1: fetch called with correct URL and Authorization header — Req 12.8, 19.7
// ---------------------------------------------------------------------------

describe("DownloadAggregateButton — fetch call", () => {
  test("fetch is called exactly once with correct URL and Authorization header", async () => {
    // Arrange: fetch returns 200 with a stub blob
    const mockBlob = new Blob(["xlsx-stub"], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const mockResponse = {
      status: 200,
      blob: vi.fn().mockResolvedValue(mockBlob),
      headers: {
        get: vi.fn().mockImplementation((h: string) =>
          h === "Content-Disposition"
            ? 'attachment; filename="hivearmor-mssp-aggregate-2025-07-24.xlsx"'
            : null
        ),
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(mockResponse);
    vi.stubGlobal("fetch", fetchMock);

    // Act
    render(<DownloadAggregateButton />);
    const button = screen.getByRole("button", { name: /download aggregate report/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // Assert: correct URL
    const [calledUrl, calledOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(ENDPOINT);

    // Assert: Authorization header contains the token (Headers or plain object)
    const rawHeaders = calledOptions.headers;
    const auth =
      rawHeaders instanceof Headers
        ? rawHeaders.get("Authorization")
        : (rawHeaders as Record<string, string> | undefined)?.Authorization ??
          (rawHeaders as Record<string, string> | undefined)?.authorization;
    expect(auth).toBe(`Bearer ${MOCK_TOKEN}`);
  });

  // ── Req 19.11: JWT must not appear in the URL ──────────────────────────────

  test("no fetch call carries the JWT token in the URL — Req 19.11", async () => {
    const mockBlob = new Blob(["xlsx"]);
    const mockResponse = {
      status: 200,
      blob: vi.fn().mockResolvedValue(mockBlob),
      headers: {
        get: vi.fn().mockReturnValue(
          'attachment; filename="hivearmor-mssp-aggregate-2025-07-24.xlsx"'
        ),
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(mockResponse);
    vi.stubGlobal("fetch", fetchMock);

    render(<DownloadAggregateButton />);
    fireEvent.click(screen.getByRole("button", { name: /download aggregate report/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    for (const call of fetchMock.mock.calls) {
      const url = String(call[0]);
      expect(url).not.toContain(MOCK_TOKEN);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 2: error banner on 403 and no download triggered — Req 12.8
// ---------------------------------------------------------------------------

describe("DownloadAggregateButton — non-200 response", () => {
  test("error banner is rendered and no anchor click is dispatched when fetch returns 403", async () => {
    // Arrange: fetch returns 403
    const mockResponse = {
      status: 403,
      blob: vi.fn(),
      headers: { get: vi.fn().mockReturnValue(null) },
    };
    const fetchMock = vi.fn().mockResolvedValue(mockResponse);
    vi.stubGlobal("fetch", fetchMock);

    // Spy on document.createElement to ensure no anchor click
    const createElementSpy = vi.spyOn(document, "createElement");

    // Act
    render(<DownloadAggregateButton />);
    fireEvent.click(screen.getByRole("button", { name: /download aggregate report/i }));

    // Assert: error banner appears with status code
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toContain("403");
    });

    // Assert: no anchor element was created (no download triggered)
    const anchorCreations = createElementSpy.mock.calls.filter(
      (args) => args[0] === "a"
    );
    expect(anchorCreations).toHaveLength(0);
  });

  test("error banner is rendered for 500 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 500,
      blob: vi.fn(),
      headers: { get: vi.fn().mockReturnValue(null) },
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DownloadAggregateButton />);
    fireEvent.click(screen.getByRole("button", { name: /download aggregate report/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toContain("500");
    });
  });
});
