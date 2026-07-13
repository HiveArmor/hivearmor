/**
 * Tests for incidentService.updateStatus — verifies correct method, path, and body.
 * Run with vitest: npx vitest run src/services/__tests__/incident-status.service.test.ts
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

const baseIncident = {
  id: 42,
  incidentName: "Test Incident",
  incidentDescription: "desc",
  incidentStatus: "OPEN",
  incidentSeverity: 2,
};

describe("incidentService.updateStatus — API contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls PUT not POST", async () => {
    const { api } = await import("@/lib/api");
    vi.mocked(api.put).mockResolvedValue({});
    const { incidentService } = await import("../incident.service");

    await incidentService.updateStatus(baseIncident, "CLOSED");

    expect(api.put).toHaveBeenCalledTimes(1);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("calls /change-status not /status", async () => {
    const { api } = await import("@/lib/api");
    vi.mocked(api.put).mockResolvedValue({});
    const { incidentService } = await import("../incident.service");

    await incidentService.updateStatus(baseIncident, "IN_REVIEW");

    expect(api.put).toHaveBeenCalledWith(
      "/api/ha-incidents/change-status",
      expect.any(Object)
    );
    expect(api.put).not.toHaveBeenCalledWith(
      "/api/ha-incidents/status",
      expect.any(Object)
    );
  });

  it("sends incidentStatus with new value and full incident fields", async () => {
    const { api } = await import("@/lib/api");
    vi.mocked(api.put).mockResolvedValue({});
    const { incidentService } = await import("../incident.service");

    await incidentService.updateStatus(baseIncident, "IN_REVIEW");

    expect(api.put).toHaveBeenCalledWith(
      "/api/ha-incidents/change-status",
      expect.objectContaining({
        id: 42,
        incidentName: "Test Incident",
        incidentDescription: "desc",
        incidentStatus: "IN_REVIEW",
      })
    );
  });

  it("IncidentStatus enum has IN_REVIEW not IN_PROGRESS", async () => {
    const { IncidentStatus } = await import("../incident.service");
    expect(IncidentStatus.IN_REVIEW).toBe("IN_REVIEW");
    expect((IncidentStatus as Record<string, unknown>)["IN_PROGRESS"]).toBeUndefined();
  });
});
