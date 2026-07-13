/**
 * Tests for the incident detail page.
 * Run with: npx vitest run src/app/\(app\)/incidents/\[id\]/__tests__/page.test.tsx
 * Requires vitest + @testing-library/react installed.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import IncidentDetailPage from "../page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "42" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/services/incident.service", () => ({
  incidentService: {
    getById: vi.fn(),
  },
}));

const mockBackendIncident = {
  id: 42,
  incidentName: "SSH Brute Force Detected",
  incidentStatus: "OPEN",
  incidentSeverity: 3,
  incidentCreatedDate: "2026-07-08T10:00:00Z",
  incidentAssignedTo: "analyst1",
  alertCount: 5,
};

describe("IncidentDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and displays real incident data", async () => {
    const { incidentService } = await import("@/services/incident.service");
    vi.mocked(incidentService.getById).mockResolvedValue(mockBackendIncident);

    render(<IncidentDetailPage params={{ id: "42" }} />);

    expect(screen.getByTestId("incident-skeleton")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("SSH Brute Force Detected")).toBeInTheDocument();
    });

    expect(incidentService.getById).toHaveBeenCalledWith(42);
  });

  it("never shows DEMO_INCIDENT data", async () => {
    const { incidentService } = await import("@/services/incident.service");
    vi.mocked(incidentService.getById).mockResolvedValue(mockBackendIncident);

    render(<IncidentDetailPage params={{ id: "42" }} />);

    await waitFor(() => {
      expect(screen.getByText("SSH Brute Force Detected")).toBeInTheDocument();
    });

    expect(screen.queryByText(/Brute Force → Privilege Escalation → Lateral Movement/)).not.toBeInTheDocument();
    expect(screen.queryByText(/INC-2025-00821/)).not.toBeInTheDocument();
    expect(screen.queryByText(/j\.smith/)).not.toBeInTheDocument();
  });

  it("shows error state when incident not found (404)", async () => {
    const { incidentService } = await import("@/services/incident.service");
    vi.mocked(incidentService.getById).mockRejectedValue({ response: { status: 404 } });

    render(<IncidentDetailPage params={{ id: "42" }} />);

    await waitFor(() => {
      expect(screen.getByText(/incident not found/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /back to incidents/i })).toBeInTheDocument();
  });

  it("shows generic error when API fails", async () => {
    const { incidentService } = await import("@/services/incident.service");
    vi.mocked(incidentService.getById).mockRejectedValue(new Error("Network error"));

    render(<IncidentDetailPage params={{ id: "42" }} />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /back to incidents/i })).toBeInTheDocument();
  });
});
