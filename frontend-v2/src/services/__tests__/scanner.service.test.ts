/**
 * Tests for scanner.service.ts — verifies correct backend API paths are called.
 * Run with: npx vitest run src/services/__tests__/scanner.service.test.ts
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

describe("scannerService", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("listAssets", () => {
    it("calls GET /api/ha-network-scans", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockResolvedValue({
        data: [],
        headers: new Headers({ "X-Total-Count": "0" }),
      });

      const { scannerService } = await import("../scanner.service");
      await scannerService.listAssets();

      const url = vi.mocked(api.getWithHeaders).mock.calls[0][0] as string;
      expect(url).toContain("/api/ha-network-scans");
    });

    it("includes page, size, and sort params", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockResolvedValue({
        data: [],
        headers: new Headers({ "X-Total-Count": "0" }),
      });

      const { scannerService } = await import("../scanner.service");
      await scannerService.listAssets({ page: 2, size: 25 });

      const url = vi.mocked(api.getWithHeaders).mock.calls[0][0] as string;
      expect(url).toContain("page=2");
      expect(url).toContain("size=25");
      expect(url).toContain("sort=");
    });

    it("adds assetName.contains when assetIpMacName is set", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockResolvedValue({
        data: [],
        headers: new Headers({ "X-Total-Count": "0" }),
      });

      const { scannerService } = await import("../scanner.service");
      await scannerService.listAssets({ assetIpMacName: "192.168" });

      const url = vi.mocked(api.getWithHeaders).mock.calls[0][0] as string;
      expect(url).toContain("assetName.contains=192.168");
    });

    it("adds assetAlive.equals when alive filter is set", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockResolvedValue({
        data: [],
        headers: new Headers({ "X-Total-Count": "0" }),
      });

      const { scannerService } = await import("../scanner.service");
      await scannerService.listAssets({ alive: true });

      const url = vi.mocked(api.getWithHeaders).mock.calls[0][0] as string;
      expect(url).toContain("assetAlive.equals=true");
    });

    it("reads X-Total-Count from response headers", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockResolvedValue({
        data: [{ id: 1, assetIp: "10.0.0.1" }],
        headers: new Headers({ "X-Total-Count": "99" }),
      });

      const { scannerService } = await import("../scanner.service");
      const result = await scannerService.listAssets();

      expect(result.total).toBe(99);
      expect(result.assets).toHaveLength(1);
    });

    it("returns empty result when API throws", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockRejectedValue(new Error("network error"));

      const { scannerService } = await import("../scanner.service");
      const result = await scannerService.listAssets();

      expect(result).toEqual({ assets: [], total: 0 });
    });
  });

  describe("listGroups", () => {
    it("calls GET /api/ha-asset-groups/searchGroupsByFilter", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockResolvedValue({
        data: [],
        headers: new Headers(),
      });

      const { scannerService } = await import("../scanner.service");
      await scannerService.listGroups();

      const url = vi.mocked(api.getWithHeaders).mock.calls[0][0] as string;
      expect(url).toContain("/api/ha-asset-groups/searchGroupsByFilter");
    });

    it("passes page and size params", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockResolvedValue({
        data: [],
        headers: new Headers(),
      });

      const { scannerService } = await import("../scanner.service");
      await scannerService.listGroups(1, 20);

      const url = vi.mocked(api.getWithHeaders).mock.calls[0][0] as string;
      expect(url).toContain("page=1");
      expect(url).toContain("size=20");
    });

    it("returns empty array when API throws", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockRejectedValue(new Error("network error"));

      const { scannerService } = await import("../scanner.service");
      const result = await scannerService.listGroups();

      expect(result).toEqual([]);
    });
  });

  describe("createGroup", () => {
    it("calls POST /api/ha-asset-groups", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.post).mockResolvedValue({ id: 1, groupName: "Test" });

      const { scannerService } = await import("../scanner.service");
      await scannerService.createGroup("Test");

      expect(api.post).toHaveBeenCalledWith(
        "/api/ha-asset-groups",
        expect.objectContaining({ groupName: "Test" })
      );
    });

    it("sends groupDescription in body when provided", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.post).mockResolvedValue({ id: 2, groupName: "Servers" });

      const { scannerService } = await import("../scanner.service");
      await scannerService.createGroup("Servers", "Production hosts");

      expect(api.post).toHaveBeenCalledWith(
        "/api/ha-asset-groups",
        expect.objectContaining({ groupName: "Servers", groupDescription: "Production hosts" })
      );
    });
  });

  describe("deleteGroup", () => {
    it("calls DELETE /api/ha-asset-groups/{id}", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.delete).mockResolvedValue(undefined);

      const { scannerService } = await import("../scanner.service");
      await scannerService.deleteGroup(42);

      expect(api.delete).toHaveBeenCalledWith("/api/ha-asset-groups/42");
    });
  });

  describe("assignAssetsToGroup", () => {
    it("calls PUT /api/ha-network-scans/updateGroup", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.put).mockResolvedValue(undefined);

      const { scannerService } = await import("../scanner.service");
      await scannerService.assignAssetsToGroup([1, 2, 3], 5);

      expect(api.put).toHaveBeenCalledWith(
        "/api/ha-network-scans/updateGroup",
        expect.objectContaining({ assetsIds: [1, 2, 3], assetGroupId: 5 })
      );
    });
  });

  describe("countNewAssets", () => {
    it("calls GET /api/ha-network-scans/countNewAssets", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue(3);

      const { scannerService } = await import("../scanner.service");
      await scannerService.countNewAssets();

      expect(api.get).toHaveBeenCalledWith("/api/ha-network-scans/countNewAssets");
    });

    it("returns 0 when API throws", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockRejectedValue(new Error("network error"));

      const { scannerService } = await import("../scanner.service");
      const result = await scannerService.countNewAssets();

      expect(result).toBe(0);
    });
  });
});
