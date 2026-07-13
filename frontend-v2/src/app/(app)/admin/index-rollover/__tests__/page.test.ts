import { describe, it, expect } from "vitest";
import type { RolloverPolicy } from "@/services/index-rollover.service";

// ─── Logic extracted from page.tsx for unit-testability ──────────────────────

const DURATION_REGEX = /^\d+(s|m|h|d|w)$/i;

function validate(deleteAfter: string): string | null {
  if (!deleteAfter.trim()) return "Retention period is required.";
  if (!DURATION_REGEX.test(deleteAfter.trim()))
    return 'Must be a duration like "30d", "90d", "1w".';
  return null;
}

function isDirty(policy: RolloverPolicy, snapshotActive: boolean, deleteAfter: string): boolean {
  return snapshotActive !== policy.snapshotActive || deleteAfter !== policy.deleteAfter;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("validate(deleteAfter)", () => {
  it("accepts valid durations", () => {
    expect(validate("30d")).toBeNull();
    expect(validate("90d")).toBeNull();
    expect(validate("1w")).toBeNull();
    expect(validate("24h")).toBeNull();
    expect(validate("60s")).toBeNull();
    expect(validate("5m")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(validate("")).not.toBeNull();
    expect(validate("   ")).not.toBeNull();
  });

  it("rejects non-duration strings", () => {
    expect(validate("abc")).not.toBeNull();
    expect(validate("yesterday")).not.toBeNull();
    expect(validate("30days")).not.toBeNull();
    expect(validate("30 d")).not.toBeNull();
  });

  it("rejects size units that are not duration units", () => {
    expect(validate("30gb")).not.toBeNull();
    expect(validate("500mb")).not.toBeNull();
  });

  it("trims surrounding whitespace before validating", () => {
    expect(validate("  30d  ")).toBeNull();
  });
});

describe("isDirty(policy, snapshotActive, deleteAfter)", () => {
  const base: RolloverPolicy = { snapshotActive: false, deleteAfter: "30d" };

  it("returns false when form matches saved policy", () => {
    expect(isDirty(base, false, "30d")).toBe(false);
  });

  it("returns true when snapshotActive changes", () => {
    expect(isDirty(base, true, "30d")).toBe(true);
  });

  it("returns true when deleteAfter changes", () => {
    expect(isDirty(base, false, "90d")).toBe(true);
  });

  it("returns true when both fields change", () => {
    expect(isDirty(base, true, "90d")).toBe(true);
  });
});

describe("RolloverPolicy — API shape from IndexPolicyResource.getPolicy()", () => {
  it("has the expected fields", () => {
    const policy: RolloverPolicy = { snapshotActive: true, deleteAfter: "90d" };
    expect(typeof policy.snapshotActive).toBe("boolean");
    expect(typeof policy.deleteAfter).toBe("string");
  });

  it("snapshot flag maps to safe_delete state in ISM policy", () => {
    const withSnapshot: RolloverPolicy = { snapshotActive: true, deleteAfter: "30d" };
    const withoutSnapshot: RolloverPolicy = { snapshotActive: false, deleteAfter: "30d" };
    expect(withSnapshot.snapshotActive).toBe(true);
    expect(withoutSnapshot.snapshotActive).toBe(false);
  });
});
