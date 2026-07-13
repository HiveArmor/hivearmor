import { describe, it, expect } from "vitest";

// ─── Types mirrored from page.tsx ────────────────────────────────────────────

interface ApplySubResult {
  ok: boolean;
  status?: number;
  error?: string;
}

interface ApplyResult {
  ok: boolean;
  cluster_settings?: ApplySubResult;
  index_settings?: ApplySubResult;
  error?: string;
}

interface AccelerationSetting {
  id: number;
  settingKey: string;
  settingValue: string;
  description?: string;
  updatedAt?: string;
  updatedBy?: string;
}

// ─── Logic extracted from page for unit-testability ──────────────────────────

function isDirty(settings: AccelerationSetting[], edits: Record<string, string>): boolean {
  return settings.some((s) => edits[s.settingKey] !== s.settingValue);
}

function buildEditsFromSettings(settings: AccelerationSetting[]): Record<string, string> {
  const map: Record<string, string> = {};
  settings.forEach((s) => { map[s.settingKey] = s.settingValue; });
  return map;
}

function applyResultIsAllOk(result: ApplyResult): boolean {
  return result.ok === true;
}

function applyResultHasPartialFailure(result: ApplyResult): boolean {
  return (
    !result.ok &&
    (result.cluster_settings !== undefined || result.index_settings !== undefined)
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const SAMPLE_SETTINGS: AccelerationSetting[] = [
  { id: 1, settingKey: "max_result_window",           settingValue: "10000",    description: "Max documents per search" },
  { id: 2, settingKey: "refresh_interval",            settingValue: "5s",       description: "Index refresh interval"  },
  { id: 3, settingKey: "translog_durability",         settingValue: "request",  description: "Translog durability"     },
  { id: 4, settingKey: "fielddata_cache_size",        settingValue: "20%",      description: "Fielddata cache size"    },
  { id: 5, settingKey: "indices_query_cache_size",    settingValue: "10%",      description: "Query cache size"        },
  { id: 6, settingKey: "indices_requests_cache_size", settingValue: "2%",       description: "Requests cache size"     },
];

describe("buildEditsFromSettings", () => {
  it("produces a map keyed by settingKey", () => {
    const edits = buildEditsFromSettings(SAMPLE_SETTINGS);
    expect(edits["max_result_window"]).toBe("10000");
    expect(edits["refresh_interval"]).toBe("5s");
    expect(Object.keys(edits)).toHaveLength(SAMPLE_SETTINGS.length);
  });

  it("returns an empty object for an empty settings list", () => {
    expect(buildEditsFromSettings([])).toEqual({});
  });
});

describe("isDirty", () => {
  it("returns false when edits match saved values exactly", () => {
    const edits = buildEditsFromSettings(SAMPLE_SETTINGS);
    expect(isDirty(SAMPLE_SETTINGS, edits)).toBe(false);
  });

  it("returns true when any single value is changed", () => {
    const edits = buildEditsFromSettings(SAMPLE_SETTINGS);
    edits["refresh_interval"] = "30s";
    expect(isDirty(SAMPLE_SETTINGS, edits)).toBe(true);
  });

  it("returns false for an empty settings list regardless of edits", () => {
    expect(isDirty([], { refresh_interval: "30s" })).toBe(false);
  });

  it("returns true when a value is changed to empty string", () => {
    const edits = buildEditsFromSettings(SAMPLE_SETTINGS);
    edits["max_result_window"] = "";
    expect(isDirty(SAMPLE_SETTINGS, edits)).toBe(true);
  });
});

describe("ApplyResult — shape from UtmSearchAccelerationService.applyToOpenSearch()", () => {
  it("applyResultIsAllOk returns true when ok=true", () => {
    const result: ApplyResult = {
      ok: true,
      cluster_settings: { ok: true, status: 200 },
      index_settings: { ok: true, status: 200 },
    };
    expect(applyResultIsAllOk(result)).toBe(true);
  });

  it("applyResultIsAllOk returns false when ok=false", () => {
    const result: ApplyResult = {
      ok: false,
      cluster_settings: { ok: false, error: "connection refused" },
      index_settings: { ok: true, status: 200 },
    };
    expect(applyResultIsAllOk(result)).toBe(false);
  });

  it("applyResultHasPartialFailure detects cluster failure with index success", () => {
    const result: ApplyResult = {
      ok: false,
      cluster_settings: { ok: false, error: "timeout" },
      index_settings: { ok: true, status: 200 },
    };
    expect(applyResultHasPartialFailure(result)).toBe(true);
  });

  it("applyResultHasPartialFailure returns false for total config error (no sub-results)", () => {
    const result: ApplyResult = {
      ok: false,
      error: "ELASTICSEARCH_HOST / ELASTICSEARCH_PORT not configured",
    };
    expect(applyResultHasPartialFailure(result)).toBe(false);
  });

  it("applyResultHasPartialFailure returns false when overall ok=true", () => {
    const result: ApplyResult = {
      ok: true,
      cluster_settings: { ok: true },
      index_settings: { ok: true },
    };
    expect(applyResultHasPartialFailure(result)).toBe(false);
  });
});

describe("bulk save payload shape — PUT /api/search-acceleration", () => {
  it("edits map contains only changed keys when user updates one field", () => {
    const edits = buildEditsFromSettings(SAMPLE_SETTINGS);
    edits["refresh_interval"] = "60s";

    const changedEntries = Object.entries(edits).filter(
      ([key, val]) => SAMPLE_SETTINGS.find((s) => s.settingKey === key)?.settingValue !== val,
    );
    expect(changedEntries).toHaveLength(1);
    expect(changedEntries[0]).toEqual(["refresh_interval", "60s"]);
  });

  it("full edits map is sent even when only one value changed (bulk PUT semantics)", () => {
    const edits = buildEditsFromSettings(SAMPLE_SETTINGS);
    edits["max_result_window"] = "50000";
    expect(Object.keys(edits)).toHaveLength(SAMPLE_SETTINGS.length);
  });
});
