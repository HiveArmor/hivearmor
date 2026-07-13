/**
 * Tests for threat-intel.service.ts — verifies correct backend API paths and methods.
 * Run: npx vitest run src/services/__tests__/threat-intel.service.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    getToken: vi.fn().mockReturnValue(null),
  },
}));

describe("threatIntelService — API path correctness", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("lookupIoc", () => {
    it("calls GET /api/v1/threat-intel/ioc with encoded value param", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue({ value: "1.2.3.4", type: "ip", threatScore: 80 });
      const { threatIntelService } = await import("../threat-intel.service");

      await threatIntelService.lookupIoc("1.2.3.4");

      expect(api.get).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/v1\/threat-intel\/ioc\?value=1\.2\.3\.4/)
      );
    });

    it("returns null when api.get throws (404 scenario)", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockRejectedValue(new Error("Not Found"));
      const { threatIntelService } = await import("../threat-intel.service");

      const result = await threatIntelService.lookupIoc("unknown-ioc");

      expect(result).toBeNull();
    });

    it("returns IOC data on success", async () => {
      const { api } = await import("@/lib/api");
      const mockIoc = {
        value: "185.220.101.45",
        type: "ip",
        threatScore: 94,
        classification: "Malware C2",
        tags: ["tor", "c2"],
        sourceFeds: [],
        mitreTechniques: [],
        relatedIocs: [],
        alertCount: 5,
      };
      vi.mocked(api.get).mockResolvedValue(mockIoc);
      const { threatIntelService } = await import("../threat-intel.service");

      const result = await threatIntelService.lookupIoc("185.220.101.45");

      expect(result).not.toBeNull();
      expect(result?.threatScore).toBe(94);
    });
  });

  describe("getFeeds", () => {
    it("calls GET /api/v1/threat-intel/feeds", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue([]);
      const { threatIntelService } = await import("../threat-intel.service");

      await threatIntelService.getFeeds();

      expect(api.get).toHaveBeenCalledWith("/api/v1/threat-intel/feeds");
    });

    it("returns array of feeds", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue([
        { id: "vt", name: "VirusTotal", status: "active", enabled: true },
      ]);
      const { threatIntelService } = await import("../threat-intel.service");

      const feeds = await threatIntelService.getFeeds();

      expect(feeds).toHaveLength(1);
      expect(feeds[0].name).toBe("VirusTotal");
    });
  });

  describe("toggleFeed", () => {
    it("calls PUT /api/v1/threat-intel/feeds/{id}", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.put).mockResolvedValue({ id: "vt", enabled: false });
      const { threatIntelService } = await import("../threat-intel.service");

      await threatIntelService.toggleFeed("vt", false);

      expect(api.put).toHaveBeenCalledWith(
        "/api/v1/threat-intel/feeds/vt",
        { enabled: false }
      );
    });

    it("does NOT call /api/threat-intel/feeds (missing v1)", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.put).mockResolvedValue({});
      const { threatIntelService } = await import("../threat-intel.service");

      await threatIntelService.toggleFeed("otx", true);

      const callArg = vi.mocked(api.put).mock.calls[0][0] as string;
      expect(callArg).toMatch(/\/api\/v1\//);
    });
  });

  describe("syncFeed", () => {
    it("calls POST /api/v1/threat-intel/feeds/{id}/sync", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.post).mockResolvedValue({ id: "otx", status: "active" });
      const { threatIntelService } = await import("../threat-intel.service");

      await threatIntelService.syncFeed("otx");

      expect(api.post).toHaveBeenCalledWith(
        "/api/v1/threat-intel/feeds/otx/sync",
        {}
      );
    });
  });
});
