/**
 * Verifies scanner.service.ts uses the correct backend API paths.
 * Reads the source as text — no build tooling or package installs required.
 * Run: node src/services/__tests__/scanner.service.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, "../scanner.service.ts"), "utf-8");

describe("scannerService — source path correctness", () => {
  it("listAssets calls /api/utm-network-scans", () => {
    assert.ok(
      src.includes("/api/utm-network-scans?"),
      "Expected /api/utm-network-scans? in scanner.service.ts"
    );
  });

  it("uses search-by-filters endpoint for advanced filter queries", () => {
    assert.ok(
      src.includes("/api/utm-network-scans/search-by-filters"),
      "Expected /api/utm-network-scans/search-by-filters in scanner.service.ts"
    );
  });

  it("listGroups calls /api/utm-asset-groups/searchGroupsByFilter", () => {
    assert.ok(
      src.includes("/api/utm-asset-groups/searchGroupsByFilter"),
      "Expected /api/utm-asset-groups/searchGroupsByFilter in scanner.service.ts"
    );
  });

  it("createGroup calls POST /api/utm-asset-groups", () => {
    assert.ok(
      src.includes('"/api/utm-asset-groups"') || src.includes("'/api/utm-asset-groups'"),
      "Expected POST /api/utm-asset-groups in scanner.service.ts"
    );
  });

  it("assignAssetsToGroup calls PUT /api/utm-network-scans/updateGroup", () => {
    assert.ok(
      src.includes("/api/utm-network-scans/updateGroup"),
      "Expected /api/utm-network-scans/updateGroup in scanner.service.ts"
    );
  });

  it("countNewAssets calls /api/utm-network-scans/countNewAssets", () => {
    assert.ok(
      src.includes("/api/utm-network-scans/countNewAssets"),
      "Expected /api/utm-network-scans/countNewAssets in scanner.service.ts"
    );
  });

  it("does not contain any MOCK_ constants", () => {
    assert.ok(
      !src.includes("MOCK_"),
      "Found MOCK_ constant in scanner.service.ts — should be removed"
    );
  });
});
