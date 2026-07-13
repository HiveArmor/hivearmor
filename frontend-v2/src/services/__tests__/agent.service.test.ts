/**
 * Tests for agent.service.ts — verifies correct backend API paths are called.
 * Uses Node 24 built-in test runner (node:test) with --experimental-strip-types.
 * Run: node --experimental-strip-types --experimental-vm-modules \
 *        src/services/__tests__/agent.service.test.ts
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

// ── Minimal stub for @/lib/api ────────────────────────────────────────────────
// The real `api` wraps `fetch` with auth headers. We replace fetch globally so
// we can inspect every URL the service constructs without an HTTP server.

interface FetchCall {
  url: string;
  method: string;
}

const calls: FetchCall[] = [];
let stubResponseBody: unknown = [];
let stubStatus = 200;

function mockFetch(url: string, options?: RequestInit): Promise<Response> {
  calls.push({ url: String(url), method: options?.method ?? "GET" });
  const body = JSON.stringify(stubResponseBody);
  return Promise.resolve(
    new Response(body, {
      status: stubStatus,
      headers: { "Content-Type": "application/json" },
    })
  );
}

// Patch global fetch before any module is imported.
// Node 24 exposes `globalThis.fetch` natively.
(globalThis as unknown as Record<string, unknown>).fetch = mockFetch;

// ── Now import the module under test (after patching fetch) ───────────────────
// Dynamic import is used so the mock is in place before the module initialises.
const { agentService } = await import("../agent.service.js");

// ── Helpers ───────────────────────────────────────────────────────────────────
function lastCall(): FetchCall {
  assert.ok(calls.length > 0, "No fetch calls recorded");
  return calls[calls.length - 1];
}

function reset() {
  calls.length = 0;
  stubResponseBody = [];
  stubStatus = 200;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("agentService — API path correctness", () => {
  afterEach(reset);

  describe("listAgents", () => {
    it("calls /api/agent-manager/agents (correct path)", async () => {
      stubResponseBody = [];
      await agentService.listAgents();
      assert.match(lastCall().url, /\/api\/agent-manager\/agents/);
    });

    it("does NOT call the old /api/agents path", async () => {
      stubResponseBody = [];
      await agentService.listAgents();
      const url = lastCall().url;
      // Must not be bare /api/agents without the agent-manager prefix
      assert.ok(
        !/\/api\/agents(?![\w-])/.test(url),
        `Expected URL to NOT match /api/agents (without prefix), got: ${url}`
      );
    });

    it("passes page and size as query params", async () => {
      stubResponseBody = [];
      await agentService.listAgents(2, 25);
      const url = lastCall().url;
      assert.ok(url.includes("page=2"), `Expected page=2 in URL, got: ${url}`);
      assert.ok(url.includes("size=25"), `Expected size=25 in URL, got: ${url}`);
    });

    it("returns empty content on HTTP error", async () => {
      stubStatus = 500;
      stubResponseBody = { message: "server error" };
      const result = await agentService.listAgents();
      assert.deepEqual(result, { content: [], totalElements: 0 });
    });
  });

  describe("deleteAgent", () => {
    it("calls /api/agent-manager/agents/{id} with DELETE", async () => {
      await agentService.deleteAgent(42);
      const call = lastCall();
      assert.match(call.url, /\/api\/agent-manager\/agents\/42/);
      assert.equal(call.method, "DELETE");
    });

    it("does NOT call /api/agents/{id} (old broken path)", async () => {
      await agentService.deleteAgent(99);
      const url = lastCall().url;
      assert.ok(
        !/\/api\/agents\/\d+/.test(url.replace("/agent-manager", "")),
        `Expected URL to use agent-manager prefix, got: ${url}`
      );
    });
  });
});
