/**
 * Verifies incidentService.updateStatus uses the correct method, path, and body.
 * Reads the source as text — no build tooling or package installs required.
 * Run: node src/services/__tests__/incident-status.service.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, "../incident.service.ts"), "utf-8");

describe("incidentService.updateStatus — API contract (source inspection)", () => {
  it("calls PUT not POST", () => {
    // updateStatus must use api.put, not api.post
    const updateStatusBlock = src.slice(src.indexOf("async updateStatus"));
    assert.ok(
      updateStatusBlock.includes("api.put("),
      "updateStatus must use api.put() — found api.post() or nothing"
    );
    const postBeforePut = updateStatusBlock.indexOf("api.post(");
    const putPos = updateStatusBlock.indexOf("api.put(");
    assert.ok(
      postBeforePut === -1 || putPos < postBeforePut,
      "updateStatus must not use api.post()"
    );
  });

  it("calls /change-status not /status", () => {
    assert.ok(
      src.includes("/api/utm-incidents/change-status"),
      "Expected /api/utm-incidents/change-status in incident.service.ts"
    );
    // Must not have the old broken path
    const hasBrokenPath =
      src.includes('"/api/utm-incidents/status"') ||
      src.includes("'/api/utm-incidents/status'") ||
      src.includes("`/api/utm-incidents/status`");
    assert.ok(
      !hasBrokenPath,
      "Found old broken path /api/utm-incidents/status — fix was reverted"
    );
  });

  it("sends incidentStatus field (not bare 'status') in body", () => {
    const updateStatusBlock = src.slice(src.indexOf("async updateStatus"));
    assert.ok(
      updateStatusBlock.includes("incidentStatus:"),
      "updateStatus body must include incidentStatus field matching backend UtmIncident entity"
    );
  });

  it("spreads the incident object (sends full entity for backend @NotNull fields)", () => {
    const updateStatusBlock = src.slice(src.indexOf("async updateStatus"));
    assert.ok(
      updateStatusBlock.includes("...incident"),
      "updateStatus must spread the incident object so backend @NotNull fields are present"
    );
  });

  it("IncidentStatus enum uses IN_REVIEW matching backend IncidentStatusEnum", () => {
    assert.ok(
      src.includes('IN_REVIEW = "IN_REVIEW"'),
      "IncidentStatus enum must have IN_REVIEW = \"IN_REVIEW\" to match backend IncidentStatusEnum"
    );
    assert.ok(
      !src.includes('IN_PROGRESS = "IN_PROGRESS"'),
      "IncidentStatus enum must NOT have IN_PROGRESS — backend uses IN_REVIEW"
    );
  });
});
