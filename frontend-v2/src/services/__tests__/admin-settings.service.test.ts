/**
 * Tests for adminService settings — verifies correct backend field names are used.
 * Run with: npx vitest run src/services/__tests__/admin-settings.service.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

const mockSections = [
  { id: 1, section: "EMAIL", description: "Email configuration" },
];

const mockParams = [
  {
    id: 10,
    sectionId: 1,
    confParamShort: "smtp_host",
    confParamValue: "smtp.example.com",
    confParamDatatype: "STRING",
    confParamDescription: "SMTP Server Host",
    confParamRequired: true,
    confParamLarge: null,
    confParamRegexp: null,
    confParamOption: null,
  },
];

describe("adminService — settings field name contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getConfigSections returns sections with correct backend field names", async () => {
    const { api } = await import("@/lib/api");
    vi.mocked(api.get)
      .mockResolvedValueOnce(mockSections)   // sections call
      .mockResolvedValueOnce(mockParams);    // params call for section 1

    const { adminService } = await import("../admin.service");
    const result = await adminService.getConfigSections();

    expect(result[0]).toHaveProperty("section", "EMAIL");
    expect(result[0]).toHaveProperty("description", "Email configuration");
    expect(result[0]).not.toHaveProperty("sectionName");
    expect(result[0]).not.toHaveProperty("sectionDescription");
  });

  it("getConfigSections embeds parameters fetched from /utm-configuration-parameters", async () => {
    const { api } = await import("@/lib/api");
    vi.mocked(api.get)
      .mockResolvedValueOnce(mockSections)
      .mockResolvedValueOnce(mockParams);

    const { adminService } = await import("../admin.service");
    const result = await adminService.getConfigSections();

    expect(result[0].parameters).toHaveLength(1);
    const param = result[0].parameters![0];

    expect(param).toHaveProperty("confParamShort", "smtp_host");
    expect(param).toHaveProperty("confParamValue", "smtp.example.com");
    expect(param).not.toHaveProperty("paramShort");
    expect(param).not.toHaveProperty("paramValue");
    expect(param).not.toHaveProperty("section");
  });

  it("parameters endpoint is called with sectionId filter", async () => {
    const { api } = await import("@/lib/api");
    vi.mocked(api.get)
      .mockResolvedValueOnce(mockSections)
      .mockResolvedValueOnce(mockParams);

    const { adminService } = await import("../admin.service");
    await adminService.getConfigSections();

    const calls = vi.mocked(api.get).mock.calls.map((c) => c[0] as string);
    expect(calls.some((url) => url.includes("sectionId.equals=1"))).toBe(true);
  });

  it("updateConfigParam sends an array with correct field names to backend", async () => {
    const { api } = await import("@/lib/api");
    vi.mocked(api.put).mockResolvedValue(undefined);

    const { adminService } = await import("../admin.service");
    await adminService.updateConfigParam({
      id: 10,
      sectionId: 1,
      confParamShort: "smtp_host",
      confParamValue: "newvalue",
      confParamDatatype: "STRING",
    });

    const [url, body] = vi.mocked(api.put).mock.calls[0] as [string, unknown[]];
    expect(url).toBe("/api/ha-configuration-parameters");
    expect(Array.isArray(body)).toBe(true);

    const sent = (body as Record<string, unknown>[])[0];
    expect(sent).toMatchObject({
      confParamShort: "smtp_host",
      confParamValue: "newvalue",
      sectionId: 1,
    });
    expect(sent).not.toHaveProperty("paramShort");
    expect(sent).not.toHaveProperty("paramValue");
    expect(sent).not.toHaveProperty("section");
  });
});
