# HIVEARMOR ENDPOINT SENSOR PLATFORM — IMPLEMENTATION & ARCHITECTURE PLAN (V2)

> Date: 2026-09-09 · **DESIGN / PLANNING ONLY — no code, no migrations, no `.proto` changes, no frontend, no commits.**
> V2 revision of `HIVEARMOR_ENDPOINT_AGENT_IMPLEMENTATION_PLAN.md`, applying the 17 architectural corrections from the review. V1 detail is preserved except where a correction changes it. Source of truth for current state remains `HIVEARMOR_ENDPOINT_AGENT_CURRENT_STATE_AUDIT.md`.
> Change log vs V1: identity model corrected (§7); root-of-trust bootstrap added (§7a); signing/CA separated from Agent Manager (§7b); persistent command journal + idempotency (§9a, §21a); authenticity-vs-authorization pipeline (§9); TUF-style update metadata (§10); transport-resilience workstream (§11a); crash-safe file+offset transaction (§12); stream-watermark ACK (§11); clock health (§10a); `core/*` gated by a package-justification test (§6); P0 split into P0-A/P0-B (§33); policy trust bootstrap (§14); response idempotency classification (§21a); dependency graph, master table, and gates updated (§32, master table, §42).

---

## 1. Executive summary

Unchanged verdict: the current agent is soundly engineered (durable spool, modern enrollment, AES-GCM credentials, native ETW/eBPF/ESF, gRPC control plane); its defects are trust, tenancy, and finishing, and it can evolve **incrementally without a rewrite** (§45: **YES WITH MAJOR REFACTORING**). V2 hardens the trust architecture the review flagged: (a) identity is now four authoritative IDs plus a *non-authoritative* host_fingerprint; (b) an **immutable root-of-trust bootstrap** anchors command/update/policy/device-CA signing so policy distribution is never the sole root; (c) signing/CA private keys live in **dedicated services backed by KMS/HSM**, not in Agent Manager, so a manager compromise cannot forge signatures; (d) command replay protection and response execution are **crash-safe via a persistent journal**; (e) update metadata follows **TUF-style** anti-rollback/anti-freeze principles; (f) transport resilience, stream-watermark ACK, and clock health are first-class; and (g) P0 is split so immediate security closure (**P0-A**) is not blocked by the larger mTLS project (**P0-B**).

P0-A is the hard gate before any advanced response/detection.

---

## 2. Current → target architecture

Unchanged from V1 in shape (Core Agent Runtime hosting Collection/EDR/Live-Hunt/Response engines over Event/Entity → durable spool → mTLS transport → tenant-authoritative ingest + fleet control). V2 refinements: transport is resilient (backoff/jitter/circuit-breaker/watermark ACK), the trust plane is externalized from Agent Manager, and identity carries clone-safe semantics.

---

## 3. Architectural principles

V1 principles retained, plus:
10. **Trust is bootstrapped from an immutable root, not from policy.** First public keys ship in the signed agent artifact / installer, verified against a pinned root.
11. **Authenticity ≠ authorization.** A valid signature proves *who issued* a command; a separate authorization chain proves it is *allowed*. Signing services never blind-sign.
12. **Idempotency is durable.** Replay/dedup survive restart via on-disk journals, not memory.
13. **Time is a security input.** Expiration checks cannot be silently bypassed by clock drift.
14. **Manager compromise ≠ platform compromise.** High-value signing keys live outside Agent Manager.

---

## 4. Decisions to preserve existing work

Unchanged from V1 (modular runtime, durable SQLite spool, enrollment, native sensors, response execution primitives, gRPC control plane). V2 adds: **do not restructure into `core/*` packages without passing the per-package justification test (§6).**

---

## 5. Critical security alignment

Same 14 audit problems mapped, now with the review's cross-cutting corrections: trust bootstrap (correction 2), signing separation (3), persistent replay (4), authz-vs-authn (5), TUF update (6), transport resilience (7), crash-safe offset (8), stream ACK (9), clock health (10), P0 split (12), policy bootstrap (13), response idempotency (14).

---

## 6. Target core agent runtime — `core/*` is CONDITIONAL, not default

**Correction 11 applied.** The conceptual core (Identity · Trust · Policy · State · Health · Update · Resources) is approved, but new packages are NOT created by default. Each candidate must pass this gate before any `agent/core/*` directory is introduced:

| Candidate | Why a new package? | Breaks which dep? | What moves in | Imported by | Imports | Could it stay put? |
|---|---|---|---|---|---|---|
| `core/trust` | signature verify + nonce/journal is new, security-critical, shared by response+policy+update | none (additive) | new code only | response, policy, update handlers | crypto, database | No — genuinely new, must be independently testable & audited |
| `core/identity` | four-ID lifecycle spans config+register+enroll | none | thin: id derivation helpers | trust, register, telemetry | config, utils/host | **Maybe stays in `config`+`agent`** — evaluate; prefer helpers over a new package |
| `core/state` | event-ID/sequence bookkeeping | none | wraps existing `database` | spool, telemetry | database | **Prefer to extend `agent/database` + `agent/agent/spool.go`** — no new package |
| `core/health` | component health calc is new + shared | none | new code | ping/heartbeat, telemetry | all sensors (read-only status) | Justified as new (cross-cutting reader) |
| `core/update` | manifest/artifact verify + rings | none | extends `agent/updater` | updater main | trust, http | **Extend `agent/updater`**, not a new top-level package |
| `core/resources` | governor + scheduler is new + shared | none | new code | all engines | runtime metrics | Justified as new (cross-cutting governor) |
| `core/policy` | unified resolver + apply/report | merges two policy paths | extends `agent/agent/policy_*` | conn/stream handler | trust, database | **Extend existing `agent/agent/policy_*.go`** where possible |

**Ruling:** only `core/trust`, `core/health`, `core/resources` are approved as genuinely-new packages (cross-cutting, security-critical, independently testable). Identity/state/update/policy **evolve inside their existing packages** (`config`, `agent/database`, `agent/updater`, `agent/agent/policy_*`). This keeps the audited clean modular layout intact and avoids abstraction-for-its-own-sake.

---

## 7. Identity & device trust (Corrections 1, 2, 3)

### 7.0 Identity model (Correction 1 — corrected)

Five distinct concepts; **host_fingerprint is heuristic only, never authoritative**:
```
agent_id          server-assigned registry id (existing models.Agent.ID) — authoritative fleet identity
installation_id   per-install UUID (existing UUIDFileName) — changes on clean reinstall / state deletion
device_id         server-issued stable device identity, bound to the device keypair — survives reinstall if key survives
device_key_id     id of the device keypair/certificate — changes on key rotation
host_fingerprint  HEURISTIC (machine-id, NIC set, cloud instance metadata, disk serial) — used ONLY for clone/anomaly detection, NEVER as identity
```

**Lifecycle — which IDs change vs persist:**
| Event | agent_id | installation_id | device_id | device_key_id | host_fingerprint |
|---|---|---|---|---|---|
| VM clone | must re-enroll (clone detected) | new | new | new | duplicate → triggers clone alarm |
| golden image | re-enroll on first boot | new | new | new | template value → excluded from fingerprint match |
| VDI (non-persistent) | ephemeral enroll per session | new each boot | new | new | pooled → fingerprint not identity |
| cloud instance replace | new instance re-enrolls | new | new | new | instance-id in fingerprint |
| autoscaling | ephemeral token per node | new | new | new | changes |
| NIC replacement | unchanged | unchanged | unchanged | unchanged | fingerprint DRIFTS → anomaly note, not re-enroll |
| hostname change | unchanged (attribute) | unchanged | unchanged | unchanged | minor drift |
| OS reinstall | re-enroll | new | new | new | may match (same HW) |
| restored snapshot | credential_version stale → rejected → re-enroll | as snapshot | stale device_key rejected | reissued | matches |
| agent reinstall (same host) | may retain device_id if key preserved in secure store | new | preserved if key survives | preserved | matches |
| deleted local state | re-enroll | new | new (unless key in TPM) | new | matches |

**Clone detection:** duplicate `host_fingerprint` presenting a *different* device_key, or a device_key already bound to another live agent_id → force re-enroll, never inherit a credential. This replaces V1's incorrect "host_id = machine-id + NIC as canonical identity."

### 7a. Root-of-trust bootstrap (Correction 2 — new)

Command/update/policy verification keys are **NOT** distributed only via signed policy (that would make policy the sole root while policy-signing ships later). Instead:

```
HiveArmor Trust Root (offline, HSM)   ← pinned in the SIGNED agent artifact + installer
     ├── Device CA           (issues device certs)
     ├── Command Signing      (signs response envelopes)
     ├── Update Signing        (signs update manifests/root metadata)
     └── Policy Signing         (signs policy bundles)
```

**First-key delivery:** the Trust Root public key (and the current intermediate public keys) are **embedded in the agent binary at build time** and re-verified by the signed installer/artifact. Because the artifact itself is Update-Signing-verified (§10) and the installer is OS-signed (Authenticode/notarization, audit §55), the root arrives over an already-trusted channel. Intermediates can then be rotated via signed **root metadata** (§10), not via policy. Policy signing (§14) is one *consumer* of this root, never its source.

### 7b. Signing / CA services separated from Agent Manager (Correction 3 — new)

Agent Manager must not hold high-value private keys. Logical services and what each possesses:

| Service | Private key? | Public key/cert held | Signing authority | Notes |
|---|---|---|---|---|
| Enrollment Service | no | validates enrollment tokens | none | consumes tenant/policy binding |
| Certificate Service | Device CA key **in KMS/HSM** | — | issues device certs | separate from manager process |
| Command Authorization Service | no | — | decides *whether* to authorize (RBAC/tenant/policy/approval) | never signs |
| Command Signing Service | Command Signing key **in KMS/HSM** | — | signs ONLY authorized requests | signs only what CmdAuthz approved |
| Update Signing Service | Update Signing key **in KMS/HSM** | — | signs manifests/root metadata | offline/CI-side ideally |
| Policy Signing Service | Policy Signing key **in KMS/HSM** | — | signs policy bundles | separate from manager |
| Agent Manager | no signing keys | agents' public keys/cert fingerprints | none | orchestrates; compromise cannot forge signatures |

**Compromise containment:** an Agent-Manager compromise lets an attacker *route/queue* but not *sign* — no forged commands, updates, policies, or certs. Separate intermediates mean a command-signing compromise doesn't touch updates or device identity (§41).

---

## 8. Tenant isolation (Problems 1 & 2)

Unchanged from V1 (rule: `tenant_id + resource_id`; tenant derived from authenticated identity, never payload). Backend/manager/DB/API/test plan as V1 §8. EDR events get a `tenant_id` column derived from the authenticated agent identity at ingest.

---

## 9. Secure commands — authenticity **and** authorization (Corrections 5)

**Two separate concerns, in order:**
```
Analyst / Automation
  ↓ RBAC (role allowed to request this action?)
  ↓ Tenant authorization (actor's tenant == target agent's tenant?)
  ↓ Endpoint authorization (actor may act on THIS agent?)
  ↓ Response policy (action permitted by tenant/group policy?)
  ↓ Approval requirement (four-eyes for HIGH/DESTRUCTIVE?)
  ↓ Incident / reason binding (required, recorded)
  ↓ Command Authorization Service  ── decides YES ──► Command Signing Service (signs ONLY the approved request)
  ↓ Agent verification (signature + key_id + tenant + agent_id + issued/expires + nonce + type allowlist)
  ↓ Local policy gate
  ↓ Persistent execution-journal idempotency check (§9a)
  ↓ Execute → capture auditable result
```
**Signing services never blind-sign.** The Command Signing Service only signs a request the Command Authorization Service has already approved (authenticity attests an *authorized* decision). This closes the gap where a valid signature alone would authorize a destructive action. Envelope fields as V1 §9 (`command_id, schema_version, tenant_id, agent_id, command_type, arguments, issued_at, expires_at, nonce, actor_id, actor_role, incident_id, reason, approval_context, policy_context, key_id, signature`). **Agentic-AI response** is a special actor class that MUST pass the identical chain plus an autonomy-policy gate and (for HIGH/DESTRUCTIVE) mandatory human approval — no bypass.

### 9a. Persistent command replay + idempotency (Correction 4 — new)

In-memory nonce cache is insufficient (lost on restart). Add a **local execution journal** in the agent SQLite DB:
```
command_id (unique), signature_hash, received_at, executed_at, expires_at, status, result_hash
```
Flow: receive → verify signature → **look up command_id in journal** → if present return the stored `result_hash`/status (do NOT re-execute) → else execute → persist result → mark done. Especially enforced for destructive commands (kill/quarantine/delete/isolate/script). Retention: keep entries until `expires_at` + a grace window (≥ max redelivery window), then vacuum; keep destructive-action records longer for audit. This makes replay protection **survive agent restart** (the in-memory nonce cache becomes a fast-path in front of the journal).

---

## 10. Secure updates — TUF-style metadata (Correction 6)

Retain Ed25519 signing; adopt **TUF-style principles** (not necessarily full TUF now) to defend rollback / freeze / mirror-compromise / key-rotation / platform mismatch. Signed metadata:
```
version, release_sequence (monotonic), artifact_hash, artifact_size, platform, architecture,
channel, expiry (anti-freeze — stale metadata rejected), minimum_compatible_agent,
maximum_compatible_agent, key_id, signature
+ signed ROOT metadata (lists current valid intermediate keys, own expiry, own version)
```
Agent verify: root metadata signature (against pinned root, §7a) → intermediate/update-signing key valid & not expired → manifest signature → artifact hash+size → `release_sequence` strictly greater than installed (anti-rollback) → platform/arch match → metadata not expired (anti-freeze) → compatibility window → stage → install → health → rollback. **Root-key rotation:** new root signed by old root (chained) delivered as root metadata; agents update the pinned set. **Emergency signing-key compromise:** revoke via a new root metadata that drops the compromised key_id and raises the required minimum; agents reject anything signed by the revoked key on next contact. Rollout rings + controls as V1 §10.

### 10a. Endpoint time / clock health (Correction 10 — new)

All expiry checks (commands, certs, update metadata, policy effective times) depend on endpoint time. Design:
```
skew = |endpoint_time − server_time (from authenticated channel)|
allowed_skew = e.g. ±5 min
TIME_HEALTHY   skew ≤ allowed
TIME_DRIFT     skew > allowed → FAIL-CLOSED on expiry-sensitive operations (reject signed commands/updates whose validity can't be safely evaluated; log; surface health substatus)
TIME_UNKNOWN   no trusted reference yet → treat as DRIFT for security ops
```
Clock problems **cannot silently bypass expiration** — an out-of-tolerance clock fails expiry checks closed rather than accepting a stale/forged-time artifact. `TIME_DRIFT`/`TIME_UNKNOWN` become health substatuses (§15).

---

## 11. Event identity, reliability & ACK (Corrections 8, 9)

Keep `event.id` (stable, agent-generated). Add `stream.id` + `sequence` per stream. **ACK model — recommendation: contiguous stream watermark** (with event.id dedup as the safety net):
```
stream=security received=1001,1002,1003 → server ACK contiguous_through=1003
```
- **Watermark ACK** for the common case (compact, cheap spool cleanup: delete ≤ watermark).
- **event.id unique index `(tenant_id, event_id)`** for idempotent ingest, out-of-order and duplicate handling, and gap detection (missing sequence in a stream → agent re-sends the gap).
- Reconnect: agent resumes from last-ACKed watermark per stream; spool cleanup only past the watermark.
This gives **effectively-once** on top of the existing durable spool (never replacing it, audit §18) while handling gaps, dups, retries, out-of-order, and reconnect.

### 11a. Transport resilience (Correction 7 — new P1 item, WS-03)

Design and add as **P1 / WS-03 / task T33** (in master table): exponential backoff + random jitter, connection-rate limiting, bounded concurrent sends, adaptive batch sizing, compression, max in-flight batches, `Retry-After` handling, circuit breaker, server-side throttling cooperation, **reconnect spreading** (randomized reconnect windows). Recovery design for **10k / 50k agents reconnecting** after an outage: jittered reconnect over a spread window sized to server capacity, server advertises accept-rate / `Retry-After`, agents honor it, watermark ACK means each agent resumes without replaying its whole spool. Failure-lab scenarios (§38) validate both counts.

---

## 12. Enterprise file collection — crash-safe offset (Correction 8)

V1 persistent-state model retained (`source_id, file_identity, path, generation, offset, last_size, last_modified, fingerprint, encoding, parser, last_event_time`). **Crash-safety (new):** the read→persist-event→persist-offset sequence runs in a **single SQLite transaction**:
```
BEGIN
  INSERT spool event(s) for the batch just read
  UPDATE FileReaderState.offset to end of that batch
COMMIT
```
**Crash behavior by stage:**
| Crash point | Result | Loss/Dup |
|---|---|---|
| before spool INSERT | nothing committed; re-read from stored offset | no loss, no dup |
| after INSERT, before offset UPDATE | both in same txn — uncommitted, rolled back | no loss, no dup |
| before COMMIT | txn rolls back atomically | no loss, no dup |
| after COMMIT | offset advanced with events durably stored | no loss; at-most one batch re-read only if fingerprint check misfires |
Target: **no data loss, minimal duplicates** (event.id dedup at ingest, §11, absorbs any rare re-read). Tests: crash injection at each of the six stages (before/after INSERT, before/after offset UPDATE, before/after COMMIT).

---

## 13. Process entity architecture (Problem 9)

Unchanged from V1: `process.entity_id = hash(host_id-equivalent + boot_id + pid + process_start_time)` — but "host" here uses the authoritative `device_id`, not the heuristic host_fingerprint. Per-OS construction and the investigation graph as V1 §13.

---

## 14. Policy architecture + trust bootstrap (Problem 10, Correction 13)

Unified control plane, precedence Platform→Tenant→Group→Endpoint, versioned as V1 §14. **Policy trust bootstrap (new):** policy bundles are signed by the **Policy Signing Service** (§7b) whose key chains to the immutable root (§7a). Policy carries `policy_signing_key_id, policy_signature, schema_version, policy_version, hash, effective_from/expiry`. **Agent verifies policy BEFORE applying:** validate signature against the root-anchored policy-signing public key → check version/hash/effective window/clock-health → apply → report `applied_version/applied_hash/apply_status`. A **compromised Agent Manager cannot forge policy** because it lacks the policy-signing key. Legacy `/api/ha-edr/policies` deprecation/dual-read/retire path as V1.

---

## 15. Health & resource governance (Problems 11 & 12)

V1 component health model retained, **plus** substatuses `TIME_DRIFT` / `TIME_UNKNOWN` (Certificate component gains clock dependency) and `CERT_EXPIRING`. Resource governor + P0–P4 priority classes unchanged from V1.

---

## 16–20. Deployment, fleet/UI, live hunt, telemetry expansion, detection

Unchanged from V1 §16–20 (packaging + MDM; canonical ENDPOINT SECURITY IA + endpoint detail; hybrid-osquery live hunt; SOC-value-prioritized sensor expansion; endpoint detection sequencing with signed IOC/YARA packs). All new content packs (IOC, YARA, policy) verify against the root-of-trust (§7a).

---

## 21. Response architecture

V1 retained (signed envelope + RBAC + tenant + audit; action classification P1/P2/P3/DEFER; governed classes READ-ONLY/LOW/HIGH/DESTRUCTIVE with four-eyes/incident-binding/reason/auto-expiry).

### 21a. Response execution idempotency (Correction 14 — new)

Every action classified for retry-safety, enforced by the persistent command journal (§9a):
| Action | Idempotency class | Handling |
|---|---|---|
| isolate | idempotent naturally | re-apply firewall state is safe |
| release | idempotent naturally | lifting when already lifted is safe |
| kill | **non-idempotent** | journal-guarded (dup delivery returns prior result; do not re-kill a reused PID) |
| suspend | idempotent by journal | guard by command_id |
| quarantine | **non-idempotent** | journal-guarded (file already moved → return prior result) |
| restore | idempotent by journal | guard; already-restored returns success |
| retrieve file | idempotent naturally | read-only |
| delete | **non-idempotent / destructive** | journal-guarded, hard |
| script | **non-idempotent** | journal-guarded + never auto-retry |
| block (hash/ip/domain) | idempotent naturally | re-adding a block is safe |
| scan | idempotent naturally | read-only |
Retries **never** double-execute a destructive action: the journal check (by `command_id`) precedes execution and returns the stored result on redelivery.

---

## 22–24. Quarantine vault · tamper · advanced EDR

Unchanged from V1 (encrypt+chain-of-custody vault; staged userspace→OS-native→kernel tamper; advanced-EDR futures with prerequisites).

---

## 25–28. Backend/data-model · API · gRPC/proto · UI

V1 tables retained, with V2 additions to the DB-impact table: `CommandJournal` (agent-local), `RootMetadata`/`SigningKey` registry (KMS-referenced, no private keys in DB), `StreamWatermark`, `ClockHealth` substatus columns, `DeviceCertificate` (unchanged), policy-signature columns. Proto additions: envelope fields on `RemoteCommand`, `release_sequence`+compat window on update messages, stream `sequence`/watermark on the telemetry/ACK path, health substatuses — shapes only, no `.proto` edits.

---

## 29. Migration strategy

V1 discipline retained (compat → dual-support → migration → retirement). V2 note: agent-key→cert migration is **P0-B** and must not block **P0-A** security closure (§33). Command plain-string→signed envelope dual-accept window spans P0-A→GATE 7.

---

## 30. Feature flags

V1 flags plus: `root_trust_v1`, `command_journal`, `stream_watermark_ack`, `clock_health`, `transport_resilience_v2`, `policy_signing`. P0-A flags enable first.

---

## 31. Workstreams

V1 WS-01…WS-14 retained. **WS-03 (Telemetry Reliability)** now explicitly owns transport resilience (§11a) + stream ACK (§11). **WS-01 (Security & Trust)** now owns root-trust bootstrap, the signing/CA service split, command journal, and clock health.

---

## 32. Dependency graph (Correction 15 — updated)

```
Root Trust Bootstrap
   ├─► Command Signing keys ─► Signed Command ─► Persistent Command Journal ─► Governed Response
   ├─► Update Signing keys  ─► Signed Update (TUF-style) ─► Ring Rollout
   ├─► Policy Signing keys  ─► Signed Policy ─► Policy Apply
   └─► Device CA ─► Device Certificate ─► mTLS ─► Secure Fleet Control

Tenant Isolation ─► Response Authorization ─► Signed Command ─► Command Journal ─► Governed Response

Identity V2 ─► Device Key ─► Certificate ─► mTLS

Event ID ─► Dedup ─► Stream Sequence ─► ACK / Gap Detection ─► Reliable Telemetry
Transport Resilience ─► Reliable Telemetry (reconnect storms)

File Identity ─► Atomic Spool + Offset (single txn) ─► Loss-Safe Collection

Process Entity ─► Process Graph ─► Live Hunt ─► Behavior Detection

Clock Health ─► (gates) Signed Command / Signed Update / Certificate / Policy expiry checks
```

---

## 33. P0 split into two waves (Correction 12)

### P0-A — Immediate Security Closure (must ship first; GATE 0)
tenant isolation · EDR tenant attribution · `/api/collectors` authorization · response authorization (RBAC + authz-vs-authn chain) · secure command envelope · **persistent replay/idempotency journal** · signed updater (TUF-style) · anti-downgrade (release_sequence) · **root-trust bootstrap** · **signing/CA service separation** · clock health (for expiry safety) · security regression tests.

### P0-B — Device Trust (mandatory for enterprise release, but must NOT delay P0-A)
identity V2 (five-ID model) · device keypair + secure storage · Certificate Service · mTLS · certificate rotation · certificate revocation · agent-key compatibility/migration.

Rationale: mTLS is a large project; the critical *existing* defects (cross-tenant reads, untenanted events, unsigned commands/updates) close in P0-A without waiting for it.

## 34–36. P1 / P2 / P3 plans

As V1, plus P1 gains **T33 Transport Resilience**, **T34 Stream Sequence/ACK**; P0 items reindexed into P0-A/P0-B; identity V2 moves to P0-B.

---

## 37. Test strategy

V1 catalogue retained, plus negative/failure tests for: replay-after-restart (journal), out-of-order + gap detection, stale/expired update metadata (anti-freeze), rollback via lower release_sequence, clock-drift fail-closed, crash injection at the six file-txn stages, 10k/50k reconnect storms, forged policy from a compromised manager (must be rejected), signing-key-compromise recovery (revoked key rejected).

## 38. Performance & scale lab

V1 lab retained; add explicit **10k and 50k reconnect-storm** tests with reconnect-spreading + watermark-resume measured (convergence time, server accept-rate, per-agent replay volume). SLOs proposed separately (no invented current numbers).

## 39. Failure engineering

V1 14 scenarios retained; behaviors updated for: bad update (anti-rollback + ring auto-rollback), key compromise (root-metadata revocation), cert expiry (clock-health + grace + re-enroll), reconnect storm (spreading + watermark), local-admin disable (staged tamper), cross-tenant (scoped reads + untenanted-event fix).

## 40. Security threat model

V1 boundaries retained; **Signing Service and Certificate Authority are now distinct trust boundaries outside Agent Manager** (Correction 3). Manager compromise blast-radius explicitly bounded: routing/queueing only, no signing authority.

## 41. Cryptographic key model

```
Platform Trust Root (offline, HSM)  ── pinned in signed agent artifact + installer (§7a)
  ├─ Device CA intermediate        (Certificate Service; KMS/HSM)
  ├─ Command Signing intermediate  (Command Signing Service; KMS/HSM)
  ├─ Update Signing intermediate   (Update Signing Service; ideally offline/CI)
  └─ Policy Signing intermediate   (Policy Signing Service; KMS/HSM)
```
Separate intermediates so any one compromise is contained. Per key: creation, KMS/HSM storage, rotation (chained root metadata), revocation (root metadata drops key_id + raises minimum), key IDs in every envelope/manifest/cert/policy, audit, emergency replacement runbook. No key in Agent Manager; no hardcoded keys.

## 42. Phase gates (Correction 17 — updated)

**GATE 0 (P0-A) must prove:** cross-tenant negative tests · EDR tenant binding · collector authorization · response RBAC · valid command accepted · invalid signature rejected · expired command rejected · replayed command rejected · **replay STILL rejected after agent restart** (journal) · signed update accepted · unsigned update rejected · tampered update rejected · **downgrade rejected (release_sequence)** · forged policy rejected · clock-drift fails expiry closed.

**GATE 1 (P0-B + core) adds:** clone-safe identity behavior · certificate issuance · mTLS · certificate rotation · certificate revocation · legacy-agent compatibility · clock-skew handling.

**GATE 2 (Collection) adds:** **atomic file checkpoint** · no-downtime log loss · rotation · copytruncate · crash injection (six stages) · 24h offline recovery · controlled reconnect/backoff (10k/50k).

GATES 3–7 as V1 (fleet/visibility/live-hunt/detection/response).

## 43. Risks

V1 risks retained; add: root-key/HSM operational complexity (mitigate: KMS-backed, documented rotation runbook); journal growth on high-command fleets (retention/vacuum); clock-drift false-fails on legitimately skewed endpoints (grace + health surfacing before hard fail).

## 44. Technical-debt retirement

As V1, with unsigned-command retirement now explicitly gated behind the persistent journal + authz-vs-authn chain, and untrusted policy retirement behind policy signing.

## 45. Final implementation sequence

P0-A order: 1 tenant isolation → 2 EDR tenant attribution → 3 collector authz → 4 response authz chain → 5 root-trust bootstrap → 6 signing/CA separation → 7 signed command envelope → 8 persistent command journal → 9 signed updater (TUF) → 10 anti-downgrade → 11 clock health → 12 security regression suite. P0-B: 13 identity V2 → 14 device key/cert service → 15 mTLS → 16 rotation/revocation → 17 agent-key migration. Then P1 (18 event IDs → 19 dedup → 20 stream seq/ACK → 21 transport resilience → 22 file atomic checkpoint → 23 process entity → 24 unified policy → 25 policy signing → 26 health → 27 governor → 28 packages → 29 rollout → 30 fleet UI) → P2 (live hunt, telemetry expansion, container) → P3 (IOC, YARA, behavior, response expansion, quarantine vault, advanced tamper, advanced EDR).

---

## Master implementation table (Corrections 16 — updated; new/split tasks in **bold**)

| ID | Phase | WS | Feature | Dependency | Components | Cx | Risk | Gate |
|---|---|---|---|---|---|---|---|---|
| T01 | P0-A | 01/11 | Tenant-scope all agent reads | — | Mgr,BE,DB | M | Critical | 0 |
| T02 | P0-A | 11 | EDR event tenant attribution | T01 | BE,DB | M | Critical | 0 |
| T03 | P0-A | 11 | `/api/collectors` authorization | — | BE | S | High | 0 |
| **T04** | **P0-A** | **01** | **Root-of-trust bootstrap (pinned root, embedded keys)** | — | Agent,CI,KMS | L | Critical | 0 |
| **T05** | **P0-A** | **01** | **Signing/CA service separation (Cert/CmdSign/UpdSign/PolSign)** | T04 | new services,KMS,Mgr | XL | Critical | 0/1 |
| **T06** | **P0-A** | **01** | **Command Authorization Service (authz≠authn chain)** | T01 | BE | L | Critical | 0/7 |
| T07 | P0-A | 01 | Signed command envelope + verify | T05,T06 | Agent,Mgr,proto | L | Critical | 0/7 |
| **T08** | **P0-A** | **01** | **Persistent command journal (replay/idempotency, restart-safe)** | T07 | Agent,DB | M | Critical | 0 |
| T09 | P0-A | 09 | Response RBAC + governance classes + idempotency map | T06,T08 | BE,Agent | M | High | 0/7 |
| T10 | P0-A | 01/10 | Signed updater (TUF-style metadata) | T04 | Agent updater,CI | L | Critical | 0 |
| T11 | P0-A | 01 | Anti-downgrade (release_sequence) | T10 | Agent updater | S | High | 0 |
| **T12** | **P0-A** | **02** | **Clock health (skew detect, fail-closed expiry)** | — | Agent,core/health | M | High | 0 |
| T13 | P0-A | 13 | Security regression suite (cross-tenant, replay-after-restart, downgrade, forged-policy, clock) | T01-12 | tests | M | High | 0 |
| T14 | P0-B | 02 | Identity V2 (agent/install/device/device_key/host_fingerprint) | — | Agent,Mgr,DB | L | High | 1 |
| **T15** | **P0-B** | **01** | **Certificate Service (Device CA in KMS)** | T05,T14 | new service,KMS,Mgr | L | High | 1 |
| T16 | P0-B | 01 | mTLS (dual-support with agent-key) | T15 | Agent,Mgr | XL | High | 1 |
| T17 | P0-B | 01 | Cert rotation + revocation | T15 | Agent,Mgr | M | High | 1 |
| T18 | P1 | 03 | Stable event IDs + sequence | — | Agent,BE | M | Med | 1 |
| T19 | P1 | 03 | Idempotent ingest / dedup (unique tenant,event_id) | T18 | BE,DB | M | Med | 1 |
| **T20** | **P1** | **03** | **Stream sequence + watermark ACK + gap detection** | T18 | Agent,BE | M | Med | 1 |
| **T21** | **P1** | **03** | **Transport resilience (backoff/jitter/circuit-breaker/reconnect-spread)** | T20 | Agent,Mgr | L | High | 2 |
| **T22** | **P1** | **04** | **Atomic file checkpoint (single-txn spool+offset)** | T18 | Agent collector/file,DB | M | Med | 2 |
| T23 | P1 | 04 | Multiline + rotation/copytruncate recovery | T22 | Agent collector/file | M | Med | 2 |
| T24 | P1 | 05 | Process entity IDs | T14 | Agent sensors,BE | M | Med | 4 |
| T25 | P1 | 06 | Unified policy engine + precedence | — | BE,Agent policy | L | High | 3 |
| **T26** | **P1** | **06** | **Policy signing (Policy Signing Service) + verify-before-apply** | T04,T05,T25 | Agent,new service | L | High | 3 |
| T27 | P1 | 06 | Policy version/rollback/pinning | T25,T26 | BE,Agent | L | High | 3 |
| T28 | P1 | 02 | Component health model (+time substatuses) | T12,T14 | Agent,Mgr,BE,FE | M | Med | 3 |
| T29 | P1 | 02 | Resource governor + priority classes | — | core/resources | L | Med | 3 |
| T30 | P1 | 10 | Enterprise packages (MSI/DEB/RPM/PKG/Helm) | T16 | installer,CI | L | Med | 3 |
| T31 | P1 | 06 | Staged rollout rings + controls | T10,T27 | BE,Mgr | M | Med | 3 |
| T32 | P1 | 12 | Fleet UI consolidation + endpoint detail | T25,T28 | frontend-v3 | L | Med | 3 |
| T33 | P2 | 07 | Live-hunt framework (hybrid osquery) | T07,T24 | Agent,BE | XL | High | 5 |
| T34 | P2 | 05 | Telemetry expansion (Win/Linux/macOS) | T24,T29 | Agent sensors | XL | Med | 4 |
| T35 | P2 | 05 | Container/K8s enrichment | T24 | Agent/BE | M | Low | 4 |
| T36 | P3 | 08 | Local IOC engine (signed packs) | T04,T34 | Agent detect | L | Med | 6 |
| T37 | P3 | 08 | YARA (signed rulepacks, limits) | T04,T29,T34 | Agent detect | L | Med | 6 |
| T38 | P3 | 08 | Behavior/sequence detection | T24,T34 | Agent detect | XL | High | 6 |
| T39 | P3 | 09 | Response expansion (idempotency-classified) | T07,T08,T09 | Agent,BE | L | High | 7 |
| T40 | P3 | 09 | Quarantine vault (encrypt+CoC) | T07 | Agent,BE | L | Med | 7 |
| T41 | P3 | 01/09 | Advanced tamper (userspace→OS-native) | T14 | Agent tamper | L | High | 7 |
| **T42** | **P0-A/ops** | **01/14** | **Key-compromise recovery runbook + revocation path** | T04,T05 | services,docs | M | Critical | 0 |
| T43 | P3 | 08/09 | Advanced EDR futures | T38 | Agent | XL | Critical | future |

---

## Roadmap diagram

```
P0-A IMMEDIATE SECURITY CLOSURE (T01-T13,T42)  ── GATE 0 ──►
P0-B DEVICE TRUST / mTLS (T14-T17)             ── GATE 1 ──►
P1  CORE + COLLECTION + FLEET (T18-T32)        ── GATE 2/3 ──►
P2  VISIBILITY + LIVE HUNT (T33-T35)           ── GATE 4/5 ──►
P3  DETECTION + RESPONSE (T36-T41)             ── GATE 6/7 ──►
P3+ ADVANCED EDR (T43)  [future, prerequisite-gated]
```

---

## Do NOT do yet

Unchanged from V1 (ML detection, ransomware prevention, kernel drivers/WFP/minifilter/LSM enforcement, memory scanning, automated destructive response, full RTR shell, autonomous AI containment) — each prerequisite still holds, and **autonomous/agentic AI response additionally requires the full authz-vs-authn chain (§9) + command journal (§9a) + four-eyes for HIGH/DESTRUCTIVE**.

---

## Live-response future (design only)

As V1, built on the signed envelope + authz chain + command journal, placed after GATE 7.

---

## Final architectural question

**YES WITH MAJOR REFACTORING** — unchanged, and the V2 corrections *reinforce* it: none of them require demolishing existing components. The trust corrections (root bootstrap, signing separation, journal, TUF metadata, clock health) are **new services and new agent-local tables layered beside** the sound spool/enrollment/gRPC foundations, and the `core/*` restraint (§6) explicitly protects the audited clean modular layout from unnecessary churn. The "major refactoring" remains concentrated and additive in P0-A/P0-B, feature-flagged with dual-support windows. A NO verdict would require the spool, enrollment, or control plane to be unsound; the audit and this plan find them sound and extensible.
