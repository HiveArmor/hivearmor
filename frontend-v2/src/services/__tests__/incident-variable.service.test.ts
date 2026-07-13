/**
 * Tests for incident-variable.service.ts — verifies correct API paths and methods.
 * Run with: npx vitest run src/services/__tests__/incident-variable.service.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {
    getWithHeaders: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockVar = {
  id: 1,
  variableName: "API_KEY",
  variableValue: "secret123",
  variableDescription: "API key for external service",
  secret: true,
};

describe("incidentVariableService", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("list", () => {
    it("calls GET /api/ha-incident-variables", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockResolvedValue({ data: [mockVar], headers: new Headers() });

      const { incidentVariableService } = await import("../incident-variable.service");
      await incidentVariableService.list();

      expect(api.getWithHeaders).toHaveBeenCalledWith(
        expect.stringContaining("/api/ha-incident-variables")
      );
    });

    it("unwraps Spring Page .content when response has that shape", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockResolvedValue({
        data: { content: [mockVar], totalElements: 1 },
        headers: new Headers(),
      });

      const { incidentVariableService } = await import("../incident-variable.service");
      const result = await incidentVariableService.list();

      expect(result).toHaveLength(1);
      expect(result[0].variableName).toBe("API_KEY");
    });

    it("returns array directly when response is a plain array", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.getWithHeaders).mockResolvedValue({ data: [mockVar], headers: new Headers() });

      const { incidentVariableService } = await import("../incident-variable.service");
      const result = await incidentVariableService.list();

      expect(result).toHaveLength(1);
    });
  });

  describe("create", () => {
    it("calls POST /api/ha-incident-variables", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.post).mockResolvedValue(mockVar);

      const { incidentVariableService } = await import("../incident-variable.service");
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, ...newVar } = mockVar;
      await incidentVariableService.create(newVar);

      expect(api.post).toHaveBeenCalledWith("/api/ha-incident-variables", newVar);
    });
  });

  describe("update", () => {
    it("calls PUT /api/ha-incident-variables with id in body (no path param)", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.put).mockResolvedValue(mockVar);

      const { incidentVariableService } = await import("../incident-variable.service");
      await incidentVariableService.update(mockVar);

      expect(api.put).toHaveBeenCalledWith("/api/ha-incident-variables", mockVar);
    });

    it("does NOT append id to the URL", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.put).mockResolvedValue(mockVar);

      const { incidentVariableService } = await import("../incident-variable.service");
      await incidentVariableService.update(mockVar);

      const url = vi.mocked(api.put).mock.calls[0][0] as string;
      expect(url).not.toMatch(/\/ha-incident-variables\/\d+/);
    });
  });

  describe("delete", () => {
    it("calls DELETE /api/ha-incident-variables/{id}", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.delete).mockResolvedValue(undefined);

      const { incidentVariableService } = await import("../incident-variable.service");
      await incidentVariableService.delete(1);

      expect(api.delete).toHaveBeenCalledWith("/api/ha-incident-variables/1");
    });

    it("uses the correct id in the path", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.delete).mockResolvedValue(undefined);

      const { incidentVariableService } = await import("../incident-variable.service");
      await incidentVariableService.delete(42);

      expect(api.delete).toHaveBeenCalledWith("/api/ha-incident-variables/42");
    });
  });
});
