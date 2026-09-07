# Agent Platform — External Work Tracker

**Purpose:** Living list of work that cannot be finished inside `agent/` alone.  
Agent-side Now tickets (AGT-POL-01, AGT-SEC-01, AGT-SIZE-01, AGT-DOC-01) may land STAGING CANDIDATE quality in `agent/`; this file tracks backend, frontend-v3, agent-manager, deploy, and ops-staging follow-ups.

**Status:** STAGING CANDIDATE companion to `.plan/audits/AGENT_PLATFORM_AUDIT.md` — not a production-readiness claim.  
**Canonical copies (keep in sync):** `agent/release/EXTERNAL_WORK.md` ↔ `.plan/audits/AGENT_PLATFORM_EXTERNAL_WORK.md`

---

## Now phase — consolidated status (reconciled 2026-09-07)

| Track | Ticket(s) | Status |
|---|---|---|
| 1. Agent FIM exclude + ACK headers | AGT-POL-01 (agent), BE-POL-02 headers | **DONE (STAGING CANDIDATE)** — `isExcluded` on seed/handleEvent; client sends `X-HiveArmor-Agent-Id` + `X-Agent-Key` |
| 2. Frontend Agent FIM Policies | FE-POL-01, FE-SEC-01 | **DONE (STAGING CANDIDATE)** — `/posture/sensors/fim-policies` |
| 3. Backend schema v1 + device ACK | BE-POL-01, BE-POL-02 | **DONE (STAGING CANDIDATE)** — schema v1(+telemetry v1.1); GET policy + report-state + rule `/ack` device auth |

**Contract spot-check (2026-09-07):** Agent `policy_schema.go` ↔ backend `AgentPolicySchemaV1` ↔ FE `agentPolicySchema.ts` field names **aligned** for v1 core. Additive **v1.1** `telemetry.{sca,sbom}_interval_hours` on backend/agent/FE (wire still `schema_version: 1`). ACK headers **match** `TelemetryAgentIdentityFilter`. FE Next wires group picker, per-agent push, telemetry editor, push-on-connect honesty.

**Next residual:** Apply/ack LIVE VERIFIED staging; AM stream-open auto-push optional (sync-on-connect covers agent-callable path). Do not flip isolate gate.

---

## Remaining open / Next blockers (priority)

| ID | Status | Blocker |
|---|---|---|
| **BE-POL-02** | **DONE (STAGING CANDIDATE)** | Rule `/ack` + filter allowlist landed 2026-09-07 |
| **FE-POL-01** residual | **DONE (STAGING CANDIDATE)** FE Next 2026-09-07 | Group picker (Admin\|SOC Manager) + 403 fallback; per-agent push UI; telemetry interval editor; push-on-connect honesty. Apply/ack still not LIVE VERIFIED. |
| **BE-POL-03** | **DONE (STAGING CANDIDATE)** | Per-agent push + sync-on-connect (2026-09-07) |
| **BE-POL-04** | **DONE (STAGING CANDIDATE)** | Schema v1.1 telemetry intervals (2026-09-07) |
| **AM-POL-01** | Open (optional) | Agent-manager stream-open auto APPLY_POLICY — not required if agent calls `POST /api/agent-policies/sync-on-connect` after AgentStream up |
| **BE-SEC-01** | **DONE (STAGING CANDIDATE)** docs + opt-in reject 2026-09-07 | IR prefers `EDR_*`; warn on unstructured shell; optional `HIVEARMOR_REJECT_UNSTRUCTURED_SHELL`; agent deny-by-default remains SoT. OPS-SEC-01 tenant check still open. |
| **BE-EDR-01** / **FE-EDR-01** / **OPS-EDR-01** | Open | Isolate live-verify; **do not** flip `REMOTE_SENSOR_ISOLATE_LIVE_VERIFIED` |
| **OPS-SEC-01** | Open | Confirm tenants do not rely on default remote shell |
| **DEP-SIZE-01** | **DONE (STAGING CANDIDATE)** 2026-09-07 | `publish-agent-packages.sh` + `agent/scripts/build-slim.sh` / `make build-slim`; CI deployment-pipeline still needs `-tags` (note in INSTALL) |
| **AGT-OBS-01** | **DONE (STAGING CANDIDATE)** 2026-09-07 | Agent PUT vitals: queueDepth, drops, appliedPolicyId/Version; BE persists new columns |
| **AM-DOC-01** | **DONE (STAGING CANDIDATE)** stub 2026-09-07 | Strengthened `agent/protos/README.md` + `agent/scripts/check-proto-subset.sh` (name-level); full AST CI deferred |
| **DEP-SIZE-02** / **AM-HA-01** | Deferred | Larger sdk split; multi-replica AgentStream |
| **FE registry FIM editor** | Deferred | Schema supports `fim.registry`; FE console editor later |

---

## Legend

| Tag | Meaning |
|---|---|
| **Blocked on** | Agent feature X cannot be fully proven / productized until this lands |
| **Needed for** | Unblocks or completes agent feature X |
| **Deferred** | Intentionally out of agent-only session scope |

---

## Backend

### BE-POL-01 — Emit agent policy schema v1 in `policyConfig`

| Field | Value |
|---|---|
| **Status** | **DONE (STAGING CANDIDATE)** — 2026-09-03 |
| **Problem** | Agent now applies a versioned JSON document (`schema_version: 1`) for FIM rules, collector toggles, and `response.allow_shell`. Legacy `HaAgentPolicy` stores `filePaths` / `registryPaths` columns separately; `/api/agent-policies/{id}` may return opaque or empty `policyConfig`. |
| **Touchpoints** | `AgentPolicySchemaService` / `AgentPolicySchemaV1`, `UtmAgentPolicyService`, `AgentPolicyResource`, Ha `fromHaColumns` bridge helper |
| **Acceptance** | `policyConfig` is valid agent schema v1 JSON on create/update/get. Empty/missing → defaults document. Push still uses `APPLY_POLICY`. Ha EDR plane remains dual (no APPLY_POLICY). |
| **Needed for** | AGT-POL-01 end-to-end |

**Agent schema v1 (contract — agent is source of truth for parse):**

```json
{
  "schema_version": 1,
  "fim": {
    "mode": "merge",
    "rules": [
      { "path": "/etc", "recursive": true, "exclude": ["*.tmp"] }
    ]
  },
  "collectors": {
    "fim": true,
    "dns": true,
    "netconn": true,
    "usb": true,
    "netflow": true,
    "syslog": true,
    "file": true
  },
  "response": {
    "allow_shell": false
  },
  "telemetry": {
    "sca_interval_hours": 6,
    "sbom_interval_hours": 6
  }
}
```

- `fim.mode`: `merge` (default) appends to platform defaults; `replace` uses only policy rules (falls back to defaults if rules empty).
- `fim.rules[].exclude`: glob patterns (relative to rule path **or** basename). Agent enforces via `isExcluded` on watch seed + `handleEvent` drop (STAGING CANDIDATE).
- `fim.registry` (**schema feature 1.2**, wire still `schema_version: 1`): optional Windows HKLM keys `{ "mode": "merge"|"replace", "keys": ["SOFTWARE\\..."] }`. FE editor deferred.
- `collectors.*`: desired enablement. Hot-apply today: FIM rules (new roots + excludes; best-effort unwatch of removed roots; recursive subdir cleanup may need restart) + shell gate. Other collectors recorded for next process start (see agent docs).
- `telemetry` (**schema feature 1.1**, wire still `schema_version: 1`): optional. When present, intervals clamped to 1–168 hours; missing fields default to 6. When omitted, agent keeps local hardcoded cadence until it reads the field.
- Unknown fields ignored (forward-compatible).
- **Dual-plane:** `/api/agent-policies` is SoT for APPLY_POLICY. `/api/ha-edr/policies` does not push; `AgentPolicySchemaService.fromHaColumns` maps Ha `filePaths` → `fim.rules` and optional `registryPaths` → `fim.registry.keys` when bridging.

### BE-POL-02 — Agent-auth for policy report-state + rule-sync ACK

| Field | Value |
|---|---|
| **Status** | **DONE (STAGING CANDIDATE)** — 2026-09-07 |
| **Problem** | Agent ACK client sends telemetry-style device headers (`X-HiveArmor-Agent-Id` + `X-Agent-Key`). |
| **Done** | `TelemetryAgentIdentityFilter` covers GET `/api/agent-policies/{id}`, POST `/report-state`, POST `/sync-on-connect`, POST `/api/alert-response-rules/push-status/{ruleId}/ack`; grants `ROLE_AGENT_DEVICE`; binds connector id (query/body spoof ignored). Admin\|SOC Manager JWT still allowed. |
| **Acceptance** | Enrolled agent can GET policy + POST report-state + POST rule ACK with id+key → 2xx; no Bearer agent-key required. |
| **Needed for** | AGT-POL-01 LIVE VERIFIED apply/ack evidence |

**Agent client contract (source of truth in `agent/agent/policy_sync.go`):**

| Header | Value |
|---|---|
| `X-HiveArmor-Agent-Id` | Decimal `config.AgentID` (same as telemetry) |
| `X-Agent-Key` | Decrypted `config.AgentKey` |
| `Content-Type` | `application/json` |

TLS: honors `config.insecure` (`SkipCertValidation`) like telemetry. Do **not** require `Authorization: Bearer <agentKey>`.

**Rule ACK path:** `POST /api/alert-response-rules/push-status/{ruleId}/ack?agentId={id}` — device auth binds agentId from header; query spoof ignored. Marks latest push log `ACKNOWLEDGED`.

### BE-POL-03 — Per-agent push + sync-on-connect

| Field | Value |
|---|---|
| **Status** | **DONE (STAGING CANDIDATE)** — 2026-09-07 |
| **Endpoints** | `POST /api/agent-policies/{id}/push-agent/{agentId}` (Admin\|SOC Manager) — APPLY_POLICY via ProcessCommand + push log (same as group push). `POST /api/agent-policies/sync-on-connect` (device\|Admin\|SOC Manager) — resolve agent→groups→active policies; return configs; queue APPLY_POLICY on drift. |
| **AM note** | Optional `AM-POL-01`: agent-manager could push on AgentStream open. **Not required** if agent calls sync-on-connect after stream is up. Prefer agent-callable path for multi-replica AM until AM-HA-01. |
| **Needed for** | FE-POL-01 residual + push-on-connect product model |

**sync-on-connect response sketch:**

```json
{
  "agentId": "42",
  "policies": [
    {
      "policyId": 1,
      "policyName": "default-edr",
      "versionNum": 3,
      "policyConfig": "{...schema v1 JSON...}",
      "pushed": true,
      "alreadyCurrent": false
    }
  ]
}
```

### BE-POL-04 — Schema v1.1 telemetry schedule

| Field | Value |
|---|---|
| **Status** | **DONE (STAGING CANDIDATE)** — 2026-09-07 |
| **Contract** | Optional `telemetry.sca_interval_hours` / `telemetry.sbom_interval_hours` (1–168). Wire `schema_version` stays `1`. Feature constant `AgentPolicySchemaV1.SCHEMA_FEATURE = "1.1"`. |
| **Agent** | **DONE (STAGING CANDIDATE)** — SCA/SBOM cadence follows policy intervals when present (`7903c1d`). |
| **FE** | **DONE (STAGING CANDIDATE)** — interval editors on Agent FIM Policies (`8b3a53f`). |

### BE-SEC-01 — Policy field + IR command path for shell governance

| Field | Value |
|---|---|
| **Status** | **DONE (STAGING CANDIDATE)** — schema + FE toggle 2026-09-03; IR path docs + opt-in reject 2026-09-07 |
| **Problem** | Agent denies unstructured remote shell unless local config, env, or applied policy enables it. Operators need a control-plane way to set `response.allow_shell`; IR may still send raw shell expecting success. |
| **Done** | BE-POL-01 emits `response.allow_shell`; FE-SEC-01 toggle; agent deny-by-default. |
| **IR path (2026-09-07)** | Prefer structured `EDR_*` / `APPLY_POLICY*` / `SYNC_RULES*` via `IncidentResponseCommandService`. Unstructured shell (non-empty `shell` field or command without structured prefix) logs WARN. Staging opt-in hard reject: env `HIVEARMOR_REJECT_UNSTRUCTURED_SHELL=true` (no per-agent policy lookup yet — agent gate remains authoritative). |
| **Remaining** | OPS-SEC-01 tenant check; optional future: resolve agent group policy `allow_shell` before reject (replaces env flag). |
| **Acceptance** | Policy editor can set `response.allow_shell` ✅; documentation that shell is deny-by-default ✅; IR prefers EDR_* ✅ |
| **Needed for** | AGT-SEC-01 productization |

### BE-EDR-01 — Isolate live-verify evidence (do not flip UI yet)

| Field | Value |
|---|---|
| **Status** | Open — do **not** flip UI gate |
| **Problem** | Isolate/lift implemented on Linux/Windows agent; UI remain fail-closed. |
| **Why agent can't finish alone** | Needs staging ProcessCommand proof + frontend gate flip. |
| **Touchpoints** | Staging runbook; `POST /api/edr/isolation`; agent-manager `ProcessCommand` |
| **Acceptance** | Documented isolate+lift round-trip on staging Windows + Linux |
| **Blocked on / Needed for** | AGT-EDR-01 (EXTERNAL — do **not** flip `REMOTE_SENSOR_ISOLATE_LIVE_VERIFIED` in this agent session) |

---

## Frontend

### FE-SEC-01 — Sensors / policy UI toggle for remote shell

| Field | Value |
|---|---|
| **Status** | **DONE (STAGING CANDIDATE)** — 2026-09-03 |
| **Problem** | Operators need an explicit, audited toggle for `response.allow_shell` (human copy, not ROLE_ constants). |
| **Touchpoints** | `frontend-v3` `AgentFimPolicyPage` (`/posture/sensors/fim-policies`); role gate ADMIN \| SOC_MANAGER |
| **Acceptance** | Toggle maps to schema v1 `response.allow_shell`; default off in UI ✅ |
| **Needed for** | AGT-SEC-01 |
| **Residual** | Still blocked on BE-SEC-01 IR docs + OPS-SEC-01 + staging LIVE VERIFIED for productization |

### FE-EDR-01 — Flip isolate live-verified gate after staging proof

| Field | Value |
|---|---|
| **Status** | Open — do **not** flip |
| **Problem** | Isolate UI blocked by `REMOTE_SENSOR_ISOLATE_LIVE_VERIFIED` (or equivalent). |
| **Why agent can't finish alone** | Explicit: agent session must not flip this. |
| **Touchpoints** | `frontend-v3/src/services/sensorRemoteActions.capabilities.ts` |
| **Acceptance** | Gate true only after BE-EDR-01 checklist |
| **Needed for** | AGT-EDR-01 |

### FE-POL-01 — Author FIM paths / collector toggles in schema v1

| Field | Value |
|---|---|
| **Status** | **DONE (STAGING CANDIDATE)** — console 2026-09-03; **Next FE residuals DONE** 2026-09-07 |
| **Problem** | UI should edit FIM watch paths and collector enablement as schema v1, not only legacy Ha columns. |
| **Touchpoints** | `agentPoliciesApi.service.ts`; `AgentFimPolicyPage` at `/posture/sensors/fim-policies` |
| **Acceptance** | Saved policy round-trips schema v1; console edits FIM include/exclude, merge/replace, collectors, push/assign-group ✅ (agent APPLY + LIVE VERIFIED still STAGING) |
| **Needed for** | AGT-POL-01 |
| **Next FE (2026-09-07)** | (1) SOC Manager group picker via `GET /api/agent-groups` (403 → manual id). (2) Per-agent push UI → `POST …/push-agent/{agentId}` + sensor picker. (3) Schema v1.1 `telemetry.sca_interval_hours` / `sbom_interval_hours` editor. (4) Push-on-connect / enroll honesty note. |
| **Still open** | Apply/ack LIVE VERIFIED evidence; Ha `/edr/policies` dual-plane remains. |

---

## Agent-manager

### AM-DOC-01 — Proto canonical ownership

| Field | Value |
|---|---|
| **Status** | **DONE (STAGING CANDIDATE)** — README + name-level check 2026-09-07 |
| **Problem** | Agent checked-in `agent/protos/agent.proto` is a **subset**; enrollment RPCs live in agent-manager proto. |
| **Done** | Strengthened `agent/protos/README.md` (SoT table + sync rule); `bash agent/scripts/check-proto-subset.sh` verifies required symbol names in manager SoT. |
| **Residual** | Full protobuf AST / field-number wire-compat CI deferred. |
| **Needed for** | AGT-DOC-01 |

### AM-POL-01 — Push-on-connect at AgentStream open (optional)

| Field | Value |
|---|---|
| **Status** | Open — **optional** |
| **Problem** | Ideal UX: on AgentStream open, AM/backend resolves group→policy and pushes APPLY_POLICY. |
| **Backend alternative (landed)** | Agent calls `POST /api/agent-policies/sync-on-connect` after stream up (device auth). Prefer this until multi-replica AM fan-out exists. |
| **Acceptance** | Either AM stream-open push **or** agent sync-on-connect LIVE VERIFIED |

### AM-HA-01 — Multi-replica AgentStream (deferred)

| Field | Value |
|---|---|
| **Problem** | In-memory `AgentStreamMap` — multi-replica fan-out missing. |
| **Deferred** | Later roadmap AGT-HA-01 |

---

## Deploy

### DEP-SIZE-01 — Agent build tags for slim + optional netflow

| Field | Value |
|---|---|
| **Status** | **DONE (STAGING CANDIDATE)** — publish/build helpers 2026-09-07 |
| **Problem** | Size cull uses `-tags agent_slim` and `-tags nonetflow`. Default `go build .` still ships kitchen-sink size. |
| **Done** | `agent/scripts/build-slim.sh` + `make -C agent build-slim`; `deploy/staging/publish-agent-packages.sh` documents tags + optional `BUILD_SLIM=1`; `agent/release/INSTALL.md` flavor table (log/edr/netflow). |
| **Residual** | `.github/workflows/deployment-pipeline.yml` still builds without tags — update in CI follow-up; re-measure release notes when CI flips. |
| **Recommended flags** | Endpoint log/EDR: `-tags agent_slim,nonetflow`. Network sensor needing netflow: `-tags agent_slim` only. Event-processor / plugins: **do not** set `agent_slim`. |
| **Acceptance** | Staging publish path can build/publish slim ✅; CI default still open ⏳ |
| **Needed for** | AGT-SIZE-01 / AGT-SIZE-02 |

### DEP-SIZE-02 — Larger sdk package split (shared)

| Field | Value |
|---|---|
| **Problem** | Even with `agent_slim`, full decoupling wants `sdk/plugins` transport-only vs CEL/OS client packages without build tags. |
| **Touchpoints** | `sdk/plugins/{cel,rules}.go` → subpackages; event-processor import updates |
| **Acceptance** | Agent imports transport package only; no build-tag matrix required |
| **Deferred** | Larger than agent-only session |

---

## Ops-staging

### OPS-EDR-01 — Isolate / lift live proof checklist

| Field | Value |
|---|---|
| **Status** | Open |
| **Problem** | Need evidence before FE-EDR-01. |
| **Acceptance** | Windows Server + Ubuntu isolate+lift; persistence notes; attach to AGT-EDR-01 |
| **Needed for** | AGT-EDR-01 |

### OPS-SEC-01 — Confirm no tenant depends on default remote shell

| Field | Value |
|---|---|
| **Status** | Open |
| **Problem** | Deny-by-default may break ad-hoc IR scripts. |
| **Acceptance** | Staging/prod usage check; migration note for `HIVEARMOR_ALLOW_REMOTE_SHELL` / policy / `allow_remote_shell` in config |
| **Needed for** | AGT-SEC-01 rollout |

### OPS-SIZE-01 — Binary size before/after (measurement log)

Measured on 2026-09-03 (darwin host, `GOOS=linux GOARCH=amd64`, `CGO_ENABLED=0 -trimpath`, ldflags `REPLACE_KEY` size-audit dummy, **no** `-s -w` so comparable to prior audit artifacts).

| Build | Notes | Size |
|---|---|---|
| Baseline (pre-session) | `agent/build/size-audit/hivearmor_agent_linux_amd64` | 55 737 275 B (~53.2 MiB) |
| After logger swap only (default tags) | still links CEL/OpenSearch/netflow/gin via sdk | ~55.7 MiB (parity) |
| After cull | `-tags agent_slim,nonetflow` → `after_slim_nostrip` | **30 586 916 B (~29.2 MiB)** |
| Delta | slim+nonetflow vs baseline | **−25.1 MiB (~45%)** |

Agent-side culls landed:
1. Replace `threatwinds/logger` with thin `utils.HaLogger` (drops logger→gin path).
2. `-tags agent_slim` excludes `sdk/plugins` CEL + OpenSearch rules + `sdk/catcher.GinError` (gin).
3. `-tags nonetflow` omits netflow collector + goflow2/tehmaze from the binary.

**Deploy must pass `-tags agent_slim` (recommended) and optionally `nonetflow` for log/EDR endpoint flavors** — see DEP-SIZE-01. Helpers: `make -C agent build-slim`, `BUILD_SLIM=1` on `publish-agent-packages.sh`.

---

## Later residuals landed 2026-09-07 (`feat/agent-policy-later`)

### AGT-OBS-01 — Agent self-metrics (vitals)

| Field | Value |
|---|---|
| **Status** | **DONE (STAGING CANDIDATE)** |
| **Done** | Agent `telemetry.StartVitalsLoop` PUT `/api/ha-telemetry/vitals/{agentId}` every 30s with device headers: `queueDepth`, `droppedTotal`, `ramMb`, `appliedPolicyId`, `appliedPolicyVersion`. Backend persists new columns (`20260907001_ha_agent_vitals_policy.xml`). |
| **Residual** | Host CPU % sampling; Sensors UI sparkline wiring for policy meta; LIVE VERIFIED staging. |

### Schema — Windows registry FIM (optional)

| Field | Value |
|---|---|
| **Status** | **DONE (STAGING CANDIDATE)** agent + BE schema; **FE deferred** |
| **Contract** | Optional `fim.registry.{mode,keys[]}` under schema_version 1 (feature level **1.2**). Keys are HKLM-relative; `HKLM\` prefix stripped. merge/replace vs platform defaults. Applied on Windows at registry watcher start; hot-restart of live watchers deferred (next collector start). |
| **FE** | Do not block on Agent FIM Policies registry editor — document for FE follow-up. |

---

## Changelog

| Date | Entry |
|---|---|
| 2026-09-03 | Created tracker; logged BE-POL-01 schema v1 contract, BE-SEC-01, FE-SEC-01, FE-POL-01, FE-EDR-01, AM-DOC-01, DEP-SIZE-01/02, OPS-* from agent Now implementation session. |
| 2026-09-03 | AGT-POL-01 agent schema v1 + apply path; AGT-SEC-01 shell deny-by-default; AGT-SIZE-01 logger + `agent_slim`/`nonetflow` tags (+ tiny `sdk/catcher` GinError split); AGT-DOC-01 `agent/protos/README.md`. Size: 55.7 → 29.2 MiB linux amd64 with `agent_slim,nonetflow`. |
| 2026-09-03 | **BE-POL-01 DONE (STAGING CANDIDATE):** backend emits/normalizes schema v1 in `policyConfig`; Ha dual-plane documented (`fromHaColumns`). **BE-POL-02 PARTIAL:** agent device ACK on report-state + GET policy (`ROLE_AGENT_DEVICE`); rule-sync `/ack` still open. FE-POL-01/FE-SEC-01 remaining: agent-groups SOC Manager list, LIVE VERIFIED staging. |
| 2026-09-03 | FIM exclude enforcement (`isExcluded` in seed/handleEvent); policy ACK client uses `X-HiveArmor-Agent-Id` + `X-Agent-Key` (telemetry pattern). Added **BE-POL-02** for backend agent-auth on report-state + rule ACK. Hot-reload: excludes immediate; removed roots best-effort; recursive cleanup may need restart. |
| 2026-09-03 | FE-POL-01 / FE-SEC-01 STAGING CANDIDATE: frontend-v3 Agent FIM Policies console (`/posture/sensors/fim-policies`) + `/api/agent-policies` client; dual-plane note vs Ha `/edr/policies`. Blockers: agent-groups ADMIN-only list, group-only push; BE-POL-01 schema emit resolved. |
| 2026-09-03 | **Now-phase reconcile (docs only):** FE-POL-01/FE-SEC-01 → **DONE**; BE-POL-01 → **DONE**; BE-POL-02 → **PARTIAL** (rule `/ack` open); BE-SEC-01 → **PARTIAL**. Schema/ACK contract spot-check: aligned, no code fix. Copies synced (`agent/release` ↔ `.plan/audits`). Next (groups UX/scheduler) not started. |
| 2026-09-07 | **Agent Policy Next (backend):** BE-POL-02 complete (rule `/ack` + filter); SOC Manager `GET /api/agent-groups`; `POST …/push-agent/{agentId}`; `POST …/sync-on-connect`; schema v1.1 telemetry intervals; EXTERNAL_WORK updated. Optional AM-POL-01 stream-open push deferred in favor of agent-callable sync. |
| 2026-09-07 | **FE-POL Next (STAGING CANDIDATE):** frontend-v3 wires SOC Manager group picker + 403 fallback; per-agent push + sensor picker; telemetry interval editor (`sca_interval_hours` / `sbom_interval_hours`); push-on-connect honesty. Isolate gate untouched. Apply/ack not LIVE VERIFIED. |
| 2026-09-07 | **Consolidate:** Synced `.plan/audits/AGENT_PLATFORM_EXTERNAL_WORK.md` to `agent/release`; BE-POL-04 agent/FE follow-ups marked done; isolate gate unchanged. |
| 2026-09-07 | **Later / residual (`feat/agent-policy-later`):** DEP-SIZE-01 slim build/publish helpers; AGT-OBS-01 vitals loop + BE columns; optional `fim.registry` schema v1.2 (FE editor deferred); BE-SEC-01 IR docs + opt-in reject; AM-DOC-01 proto README + subset check stub. Skipped: isolate LIVE_VERIFIED flip, eBPF/ESF/ETW, multi-manager HA. |

