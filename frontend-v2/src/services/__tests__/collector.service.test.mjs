/**
 * Verifies collector methods in agent.service.ts use the correct backend API path.
 * Reads the source as text — no build tooling required.
 * Run: node src/services/__tests__/collector.service.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, "../agent.service.ts"), "utf-8");

describe("agentService.listCollectors — API path correctness", () => {
  it("listCollectors calls /api/collectors (correct path)", () => {
    assert.ok(
      src.includes("/api/collectors"),
      "Expected /api/collectors in agent.service.ts"
    );
  });

  it("listCollectors does NOT use the old /api/utm-collectors path", () => {
    assert.ok(
      !src.includes("/api/utm-collectors"),
      "Found old broken path /api/utm-collectors in agent.service.ts — fix was reverted"
    );
  });

  it("listCollectors uses pageNumber and pageSize (not page/size)", () => {
    assert.ok(
      src.includes("pageNumber="),
      "Expected pageNumber= query param in listCollectors"
    );
    assert.ok(
      src.includes("pageSize="),
      "Expected pageSize= query param in listCollectors"
    );
  });

  it("response is parsed from .collectors field (not treated as flat array)", () => {
    assert.ok(
      src.includes("res?.collectors"),
      "Expected response to be read from res.collectors (ListCollectorsResponseDTO shape)"
    );
  });
});
