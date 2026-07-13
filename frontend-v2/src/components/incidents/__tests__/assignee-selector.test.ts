/**
 * Tests for the AssigneeSelector behaviour via the userService and incidentService
 * contracts it depends on. Run with: npx vitest run src/components/incidents/__tests__/assignee-selector.test.ts
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

const mockUsers = [
  { id: 1, login: "john.doe",   firstName: "John", lastName: "Doe",   activated: true,  authorities: [] },
  { id: 2, login: "jane.smith", firstName: "Jane", lastName: "Smith", activated: true,  authorities: [] },
  { id: 3, login: "inactive",   firstName: "Old",  lastName: "User",  activated: false, authorities: [] },
];

describe("userService.listAnalysts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only activated users", async () => {
    const { api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValue(mockUsers);
    const { userService } = await import("@/services/user.service");

    const result = await userService.listAnalysts();

    expect(result).toHaveLength(2);
    expect(result.map((u) => u.login)).toEqual(["john.doe", "jane.smith"]);
  });

  it("returns empty array on error", async () => {
    const { api } = await import("@/lib/api");
    vi.mocked(api.get).mockRejectedValue(new Error("network error"));
    const { userService } = await import("@/services/user.service");

    const result = await userService.listAnalysts();

    expect(result).toEqual([]);
  });
});

describe("incidentService.assignIncident", () => {
  const baseIncident = {
    id: 99,
    incidentName: "Test",
    incidentStatus: "OPEN",
    incidentSeverity: 2,
  };

  beforeEach(() => vi.clearAllMocks());

  it("calls PUT /change-status with incidentAssignedTo set to login", async () => {
    const { api } = await import("@/lib/api");
    vi.mocked(api.put).mockResolvedValue({ ...baseIncident, incidentAssignedTo: "john.doe" });
    const { incidentService } = await import("@/services/incident.service");

    await incidentService.assignIncident(baseIncident, "john.doe");

    expect(api.put).toHaveBeenCalledWith(
      "/api/ha-incidents/change-status",
      expect.objectContaining({ id: 99, incidentAssignedTo: "john.doe" })
    );
  });

  it("calls PUT with incidentAssignedTo: null to unassign", async () => {
    const { api } = await import("@/lib/api");
    vi.mocked(api.put).mockResolvedValue({ ...baseIncident, incidentAssignedTo: null });
    const { incidentService } = await import("@/services/incident.service");

    await incidentService.assignIncident({ ...baseIncident, incidentAssignedTo: "john.doe" }, null);

    expect(api.put).toHaveBeenCalledWith(
      "/api/ha-incidents/change-status",
      expect.objectContaining({ id: 99, incidentAssignedTo: null })
    );
  });

  it("returns the updated incident from the server", async () => {
    const updated = { ...baseIncident, incidentAssignedTo: "jane.smith" };
    const { api } = await import("@/lib/api");
    vi.mocked(api.put).mockResolvedValue(updated);
    const { incidentService } = await import("@/services/incident.service");

    const result = await incidentService.assignIncident(baseIncident, "jane.smith");

    expect(result).toEqual(updated);
  });
});
