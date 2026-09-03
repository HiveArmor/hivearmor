# Agent Policy, FIM & Host Telemetry — Research Note

**Status:** Research / architecture recommendation only — **STAGING CANDIDATE** framing throughout. Not a production-readiness claim.  
**Date:** 2026-09-03  
**Repo:** `/Users/encryptshell/GIT/HiveArmor-v1`  
**Tracked mirror:** `agent/release/AGENT_POLICY_FIM_TELEMETRY_RESEARCH.md` (`.plan/` is gitignored)  
**Sources:** `.plan/audits/AGENT_PLATFORM_AUDIT.md`, `agent/release/EXTERNAL_WORK.md`, agent AGT-POL-01 apply path, backend `Ha*`/`Utm*` policy + ha-telemetry, frontend-v3 Sensors/EDR/Posture pages.

---

## Executive verdict

| Area | Today | Console-first gap |
|---|---|---|
| **FIM** | Runs only in **EDR mode**; **hardcoded `defaultRules()`** if no policy; schema v1 can hot-apply path rules after AGT-POL-01 | UI edits **Ha** columns (`filePaths`); agent consumes **Utm** `policyConfig` — **two planes, not wired** |
| **SCA/SBOM** | Hardcoded **6h** loop → Postgres via `/api/ha-telemetry/*`; **not CIS**; vuln = OSV enrich of SBOM | No policy/cron; no CIS packs; frontend reads JDBC (`/api/ha-cis`, `/api/ha-vuln`) not OpenSearch |
| **Policy** | Dual REST: `/api/ha-edr/policies` (UI) vs `/api/agent-policies` (push/groups); agent apply exists | Unify on schema v1 + groups + push-on-connect; enroll `policy_id` is **label/audit only** |

**Recommended product model:** Ship agents with **no remote policy** (safe local defaults only); when live, console assigns **policy groups → agent groups**; push `APPLY_POLICY` on connect/membership change; ACK/drift evidence is first-class.

---

## A. FIM today

### A.1 How FIM starts; default mode; `defaultRules()`

1. **Install/config mode defaults to `log`.** Empty `mode` in `config.yml` becomes `AgentModeLog`. FIM starts only when `cnf.IsEDR()` (`mode: edr`).

Evidence: `agent/config/config.go` (`AgentModeLog` default; `IsEDR()`); `agent/serv/service.go` (FIM under `if cnf.IsEDR()`).

2. **Startup sequence (EDR):**
   - `fim.RegisterPolicyApplier()`
   - `LoadAndApplyLatestPolicy()` (SQLite `PolicyState`; no-op if empty)
   - If `CollectorDesiredEnabled("fim")` → `fim.New(cnf)` → `Start` on `pb.LogQueue`

3. **Watch list without remote policy:** `currentStartupRules()` → `defaultRules()` platform lists (linux `/etc`,`/bin`,…; windows System32/…; darwin `/etc`, LaunchDaemons, …). All recursive on linux/darwin; windows recursive=false.

Evidence: `agent/collector/fim/policy.go` (`defaultRules`, `linuxDefaultRules`, …); `agent/collector/fim/collector.go` (`New` → `currentStartupRules()`).

4. **Windows registry FIM** starts alongside file FIM with **hardcoded** `defaultRegistryKeys` — **not** in schema v1 today.

Evidence: `agent/collector/fim/registry_windows.go`.

### A.2 Include/exclude configuration paths

| Source | Paths configurable? | Exclude? |
|---|---|---|
| Agent local YAML config | **No** FIM path fields on `Config` | N/A |
| APPLY_POLICY schema v1 | **Yes** — `fim.rules[].path`, `recursive`, `exclude[]`; `fim.mode` = `merge`\|`replace` | Field exists; **`isExcluded` is never called from `handleEvent`** (dead helper + unit tests only) |
| Frontend Agent Policies UI | Edits **Ha** `filePaths` / `registryPaths` via `/api/ha-edr/policies` | No exclude UI; **does not emit schema v1** and **does not push APPLY_POLICY** |
| Backend Utm `policyConfig` | Opaque TEXT; intended for schema v1 (`BE-POL-01`) | Depends on authoring |

Evidence: `agent/agent/policy_schema.go`; `agent/collector/fim/policy.go` (`ResolveWatchRules`); `frontend-v3/src/services/agentPolicyService.ts`; `agent/release/EXTERNAL_WORK.md` BE-POL-01 / FE-POL-01; `isExcluded` only in `collector.go` definition + `collector_test.go`.

### A.3 Events, pipeline, indices

| Step | Detail |
|---|---|
| Emit | `DataTypeFIM = "fim"`; actions CREATE/MODIFY/DELETE/RENAME/PERMISSION_CHANGE; registry → `"fim-registry"` |
| Queue | `agent.Offer` → `LogQueue` |
| Spool | SQLite spool → gRPC **Event Processor :50051** `ProcessLog` |
| Filter | `filters/endpoint/fim.yaml` (`dataTypes: [fim]`) + correlation rules under `rules/endpoint/fim-*.yaml` |
| OpenSearch | Backend FIM dashboard queries **`v3-hive-fim-*`** (`HaEdrFimService.FIM_INDEX`). Separate from log/alert indices. Timeline also includes `v3-hive-fim-*` when type filter includes fim/file. |
| UI | `/edr/fim` — **summary aggregations only** (`GET /api/ha-edr/fim/summary`); no row-level inventory |

**No separate FIM Postgres store** for events — OpenSearch is the analytics path. Host telemetry (SCA/SBOM) is a different plane (Postgres).

### A.4 Hot-reload vs restart (post AGT-POL-01)

| Change | Hot? | Notes |
|---|---|---|
| FIM path rules via APPLY_POLICY | **Partial hot** | `ApplyPolicyRules` → `replaceWatchRules`: **adds** new watches immediately; **removed paths stay until process restart** (fsnotify no portable remove-all) |
| `collectors.fim=false` | **Restart** | Checked at EDR startup only |
| dns/netconn/usb/netflow/syslog/file toggles | **Restart** | Desired state stored; consulted on next `StartAll` / collector start |
| `response.allow_shell` | **Hot** | Atomic runtime gate |
| Registry keys | **No policy** | Always default keys when FIM starts |

Evidence: `agent/agent/policy_apply.go` comments; `agent/collector/fim/collector.go` `replaceWatchRules`; `agent/serv/service.go`.

**Empty / missing policy:** Keep platform `defaultRules()`; shell deny-by-default; collectors default **enabled** (`CollectorDesiredEnabled` missing key → true).

---

## B. SCA / SBOM / CIS / vulnerability today

### B.1 What `agent/telemetry/` runs

| Capability | Reality |
|---|---|
| **SCA** | `BuildObservedSCA` — small **HiveArmor-observed** SSH/login pack (`ha-linux-observed-ssh`); **explicitly not CIS**. Non-Linux → single NOT_APPLICABLE row. |
| **SBOM** | CycloneDX from installed packages (`ListInstalledPackages`), capped (~400 components). |
| **CIS** | **Not run on agent.** UI/catalog mark official CIS as license-required / not shipped. |
| **Vuln scan** | **No agent CVE scanner.** Backend `OsvEnrichmentService` enriches SBOM → `ha_vuln_finding` (air-gap skippable). |
| **Cadence** | `const scanInterval = 6 * time.Hour` — hardcoded; run once at start then ticker. |
| **Auth** | Agent ID + AgentKey headers preferred; legacy `HA_INTERNAL_KEY`. |

Evidence: `agent/telemetry/loop.go`, `sca.go`, `types.go`; `backend/.../HaTelemetryService.java`; frontend CIS honesty copy.

### B.2 Schedule from UI/policy?

**No.** Schema v1 has no `telemetry` / schedule section. No UI to set interval or trigger rescan (CIS mutations fail-closed: `CIS_MUTATION_AVAILABLE`).

### B.3 Where results land; frontend query model

| Type | Ingest | Storage | Frontend API |
|---|---|---|---|
| SCA | `POST /api/ha-telemetry/sca` | Postgres `ha_sca_result`, `ha_sca_summary` | `GET /api/ha-cis/results`, `/summary`, `/catalog` |
| SBOM | `POST /api/ha-telemetry/sbom` | Postgres `ha_sbom_component` | (inventory/asset paths; not OpenSearch) |
| Vuln | Derived async from SBOM | Postgres `ha_vuln_finding` | `GET /api/ha-vuln/findings*` |
| Vitals | `PUT /api/ha-telemetry/vitals/{id}` | Postgres time-series | GET vitals for Sensors |

**Not OpenSearch** for SCA/SBOM/vuln. Frontend already has **separate REST surfaces per type** (`ha-cis` vs `ha-vuln`) over JDBC — do **not** invent per-type OpenSearch indices unless product wants SIEM search on posture data.

### B.4 Gaps vs Wazuh-like SCA/CIS

| Wazuh-like | HiveArmor today |
|---|---|
| CIS/SCA policy packs assigned per agent/group | Observed pack only; catalog shows official CIS not shipped |
| Configurable scan intervals / on-demand | Fixed 6h |
| SCA results as manager events | Postgres + posture UI; not EP correlation stream |
| Shared agent.conf / groups | Dual policy planes; groups exist on Utm side only |
| Vulnerability detection modules | OSV enrich only |

---

## C. Policy management today

### C.1 Backend / UI inventory

**Plane 1 — Ha EDR policies (UI-facing)**

| Item | Detail |
|---|---|
| REST | `/api/ha-edr/policies` CRUD + `/{id}/assign` + `/{id}/enforcement` |
| Entity | `HaAgentPolicy` — name, osType, network/process monitors, **filePaths**, **registryPaths**, assignedAgentIds |
| Push | **None** — assignment is configuration rows only |
| UI | `AgentPoliciesPage` (`/edr/policies`); honesty banner STAGING CANDIDATE |
| Evidence | Joins `UtmAgentPolicyState` by policy id (cross-plane id collision risk) |

**Plane 2 — Utm agent policies (agent APPLY path)**

| Item | Detail |
|---|---|
| REST | `/api/agent-policies` CRUD, assign/unassign **group**, **push/{groupId}**, push-log, states, `report-state` |
| Entity | `UtmAgentPolicy.policyConfig` TEXT + `versionNum` |
| Groups | `utm_agent_group` + members + `utm_policy_group_assignment` |
| Push | `APPLY_POLICY:<id>:<version>` via `IncidentResponseCommandService` → agent-manager |
| Agent | GET `/api/agent-policies/{id}` → extract `policyConfig` → SQLite → `ApplyPolicyConfig` → report-state |
| UI | **No frontend-v3 client** for `/api/agent-policies` or `/api/agent-groups` found |

**Critical honesty gaps**

1. UI does not author/push schema v1 (`BE-POL-01`, `FE-POL-01`).
2. `POST /api/agent-policies/report-state` is **`ROLE_ADMIN` only**; agent uses Bearer **agent key** — ACK path likely fails unless a separate agent auth filter exists (not found in SecurityConfiguration for this path). Evidence services already say apply/ack is not LIVE VERIFIED.
3. Enrollment `policy_id` is **required string on tokens** and copied to **audit only** — `consumeEnrollment` does **not** set `Agent.PolicyID` (Agent model has **no** policy field) and does **not** auto-push APPLY_POLICY.

### C.2 Agent schema v1 fields (`policy_schema.go`)

```json
{
  "schema_version": 1,
  "fim": {
    "mode": "merge|replace",
    "rules": [{ "path": "...", "recursive": true, "exclude": ["*.tmp"] }]
  },
  "collectors": {
    "fim": true, "dns": true, "netconn": true, "usb": true,
    "netflow": true, "syslog": true, "file": true
  },
  "response": { "allow_shell": false }
}
```

- Unknown fields ignored (forward-compatible).
- `schema_version` 0 or empty document → keep defaults.
- Unsupported version → apply error → FAILED ACK.

### C.3 Enrollment `policy_id`

- Required when creating enrollment tokens (agent-manager validation).
- Stored on token + enrollment audit events.
- **Not** applied to host at register time; **not** linked to numeric `utm_agent_policy.id` automatically.
- Suitable today as **intended-policy label** for ops/audit; needs product work for push-on-enroll.

### C.4 Ship with no policy — safe defaults?

| Subsystem | No remote policy behavior |
|---|---|
| Mode | Default **log** → **no FIM/EDR collectors** |
| EDR + no PolicyState | FIM uses **platform defaultRules**; registry defaults; collectors on |
| Shell | **Denied** unless config/env/policy |
| Telemetry | Still runs 6h SCA/SBOM if credentials present |
| Empty schema v1 | Same as no policy for FIM (defaults); shell still false |

**Product recommendation aligns with current log-default install:** ship **log mode / no APPLY_POLICY**; when live, assign group policy and push. EDR installs without policy still watch broad defaults — for “no policy = no FIM watch,” need either log-mode default or schema `collectors.fim: false` / empty replace with explicit empty-watch product decision (today replace+empty falls back to defaults).

---

## D. Recommendations (STAGING CANDIDATE)

### D.1 FIM path include/exclude from console

**Schema (keep v1; extend carefully):**

- Continue `fim.mode` merge|replace and `rules[].{path,recursive,exclude}`.
- Add optional `fim.registry.mode` + `fim.registry.keys[]` (Windows) — later if not in v1.1.
- **Wire `isExcluded` into `handleEvent`** (agent bugfix — exclude is currently dead).

**Apply semantics:**

- Document merge = defaults ∪ policy rules; replace = policy only; empty replace → **product choice**: keep today’s fallback-to-defaults **or** change to “watch nothing” for console-first empty policy (prefer explicit `collectors.fim: false` for “off”).
- Hot-add OK; document restart for path removal until watcher rebuild exists.

**UI:** Author schema v1 on **one** policy document (prefer Utm plane as SoT); map Ha `filePaths` → `fim.rules` during migration; push on save/assign.

### D.2 Scheduled SCA/SBOM/CIS/vuln via policy

**Schema v1.1+ sketch:**

```json
"telemetry": {
  "sca": { "enabled": true, "interval": "6h", "pack_ids": ["ha-linux-observed-ssh"] },
  "sbom": { "enabled": true, "interval": "6h" },
  "cis": { "enabled": false, "pack_ids": [] },
  "vuln": { "mode": "osv_enrich" }
}
```

- Agent: policy-driven ticker (replace hardcoded const); optional `RUN_TELEMETRY_NOW` command.
- CIS packs: content + licensing program (Later); until then keep honesty that observed ≠ CIS.
- Vuln: keep server-side OSV; optional on-demand enrich API — not a full Nessus-class agent scanner in Now.

**Result routing:** Keep Postgres + `/api/ha-cis` / `/api/ha-vuln`. Do not force OpenSearch unless Search UX requires it.

### D.3 Separate frontend-facing indices / APIs

| Data | Recommendation |
|---|---|
| FIM events | Keep **`v3-hive-fim-*`** (+ `fim-registry` filter/index if missing) |
| SCA / CIS / SBOM / Vuln | Keep **Postgres + typed REST**; optional OpenSearch aliases only if SIEM hunt needs them |
| Avoid | One mega “telemetry” index that mixes posture with EDR |

### D.4 Full policy management model

```
PolicyDocument (schema v1+, versioned)
    ↓ assign
PolicyGroup  ←→  AgentGroup (members)
    ↓ push / push-on-connect / drift reconcile
Agent APPLY_POLICY → local SQLite → subsystem apply → report-state ACK
```

Must-haves:

1. **Single SoT** — deprecate dual Ha vs Utm write paths or make Ha a projection of Utm.
2. **Agent-auth report-state** (INTERNAL_KEY or agent key filter) so ACK is real.
3. **Push-on-connect** — on AgentStream open / enroll, resolve group→policy and push if version drift.
4. **Enrollment policy_id** — resolve to policy document id or group id; optional auto-assign membership.
5. **Drift job** already exists (10 min) on Utm states — surface in UI honestly (partial until LIVE VERIFIED).

### D.5 Phased roadmap

#### Now (use schema v1 + BE emit) — STAGING CANDIDATE

| Work | Owner |
|---|---|
| BE-POL-01: store/serve schema v1 in `policyConfig`; map Ha filePaths→fim.rules | Backend |
| Agent auth for `report-state` | Backend |
| FE-POL-01: editor for FIM rules + collectors + allow_shell; call push API | Frontend |
| Wire FE to `/api/agent-policies` + groups **or** bridge Ha→Utm on save | Frontend + Backend |
| Agent: call `isExcluded` in FIM handleEvent | Agent |
| Document log-default = no FIM; EDR defaults until first policy | Docs |

#### Next (groups + scheduler)

| Work | Owner |
|---|---|
| Agent groups UI; policy↔group assign; push UX | Frontend |
| Push-on-connect + enroll→group membership | Agent-manager + Backend |
| Telemetry schedule in policy; agent scheduler | Agent + Backend + FE |
| Hot-rebuild FIM watches (remove stale paths) | Agent |
| Registry keys in schema | Agent + FE |

#### Later (content packs)

| Work | Owner |
|---|---|
| Licensed CIS packs; signed content distribution | Backend + content + Agent |
| Policy content packs / baselines per OS | Product |
| MSSP tenant-scoped policy isolation | Platform |
| Optional OpenSearch posture indices | Backend only if required |

### D.6 Build matrix (who builds what)

| Layer | Must build |
|---|---|
| **Backend** | Schema v1 emit/migration; agent-auth ACK; unify or bridge Ha↔Utm; push-on-assign; enroll policy resolution; telemetry schedule fields; keep ha-cis/ha-vuln contracts |
| **Frontend-v3** | Schema-aware policy editor; group management; push + drift evidence; FIM path/exclude UX; telemetry schedule toggles; keep CIS/vuln honesty |
| **Agent-manager** | Optional: persist desired policy on agent; fan-out on stream connect; enroll→group; proto/docs (AM-DOC-01) |
| **Agent** | Already: parse/apply v1, FIM hot-add, shell gate. Still: exclude enforcement; telemetry from policy; registry policy; cleaner watch replace; optional pull-on-connect if manager doesn’t push |

---

## Evidence index (quick)

| Concern | Paths |
|---|---|
| Schema / apply | `agent/agent/policy_schema.go`, `policy_apply.go`, `policy_sync.go` |
| FIM defaults / hot | `agent/collector/fim/policy.go`, `collector.go`, `registry_windows.go` |
| Service wiring | `agent/serv/service.go` |
| Telemetry | `agent/telemetry/loop.go`, `sca.go` |
| Utm policy push | `UtmAgentPolicyService.java`, `AgentPolicyResource.java` |
| Ha UI policy | `HaAgentPolicyService.java`, `HaAgentPolicyResource.java`, `AgentPoliciesPage.tsx` |
| FIM OS query | `HaEdrFimService.java` → `v3-hive-fim-*` |
| SCA/CIS/Vuln REST | `HaTelemetryResource`, `HaCisResource`, `HaVulnResource` |
| External tracker | `agent/release/EXTERNAL_WORK.md` |
| Prior audit | `.plan/audits/AGENT_PLATFORM_AUDIT.md` |

---

## Document control

| Field | Value |
|---|---|
| Classification | Internal engineering research |
| Implementation in this session | **None** (research only) |
| Companion tracked copy | `agent/release/AGENT_POLICY_FIM_TELEMETRY_RESEARCH.md` |

*End of research note.*
