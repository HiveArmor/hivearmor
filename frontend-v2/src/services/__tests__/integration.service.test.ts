/**
 * Tests for integration.service.ts — verifies correct backend API paths are called.
 * Run with: npx vitest run src/services/__tests__/integration.service.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("integrationService", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("listIntegrations", () => {
    it("calls GET /api/ha-integrations", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue([]);

      const { integrationService } = await import("../integration.service");
      await integrationService.listIntegrations();

      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining("/api/ha-integrations")
      );
    });

    it("passes page and size query params", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue([]);

      const { integrationService } = await import("../integration.service");
      await integrationService.listIntegrations(2, 25);

      const url = vi.mocked(api.get).mock.calls[0][0] as string;
      expect(url).toContain("page=2");
      expect(url).toContain("size=25");
    });

    it("returns empty array when API returns null/undefined", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue(null as never);

      const { integrationService } = await import("../integration.service");
      const result = await integrationService.listIntegrations();

      expect(result).toEqual([]);
    });
  });

  describe("getIntegration", () => {
    it("calls GET /api/ha-integrations/:id", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue({ id: 7, integrationName: "Splunk" });

      const { integrationService } = await import("../integration.service");
      await integrationService.getIntegration(7);

      expect(api.get).toHaveBeenCalledWith("/api/ha-integrations/7");
    });
  });

  describe("createIntegration", () => {
    it("calls POST /api/ha-integrations", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.post).mockResolvedValue({ id: 1, integrationName: "Elastic SIEM" });

      const { integrationService } = await import("../integration.service");
      await integrationService.createIntegration({ integrationName: "Elastic SIEM" });

      expect(api.post).toHaveBeenCalledWith(
        "/api/ha-integrations",
        expect.objectContaining({ integrationName: "Elastic SIEM" })
      );
    });
  });

  describe("updateIntegration", () => {
    it("calls PUT /api/ha-integrations (no id in path)", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.put).mockResolvedValue({ id: 3, integrationName: "Splunk" });

      const { integrationService } = await import("../integration.service");
      await integrationService.updateIntegration({ id: 3, integrationName: "Splunk" });

      expect(api.put).toHaveBeenCalledWith(
        "/api/ha-integrations",
        expect.objectContaining({ id: 3 })
      );
    });

    it("does NOT append id to the URL", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.put).mockResolvedValue({ id: 3 });

      const { integrationService } = await import("../integration.service");
      await integrationService.updateIntegration({ id: 3 });

      const url = vi.mocked(api.put).mock.calls[0][0] as string;
      expect(url).not.toMatch(/\/utm-integrations\/\d+/);
    });
  });

  describe("listServerModules", () => {
    it("calls GET /api/ha-server-modules", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue([]);

      const { integrationService } = await import("../integration.service");
      await integrationService.listServerModules();

      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining("/api/ha-server-modules")
      );
    });

    it("does NOT call the integrations endpoint", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue([]);

      const { integrationService } = await import("../integration.service");
      await integrationService.listServerModules();

      const url = vi.mocked(api.get).mock.calls[0][0] as string;
      expect(url).not.toContain("/utm-integrations");
    });

    it("returns empty array when API returns null/undefined", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue(null as never);

      const { integrationService } = await import("../integration.service");
      const result = await integrationService.listServerModules();

      expect(result).toEqual([]);
    });
  });

  describe("getModulesWithIntegrations", () => {
    it("calls /api/ha-server-modules/modules-with-integrations", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue([]);

      const { integrationService } = await import("../integration.service");
      await integrationService.getModulesWithIntegrations();

      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining("/utm-server-modules/modules-with-integrations")
      );
    });

    it("appends serverId query param when provided", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue([]);

      const { integrationService } = await import("../integration.service");
      await integrationService.getModulesWithIntegrations(42);

      const url = vi.mocked(api.get).mock.calls[0][0] as string;
      expect(url).toContain("serverId=42");
    });

    it("omits serverId param when not provided", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue([]);

      const { integrationService } = await import("../integration.service");
      await integrationService.getModulesWithIntegrations();

      const url = vi.mocked(api.get).mock.calls[0][0] as string;
      expect(url).not.toContain("serverId");
    });
  });

  describe("updateServerModule", () => {
    it("calls PUT /api/ha-server-modules (no id in path)", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.put).mockResolvedValue({ id: 5, moduleName: "SYSLOG" });

      const { integrationService } = await import("../integration.service");
      await integrationService.updateServerModule({ id: 5, moduleName: "SYSLOG" });

      expect(api.put).toHaveBeenCalledWith(
        "/api/ha-server-modules",
        expect.objectContaining({ id: 5, moduleName: "SYSLOG" })
      );
    });

    it("does NOT append id to the URL", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.put).mockResolvedValue({ id: 5 });

      const { integrationService } = await import("../integration.service");
      await integrationService.updateServerModule({ id: 5, moduleName: "SYSLOG" });

      const url = vi.mocked(api.put).mock.calls[0][0] as string;
      expect(url).not.toMatch(/\/utm-server-modules\/\d+/);
    });
  });
});
