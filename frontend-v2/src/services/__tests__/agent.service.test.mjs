/**
 * Verifies agent.service.ts uses the correct backend API paths.
 * Reads the source as text — no build tooling or package installs required.
 * Run: node src/services/__tests__/agent.service.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, "../agent.service.ts"), "utf-8");

// Strip the correct paths so we can check no old bare /api/agents remains
const scrubbed = src.replace(/\/api\/agent-manager\/agents/g, "__CORRECT__");

describe("agentService — API path correctness", () => {
  it("listAgents calls /api/agent-manager/agents", () => {
    assert.ok(
      src.includes("/api/agent-manager/agents"),
      "Expected /api/agent-manager/agents in agent.service.ts"
    );
  });

  it("listAgents does NOT use the old /api/agents path", () => {
    const hasOld =
      scrubbed.includes("'/api/agents") ||
      scrubbed.includes('"/api/agents') ||
      scrubbed.includes("`/api/agents");
    assert.ok(
      !hasOld,
      "Found old broken path /api/agents in agent.service.ts — fix was reverted"
    );
  });

  it("deleteAgent calls /api/agent-manager/agents/${id}", () => {
    assert.ok(
      src.includes("/api/agent-manager/agents/${id}"),
      "Expected deleteAgent to use /api/agent-manager/agents/${id}"
    );
  });

  it("deleteAgent does NOT use /api/agents/${id}", () => {
    const hasOld =
      scrubbed.includes("'/api/agents/${id}") ||
      scrubbed.includes('"/api/agents/${id}') ||
      scrubbed.includes("`/api/agents/${id}");
    assert.ok(
      !hasOld,
      "Found old broken path /api/agents/${id} in deleteAgent — fix was reverted"
    );
  });
});
