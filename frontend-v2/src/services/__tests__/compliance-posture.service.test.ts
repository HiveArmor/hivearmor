/**
 * Tests for compliance.service.ts — verifies correct backend API paths
 * and that no demo/hardcoded data is returned.
 * Run: npx vitest run src/services/__tests__/compliance-posture.service.test.ts
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

const mockStandards = [
  { id: 1, standardName: "PCI DSS 4.0", standardDescription: "Payment card security" },
  { id: 2, standardName: "HIPAA Security Rule", standardDescription: "Health info protection" },
];

const mockSections = [
  { id: 10, standardSectionName: "Network Controls", standardSectionDescription: "", standard: mockStandards[0] },
  { id: 11, standardSectionName: "Access Control",   standardSectionDescription: "", standard: mockStandards[0] },
];

const mockControls = [
  {
    id: 100,
    standardSectionId: 10,
    section: mockSections[0],
    controlName: "Firewall rules",
    controlStrategy: "ALL" as const,
    lastEvaluationStatus: "PASS",
    lastEvaluationTimestamp: "2026-07-08T10:00:00Z",
  },
  {
    id: 101,
    standardSectionId: 10,
    section: mockSections[0],
    controlName: "IDS configuration",
    controlStrategy: "ALL" as const,
    lastEvaluationStatus: "FAIL",
    lastEvaluationTimestamp: "2026-07-08T09:00:00Z",
  },
];

describe("complianceService", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("getStandards", () => {
    it("calls GET /api/compliance/standard", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue(mockStandards);

      const { complianceService } = await import("../compliance.service");
      const result = await complianceService.getStandards();

      const url = vi.mocked(api.get).mock.calls[0][0] as string;
      expect(url).toContain("/api/compliance/standard");
      expect(result).toEqual(mockStandards);
    });

    it("result does not contain demo framework names", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue(mockStandards);

      const { complianceService } = await import("../compliance.service");
      const result = await complianceService.getStandards();

      for (const std of result) {
        expect(std.standardName).not.toMatch(/demo/i);
      }
    });
  });

  describe("getSections", () => {
    it("calls GET /api/compliance/standard-section with standardId filter", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue(mockSections);

      const { complianceService } = await import("../compliance.service");
      await complianceService.getSections(1);

      const url = vi.mocked(api.get).mock.calls[0][0] as string;
      expect(url).toContain("/api/compliance/standard-section");
      expect(url).toContain("standardId.equals=1");
    });
  });

  describe("getControlsWithLatestEval", () => {
    it("calls GET /api/compliance/control-config/get-by-section", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue(mockControls);

      const { complianceService } = await import("../compliance.service");
      const result = await complianceService.getControlsWithLatestEval(10, 0, 200);

      const url = vi.mocked(api.get).mock.calls[0][0] as string;
      expect(url).toContain("/api/compliance/control-config/get-by-section");
      expect(url).toContain("sectionId=10");
      expect(result).toEqual(mockControls);
    });

    it("returns PASS/FAIL statuses from backend (not demo scores)", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue(mockControls);

      const { complianceService } = await import("../compliance.service");
      const result = await complianceService.getControlsWithLatestEval(10, 0, 200);

      expect(result[0].lastEvaluationStatus).toBe("PASS");
      expect(result[1].lastEvaluationStatus).toBe("FAIL");
    });

    it("handles empty response gracefully", async () => {
      const { api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValue([]);

      const { complianceService } = await import("../compliance.service");
      const result = await complianceService.getControlsWithLatestEval(99, 0, 50);

      expect(result).toEqual([]);
    });
  });

  describe("normalizeStatus", () => {
    it("normalises PASS variants", async () => {
      const { normalizeStatus } = await import("../compliance.service");
      expect(normalizeStatus("PASS")).toBe("PASS");
      expect(normalizeStatus("PASSED")).toBe("PASS");
      expect(normalizeStatus("pass")).toBe("PASS");
    });

    it("normalises backend COMPLIANT to PASS", async () => {
      const { normalizeStatus } = await import("../compliance.service");
      expect(normalizeStatus("COMPLIANT")).toBe("PASS");
      expect(normalizeStatus("compliant")).toBe("PASS");
    });

    it("normalises FAIL variants", async () => {
      const { normalizeStatus } = await import("../compliance.service");
      expect(normalizeStatus("FAIL")).toBe("FAIL");
      expect(normalizeStatus("FAILED")).toBe("FAIL");
    });

    it("normalises backend NON_COMPLIANT to FAIL", async () => {
      const { normalizeStatus } = await import("../compliance.service");
      expect(normalizeStatus("NON_COMPLIANT")).toBe("FAIL");
      expect(normalizeStatus("non_compliant")).toBe("FAIL");
    });

    it("returns NOT_EVALUATED for null/undefined/unknown", async () => {
      const { normalizeStatus } = await import("../compliance.service");
      expect(normalizeStatus(null)).toBe("NOT_EVALUATED");
      expect(normalizeStatus(undefined)).toBe("NOT_EVALUATED");
      expect(normalizeStatus("UNKNOWN_STATUS")).toBe("NOT_EVALUATED");
    });
  });
});
