/**
 * Tests for the collector methods in agent.service.ts — verifies correct backend path.
 * Uses Node 24 built-in test runner with --experimental-strip-types.
 * Run: node --experimental-strip-types \
 *        src/services/__tests__/collector.service.test.ts
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

interface FetchCall {
  url: string;
  method: string;
}

const calls: FetchCall[] = [];
let stubResponseBody: unknown = { collectors: [], total: 0 };
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

(globalThis as unknown as Record<string, unknown>).fetch = mockFetch;

const { agentService } = await import("../agent.service.js");

function lastCall(): FetchCall {
  assert.ok(calls.length > 0, "No fetch calls recorded");
  return calls[calls.length - 1];
}

function reset() {
  calls.length = 0;
  stubResponseBody = { collectors: [], total: 0 };
  stubStatus = 200;
}

describe("agentService.listCollectors — API path correctness", () => {
  afterEach(reset);

  it("calls /api/collectors (correct path, not /api/ha-collectors)", async () => {
    await agentService.listCollectors();
    assert.match(lastCall().url, /\/api\/collectors(?!\w)/);
  });

  it("does NOT call the old /api/ha-collectors path", async () => {
    await agentService.listCollectors();
    assert.ok(
      !lastCall().url.includes("/api/ha-collectors"),
      `Expected URL to NOT contain /api/ha-collectors, got: ${lastCall().url}`
    );
  });

  it("passes pageNumber and pageSize (not page/size)", async () => {
    await agentService.listCollectors(2, 25);
    const url = lastCall().url;
    assert.ok(url.includes("pageNumber=2"), `Expected pageNumber=2 in URL, got: ${url}`);
    assert.ok(url.includes("pageSize=25"), `Expected pageSize=25 in URL, got: ${url}`);
  });

  it("returns collectors from the nested .collectors field", async () => {
    stubResponseBody = {
      collectors: [{ id: 1, hostname: "collector-01", status: "ONLINE" }],
      total: 1,
    };
    const result = await agentService.listCollectors();
    assert.equal(result.content.length, 1);
    assert.equal(result.totalElements, 1);
  });

  it("returns empty content on HTTP error", async () => {
    stubStatus = 500;
    stubResponseBody = { message: "server error" };
    const result = await agentService.listCollectors();
    assert.deepEqual(result, { content: [], totalElements: 0 });
  });
});
