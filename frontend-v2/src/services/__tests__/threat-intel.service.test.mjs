/**
 * Static analysis tests for threat-intel.service.ts — verifies correct API paths.
 * Reads the source as text — no build tooling or package installs required.
 * Run: node src/services/__tests__/threat-intel.service.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, "../threat-intel.service.ts"), "utf-8");

describe("threatIntelService — API path correctness (static)", () => {
  it("lookupIoc calls /api/v1/threat-intel/ioc", () => {
    assert.ok(
      src.includes("/api/v1/threat-intel/ioc"),
      "Expected /api/v1/threat-intel/ioc in threat-intel.service.ts"
    );
  });

  it("getFeeds calls /api/v1/threat-intel/feeds", () => {
    assert.ok(
      src.includes("/api/v1/threat-intel/feeds"),
      "Expected /api/v1/threat-intel/feeds in threat-intel.service.ts"
    );
  });

  it("toggleFeed calls PUT /api/v1/threat-intel/feeds/${id}", () => {
    assert.ok(
      src.includes("/api/v1/threat-intel/feeds/${id}"),
      "Expected toggleFeed to use /api/v1/threat-intel/feeds/\\${id}"
    );
  });

  it("syncFeed calls POST /api/v1/threat-intel/feeds/${id}/sync", () => {
    assert.ok(
      src.includes("/api/v1/threat-intel/feeds/${id}/sync"),
      "Expected syncFeed to use /api/v1/threat-intel/feeds/\\${id}/sync"
    );
  });

  it("does NOT contain DEMO_ static data", () => {
    assert.ok(
      !src.includes("DEMO_"),
      "Found DEMO_ static data in threat-intel.service.ts — should be removed"
    );
  });
});
