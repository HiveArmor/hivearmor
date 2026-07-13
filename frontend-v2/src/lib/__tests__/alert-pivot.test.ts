import { describe, it, expect } from "vitest";
import { buildAlertPivotUrl } from "../alert-pivot";

describe("buildAlertPivotUrl", () => {
  const base = {
    alertId: "42",
    alertName: "Brute Force",
    timestamp: "2026-07-08T12:00:00Z",
  };

  it("builds a URL with ±15 min time window by default", () => {
    const url = buildAlertPivotUrl(base);
    expect(url).toContain("from=2026-07-08T11%3A45%3A00.000Z");
    expect(url).toContain("to=2026-07-08T12%3A15%3A00.000Z");
  });

  it("includes hostname in KQL when provided", () => {
    const url = buildAlertPivotUrl({ ...base, hostname: "web-01" });
    expect(url).toContain("q=host.name%3A%22web-01%22");
  });

  it("falls back to sourceIp when hostname is absent", () => {
    const url = buildAlertPivotUrl({ ...base, sourceIp: "192.168.1.1" });
    expect(url).toContain("q=source.ip%3A%22192.168.1.1%22");
  });

  it("omits q param when no host or ip available", () => {
    const url = buildAlertPivotUrl(base);
    expect(url).not.toContain("q=");
  });

  it("includes pivotFrom for breadcrumb", () => {
    const url = buildAlertPivotUrl(base);
    expect(url).toContain("pivotFrom=alert%3A42");
  });

  it("respects custom windowMinutes", () => {
    const url = buildAlertPivotUrl({ ...base, windowMinutes: 60 });
    expect(url).toContain("from=2026-07-08T11%3A00%3A00.000Z");
    expect(url).toContain("to=2026-07-08T13%3A00%3A00.000Z");
  });
});
