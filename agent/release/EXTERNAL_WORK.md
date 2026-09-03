# Agent Platform — External Work Tracker

**Purpose:** Living list of work that cannot be finished inside `agent/` alone.  
Agent-side Now tickets (AGT-POL-01, AGT-SEC-01, AGT-SIZE-01, AGT-DOC-01) may land STAGING CANDIDATE quality in `agent/`; this file tracks backend, frontend-v3, agent-manager, deploy, and ops-staging follow-ups.

**Status:** STAGING CANDIDATE companion to `.plan/audits/AGENT_PLATFORM_AUDIT.md` — not a production-readiness claim.  
**Canonical copies (keep in sync):** `agent/release/EXTERNAL_WORK.md` ↔ `.plan/audits/AGENT_PLATFORM_EXTERNAL_WORK.md`

---

## Now phase — consolidated status (reconciled 2026-09-03)

| Track | Ticket(s) | Status |
|---|---|---|
| 1. Agent FIM exclude + ACK headers | AGT-POL-01 (agent), BE-POL-02 headers | **DONE (STAGING CANDIDATE)** — `isExcluded` on seed/handleEvent; client sends `X-HiveArmor-Agent-Id` + `X-Agent-Key` |
| 2. Frontend Agent FIM Policies | FE-POL-01, FE-SEC-01 | **DONE (STAGING CANDIDATE)** — `/posture/sensors/fim-policies` |
| 3. Backend schema v1 + device ACK | BE-POL-01, BE-POL-02 | **BE-POL-01 DONE**; **BE-POL-02 PARTIAL** — GET policy + report-state device auth landed; **rule `/ack` still open** |

**Contract spot-check (2026-09-03):** Agent `policy_schema.go` ↔ backend `AgentPolicySchemaV1` ↔ FE `agentPolicySchema.ts` / `agentPolicies.ts` field names **aligned** (`schema_version`, `fim.mode|rules[].path|recursive|exclude`, `collectors.*`, `response.allow_shell`). ACK headers **match** `TelemetryAgentIdentityFilter` (`X-HiveArmor-Agent-Id`, `X-Agent-Key`). No schema code fix required.

**Next phase (not started):** groups UX (SOC Manager `GET /api/agent-groups` list) / push scheduler polish — see FE-POL-01 blockers. Do not flip isolate gate.

---

## Remaining open / Next blockers (priority)

| ID | Status | Blocker |
|---|---|---|
| **BE-POL-02** | **PARTIAL** | `POST /api/alert-response-rules/push-status/{ruleId}/ack` missing (agent calls it; only `GET …/push-status/{ruleId}` exists). Filter does not cover this path yet. |
| **FE-POL-01** residual | Open (Next) | (1) `GET /api/agent-groups` ROLE_ADMIN-only → SOC Manager manual group id; (2) group-only push (no per-agent); (3) apply/ack not LIVE VERIFIED |
| **BE-SEC-01** | **PARTIAL** | Schema + FE toggle landed; IR path still needs docs / prefer `EDR_*` over raw shell |
| **BE-EDR-01** / **FE-EDR-01** / **OPS-EDR-01** | Open | Isolate live-verify; **do not** flip `REMOTE_SENSOR_ISOLATE_LIVE_VERIFIED` |
| **OPS-SEC-01** | Open | Confirm tenants do not rely on default remote shell |
| **DEP-SIZE-01** | Open | Publish/CI must pass `-tags agent_slim` (+ `nonetflow` as needed) |
| **AM-DOC-01** | Open | Proto SoT / CI drift check |
| **DEP-SIZE-02** / **AM-HA-01** | Deferred | Larger sdk split; multi-replica AgentStream |

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
  }
}
```

- `fim.mode`: `merge` (default) appends to platform defaults; `replace` uses only policy rules (falls back to defaults if rules empty).
- `fim.rules[].exclude`: glob patterns (relative to rule path **or** basename). Agent enforces via `isExcluded` on watch seed + `handleEvent` drop (STAGING CANDIDATE).
- `collectors.*`: desired enablement. Hot-apply today: FIM rules (new roots + excludes; best-effort unwatch of removed roots; recursive subdir cleanup may need restart) + shell gate. Other collectors recorded for next process start (see agent docs).
- Unknown fields ignored (forward-compatible).
- **Dual-plane:** `/api/agent-policies` is SoT for APPLY_POLICY. `/api/ha-edr/policies` does not push; `AgentPolicySchemaService.fromHaColumns` maps Ha `filePaths` → `fim.rules` when bridging.

### BE-POL-02 — Agent-auth for policy report-state + rule-sync ACK

| Field | Value |
|---|---|
| **Status** | **PARTIAL (STAGING CANDIDATE)** — report-state + GET `/{id}` done 2026-09-03; rule-sync `/ack` still open |
| **Problem** | Agent ACK client sends telemetry-style device headers (`X-HiveArmor-Agent-Id` + `X-Agent-Key`). Rule ACK path missing (`GET push-status` exists; **no** `POST …/ack` on `RuleDistributionResource`). |
| **Done** | `TelemetryAgentIdentityFilter` covers GET `/api/agent-policies/{id}` + POST `/report-state`; grants `ROLE_AGENT_DEVICE`; binds connector id (body agentId spoof ignored). Admin\|SOC Manager JWT still allowed. |
| **Remaining** | `POST /api/alert-response-rules/push-status/{ruleId}/ack` agent-auth endpoint + filter path allowlist |
| **Acceptance** | Enrolled agent can GET policy + POST report-state with id+key → 2xx; rule sync ACK (open); no Bearer agent-key required. |
| **Needed for** | AGT-POL-01 LIVE VERIFIED apply/ack evidence |

**Agent client contract (source of truth in `agent/agent/policy_sync.go`):**

| Header | Value |
|---|---|
| `X-HiveArmor-Agent-Id` | Decimal `config.AgentID` (same as telemetry) |
| `X-Agent-Key` | Decrypted `config.AgentKey` |
| `Content-Type` | `application/json` |

TLS: honors `config.insecure` (`SkipCertValidation`) like telemetry. Do **not** require `Authorization: Bearer <agentKey>`.

> Note: Some backend comments still say “BE-POL-01 ACK” for report-state/GET policy device auth; ticket ownership is **BE-POL-02** (doc-only drift, no code change this reconcile).

### BE-SEC-01 — Policy field + IR command path for shell governance

| Field | Value |
|---|---|
| **Status** | **PARTIAL (STAGING CANDIDATE)** — schema field + FE toggle landed 2026-09-03; IR command-path docs still open |
| **Problem** | Agent denies unstructured remote shell unless local config, env, or applied policy enables it. Operators need a control-plane way to set `response.allow_shell`; IR may still send raw shell expecting success. |
| **Done** | BE-POL-01 emits `response.allow_shell`; FE-SEC-01 toggle on Agent FIM Policies console. |
| **Remaining** | `IncidentResponseCommandService` prefer `EDR_*`; docs that shell is deny-by-default on agent ≥ this build; OPS-SEC-01 tenant check |
| **Touchpoints** | Agent policy DTO/service; `IncidentResponseCommandService`; optional shell allowlist in command metadata |
| **Acceptance** | Policy editor can set `response.allow_shell` ✅; documentation that shell is deny-by-default ⏳ |
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
| **Status** | **DONE (STAGING CANDIDATE)** — 2026-09-03 |
| **Problem** | UI should edit FIM watch paths and collector enablement as schema v1, not only legacy Ha columns. |
| **Touchpoints** | `agentPoliciesApi.service.ts`; `AgentFimPolicyPage` at `/posture/sensors/fim-policies` |
| **Acceptance** | Saved policy round-trips schema v1; console edits FIM include/exclude, merge/replace, collectors, push/assign-group ✅ (agent APPLY + LIVE VERIFIED still STAGING) |
| **Needed for** | AGT-POL-01 |
| **Next blockers (not started)** | (1) **`GET /api/agent-groups` is ROLE_ADMIN-only** while policy assign/push allows SOC Manager — SOC Manager must enter group id manually when list 403s. (2) No per-agent push endpoint (group-only). (3) Apply/ack evidence not LIVE VERIFIED (BE-POL-02 partial). Ha `/edr/policies` dual-plane remains. |

---

## Agent-manager

### AM-DOC-01 — Proto canonical ownership

| Field | Value |
|---|---|
| **Status** | Open |
| **Problem** | Agent checked-in `agent/protos/agent.proto` is a **subset**; enrollment RPCs live in agent-manager proto. |
| **Why agent can't finish alone** | Two trees; CI should fail on incompatible drift. |
| **Touchpoints** | `agent-manager/protos/agent.proto` (canonical for enrollment), `agent/protos/README.md`, optional CI wire-compat check |
| **Acceptance** | Documented SoT + CI note; no silent RPC drift |
| **Needed for** | AGT-DOC-01 |

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
| **Status** | Open (ops/CI) |
| **Problem** | Size cull uses `-tags agent_slim` (exclude CEL/OpenSearch from `sdk/plugins` and gin from `sdk/catcher.GinError`) and `-tags nonetflow` to omit netflow from endpoint flavors. |
| **Why agent can't finish alone** | Publish scripts / Docker / CI must pass tags; default `go build .` without tags still ships kitchen-sink size. |
| **Touchpoints** | `deploy/staging/build-windows-agent-*.sh`, `publish-agent-packages.sh`, agent Dockerfiles / reusable-golang |
| **Recommended flags** | Endpoint log/EDR: `-tags agent_slim,nonetflow`. Network sensor needing netflow: `-tags agent_slim` only. Event-processor / plugins: **do not** set `agent_slim`. |
| **Acceptance** | Default published endpoint agent builds with `agent_slim` (+ `nonetflow` unless product requires netflow); size re-measured in release notes |
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

**Deploy must pass `-tags agent_slim` (recommended) and optionally `nonetflow` for log/EDR endpoint flavors** — see DEP-SIZE-01.

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
