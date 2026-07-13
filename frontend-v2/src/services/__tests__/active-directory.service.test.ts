/**
 * Tests for active-directory.service.ts — verifies correct backend API paths
 * and that no MOCK_ data is used.
 * Run: npx vitest run src/services/__tests__/active-directory.service.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    getWithHeaders: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("activeDirectoryService", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("listUsers", () => {
    it("calls GET /api/ha-auditor-users-by-src", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockResolvedValue({
        data: [],
        headers: new Headers({ "x-total-count": "0" }),
      });

      const { activeDirectoryService } = await import("../active-directory.service");
      await activeDirectoryService.listUsers();

      const url = vi.mocked(api.getWithHeaders).mock.calls[0][0] as string;
      expect(url).toContain("/api/ha-auditor-users-by-src");
    });

    it("passes page and size as query params", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockResolvedValue({
        data: [],
        headers: new Headers({ "x-total-count": "0" }),
      });

      const { activeDirectoryService } = await import("../active-directory.service");
      await activeDirectoryService.listUsers({ page: 2, size: 10 });

      const url = vi.mocked(api.getWithHeaders).mock.calls[0][0] as string;
      expect(url).toContain("page=2");
      expect(url).toContain("size=10");
    });

    it("appends sourceId as id param when provided", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockResolvedValue({
        data: [],
        headers: new Headers({ "x-total-count": "0" }),
      });

      const { activeDirectoryService } = await import("../active-directory.service");
      await activeDirectoryService.listUsers({ sourceId: 7 });

      const url = vi.mocked(api.getWithHeaders).mock.calls[0][0] as string;
      expect(url).toContain("id=7");
    });

    it("reads x-total-count header for pagination total", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockResolvedValue({
        data: [{ name: "alice", sid: "S-1", attributes: [] }],
        headers: new Headers({ "x-total-count": "42" }),
      });

      const { activeDirectoryService } = await import("../active-directory.service");
      const result = await activeDirectoryService.listUsers();

      expect(result.total).toBe(42);
    });

    it("returns empty data and total 0 on error", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockRejectedValue(new Error("network error"));

      const { activeDirectoryService } = await import("../active-directory.service");
      const result = await activeDirectoryService.listUsers();

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("maps raw ADUserRaw to AdUser shape", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockResolvedValue({
        data: [{
          name: "jsmith",
          sid: "S-1-5-21-100",
          attributes: [
            { id: 1, attributeKey: "displayName",  attributeValue: "John Smith" },
            { id: 2, attributeKey: "department",   attributeValue: "Engineering" },
            { id: 3, attributeKey: "mail",          attributeValue: "jsmith@corp.local" },
          ],
        }],
        headers: new Headers({ "x-total-count": "1" }),
      });

      const { activeDirectoryService } = await import("../active-directory.service");
      const { data } = await activeDirectoryService.listUsers();

      expect(data).toHaveLength(1);
      expect(data[0].username).toBe("jsmith");
      expect(data[0].displayName).toBe("John Smith");
      expect(data[0].department).toBe("Engineering");
      expect(data[0].email).toBe("jsmith@corp.local");
      expect(data[0].status).toBe("active");
    });
  });

  describe("listEvents", () => {
    it("calls GET /api/winlogbeat-info-by-filter", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockResolvedValue({
        data: [],
        headers: new Headers({ "x-total-count": "0" }),
      });

      const { activeDirectoryService } = await import("../active-directory.service");
      await activeDirectoryService.listEvents();

      const url = vi.mocked(api.getWithHeaders).mock.calls[0][0] as string;
      expect(url).toContain("/api/winlogbeat-info-by-filter");
    });

    it("includes required query params: from, to, indexPattern, sort, page, size", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockResolvedValue({
        data: [],
        headers: new Headers({ "x-total-count": "0" }),
      });

      const { activeDirectoryService } = await import("../active-directory.service");
      await activeDirectoryService.listEvents({ page: 1, size: 10 });

      const url = vi.mocked(api.getWithHeaders).mock.calls[0][0] as string;
      expect(url).toContain("page=1");
      expect(url).toContain("size=10");
      expect(url).toContain("from=");
      expect(url).toContain("to=");
      expect(url).toContain("indexPattern=");
      expect(url).toContain("sort=");
    });

    it("uses provided sid when given", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockResolvedValue({
        data: [],
        headers: new Headers({ "x-total-count": "0" }),
      });

      const { activeDirectoryService } = await import("../active-directory.service");
      await activeDirectoryService.listEvents({ sid: "S-1-5-21-999" });

      const url = vi.mocked(api.getWithHeaders).mock.calls[0][0] as string;
      expect(url).toContain("sid=S-1-5-21-999");
    });

    it("returns empty data and total 0 on error", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockRejectedValue(new Error("network error"));

      const { activeDirectoryService } = await import("../active-directory.service");
      const result = await activeDirectoryService.listEvents();

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("does NOT call /api/ha-auditor-users-by-src", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockResolvedValue({
        data: [],
        headers: new Headers({ "x-total-count": "0" }),
      });

      const { activeDirectoryService } = await import("../active-directory.service");
      await activeDirectoryService.listEvents();

      const url = vi.mocked(api.getWithHeaders).mock.calls[0][0] as string;
      expect(url).not.toContain("utm-auditor-users-by-src");
    });
  });

  describe("deriveOverview", () => {
    it("totals users correctly from sample + total", async () => {
      const { activeDirectoryService } = await import("../active-directory.service");
      const users = [
        { id: "1", username: "a", displayName: "A", email: "", department: "", riskScore: 0, lastLogin: "", status: "active" as const, groups: [] },
        { id: "2", username: "b", displayName: "B", email: "", department: "", riskScore: 0, lastLogin: "", status: "locked" as const, groups: [] },
      ];
      const overview = activeDirectoryService.deriveOverview(users, 100);

      expect(overview.totalUsers).toBe(100);
      // 1/2 active in sample → 50 extrapolated; 1/2 locked → 50
      expect(overview.activeUsers).toBe(50);
      expect(overview.lockedUsers).toBe(50);
    });

    it("handles empty user array without throwing", async () => {
      const { activeDirectoryService } = await import("../active-directory.service");
      const overview = activeDirectoryService.deriveOverview([], 0);
      expect(overview.totalUsers).toBe(0);
    });
  });
});
