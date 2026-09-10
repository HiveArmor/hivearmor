# HIVEARMOR ENDPOINT SENSOR PLATFORM — ARCHITECTURE FREEZE ADDENDUM

> Date: 2026-09-09 · **DESIGN CLARIFICATION ONLY — no code, no migrations, no `.proto` edits, no frontend, no commits.**
> Final architecture clarification before P0-A implementation planning. Builds on the APPROVED `HIVEARMOR_ENDPOINT_AGENT_IMPLEMENTATION_PLAN_V2.md`; does not restate it. Resolves the 10 mandatory freeze items and ends with the Architecture Freeze Checklist.

---

## 1. Command execution crash window — durable state machine

The command journal (V2 §9a) is upgraded from `check→execute→persist` to a **persisted state machine**. State is written **before** any external/destructive side effect.

```
RECEIVED → VERIFIED → EXECUTING → { SUCCEEDED | FAILED | RECONCILE_REQUIRED }
```

Journal row (agent SQLite, single-writer, WAL): `command_id (unique), signature_hash, target_tuple, state, received_at, verified_at, executing_at, finished_at, expires_at, result_hash, reconcile_reason`.

**Transaction boundary:** the transition to `EXECUTING` is COMMITTED before the side effect is invoked. The side effect runs. Then a second COMMIT records `SUCCEEDED`/`FAILED`.

**Crash behavior:**
| Crash point | Journal state at restart | Action on restart |
|---|---|---|
| before execution (RECEIVED/VERIFIED) | RECEIVED or VERIFIED | safe to (re)verify and execute — no side effect happened |
| during execution (EXECUTING persisted, side effect in flight) | EXECUTING | **RECONCILE, never blind re-execute** — run the action's reconciliation probe (below) |
| immediately after execution, before result persistence | EXECUTING | RECONCILE — probe whether the effect took |
| after result persistence | SUCCEEDED/FAILED | idempotent: return stored `result_hash`; do not re-execute |

**Rule:** a command found in `EXECUTING` after restart is moved to `RECONCILE_REQUIRED` and resolved by an action-specific probe, not re-run.

**Per-action reconciliation strategy:**
| Action | Reconcile probe | Resolution |
|---|---|---|
| KILL | check target tuple (below) still alive | if gone → SUCCEEDED; if a *different* process now holds the PID → do NOT kill, mark SUCCEEDED-with-note (original already gone) |
| SUSPEND | check target tuple suspended/alive | if original gone → SUCCEEDED; if PID reused → do NOT suspend, note |
| QUARANTINE | check original path absent + vault entry with this command_id exists | if vault entry present → SUCCEEDED; else re-quarantine if source still present |
| RESTORE | check original path present | present → SUCCEEDED; else re-restore from vault |
| ISOLATE | read current firewall state | already isolated → SUCCEEDED (idempotent) |
| RELEASE | read firewall state | already released → SUCCEEDED |
| DELETE | check path absent | absent → SUCCEEDED; else re-delete (destructive → require journal + explicit confirm) |
| RETRIEVE/HASH/SCAN | read-only | safe to re-run |
| BLOCK (hash/ip/domain) | check rule present | present → SUCCEEDED (idempotent) |
| SCRIPT | **no safe reconcile** → mark RECONCILE_REQUIRED, surface to operator, never auto-re-run | human decision |

**PID reuse for KILL/SUSPEND — stable target tuple** (never PID alone):
```
target = { process.entity_id, pid, process_start_time, executable_path }
```
Before killing/suspending, the agent re-resolves the live process and requires `process_start_time` (and, where cheap, `executable_path`) to match the target tuple. If the PID now maps to a *different* `process_start_time`, the original process already exited → the action is a no-op success, and the reused-PID process is untouched. `process.entity_id` (V2 §13 = hash(device_id + boot_id + pid + start_time)) is the authoritative correlation key; PID is only a lookup hint.

---

## 2. mTLS for BOTH control and telemetry

The device certificate (V2 §7b) secures **both** channels, not just gRPC:
```
Agent → Agent Manager (gRPC)      : mTLS with device cert (client-auth)
Agent → Telemetry Ingest (HTTP/S) : mTLS with the SAME device cert
```

**Dual-support migration (per channel, feature flag `mtls_agent_auth`):**
- **gRPC control:** phase 1 — manager accepts BOTH agent-key metadata (legacy) and mTLS client cert; phase 2 — manager emits capability requirement to certificated agents; phase 3 — agent-key path refused once fleet reports cert coverage.
- **Telemetry ingest:** phase 1 — ingest accepts BOTH the current `X-HiveArmor-Agent-Id`+`X-Agent-Key` headers (audit `edr_handler.go`) and mTLS client cert; phase 2 — prefer cert; phase 3 — retire header-only auth.

**Tenant at ingest resolved from authenticated device identity:** the ingest layer derives `tenant_id` from the presented client-certificate's bound `agent_id`→registered tenant (or, during migration, from the authenticated `X-HiveArmor-Agent-Id`→agent→tenant), and **overwrites** any client-supplied tenant field on the event (closes audit §24 untenanted-events). The event payload's tenant is never trusted.

---

## 3. Root rotation / threshold trust

Root metadata (extends V2 §10 signed root metadata):
```
root_version, expiry, keys[ {key_id, algorithm, public_key, role} ],
roles[ {role: root|device_ca|command_sign|update_sign|policy_sign, key_ids[], threshold} ],
threshold (root role signing threshold, e.g. 2-of-3),
minimum_root_version (anti-rollback of the root itself),
signatures[ {key_id, sig} ]
```

**Threshold trust:** the `root` role requires **M-of-N** signatures (e.g. 2-of-3 keys held on separate HSMs/custodians). Possession of a single compromised root key cannot mint a valid root.

**Transition requires dual-threshold verification:** a new root metadata is accepted only if signed by BOTH
```
old root threshold  (proves continuity — the current trusted quorum authorized the change)
AND
new root threshold  (proves the new quorum controls the new keys)
```
So a stolen old key alone cannot silently install a malicious new root (fails new-threshold), and a rogue new root cannot appear without the old quorum (fails old-threshold). `minimum_root_version` blocks rolling the root *back*.

**Emergency recovery:** if a root custodian key is compromised, the remaining quorum signs a new root metadata that (a) drops the compromised `key_id`, (b) increments `root_version` and `minimum_root_version`, (c) rotates affected intermediates. Agents accept it because it still meets old-threshold via the uncompromised custodians. If quorum itself is lost (below M), recovery falls back to the out-of-band trust channel: a new root embedded in a **signed agent artifact/installer** (V2 §7a) — the same immutable bootstrap that seeded the first root. This is documented as the break-glass path (DECISION REQUIRED on custodian count/threshold — see checklist).

---

## 4. Crypto algorithm agility

No algorithm is a protocol hard dependency. Every key carries metadata:
```
key_id, purpose (device_ca|command_sign|update_sign|policy_sign|root),
algorithm (ed25519|ecdsa_p256|rsa_pss|<future>), version, not_before, not_after, status (active|rotating|revoked)
```
Signatures and certs reference `key_id`; the verifier selects the algorithm from key metadata, so new algorithms are added without a wire/protocol change. Approved set: Ed25519, ECDSA P-256, RSA-PSS, plus future-approved.

**Initial algorithm — decided after checking (DECISION REQUIRED):** KMS/HSM support (many KMS support ECDSA P-256 and RSA-PSS natively; Ed25519 support varies), FIPS 140-3 requirements (if the platform must be FIPS-validated, ECDSA P-256 / RSA-PSS are the safer default; Ed25519 FIPS status is newer), performance (Ed25519 fastest for high command/policy volume), and customer/regulatory constraints (gov/MSSP customers may mandate FIPS). **Recommendation to confirm:** default **ECDSA P-256** for KMS/HSM+FIPS breadth, with Ed25519 permitted where the deployment's KMS supports it and FIPS is not required — the metadata model makes this a per-deployment choice, not a code fork.

---

## 5. Corrected phase-gate policy-signing dependency

Policy signing is P1 (V2 §14, task T26), so `forged policy rejected` **cannot** be a GATE 0 item. Corrected placement:

**GATE 0 — Trust infrastructure (P0-A):**
```
trusted root accepted
forged root metadata rejected
invalid signing key rejected
revoked signing key rejected
signed command validation (valid accepted / invalid rejected / expired rejected / replayed rejected / replay-after-restart rejected)
signed update validation (signed accepted / unsigned rejected / tampered rejected / downgrade rejected)
clock-drift fails expiry closed
cross-tenant negative tests · EDR tenant binding · collector authz · response RBAC
```

**GATE 3 — Policy (P1):**
```
signed policy accepted
tampered policy rejected
forged policy rejected
expired policy rejected
policy rollback rejected
```
(This supersedes the V2 §42 GATE 0 line that listed "forged policy rejected" — moved to GATE 3.)

---

## 6. Future-compatible selective ACK

Primary model stays **contiguous watermark** (V2 §11). The ACK message is designed so a future **selective ACK** is a non-breaking extension:
```
ack {
  stream_id
  contiguous_through          // primary — everything ≤ this is durably ingested
  received_ranges[]           // OPTIONAL future field: non-contiguous accepted ranges
  missing_ranges[]            // OPTIONAL future field: gaps the server wants resent
}
```
Example: received 1001,1003,1004,1005 → `contiguous_through=1001, received_ranges=[1003-1005], missing_ranges=[1002-1002]`. First release populates only `contiguous_through`; the optional fields are reserved (next available proto field numbers) so adding selective ACK later needs no wire break. **Retransmission efficiency:** with selective ACK the agent resends only `missing_ranges` (1002) instead of everything after 1001. **event.id dedup is the invariant safety net** regardless of ACK mode — any resend that overlaps already-ingested events is de-duplicated by the `(tenant_id, event_id)` unique constraint (V2 §11), so selective vs contiguous ACK is a bandwidth optimization, never a correctness dependency. Spool cleanup remains keyed to `contiguous_through` (safe lower bound) even when selective ACK is active.

---

## 7. Trusted time recovery

Clock-health (V2 §10a) extended with a trusted-time model:
```
last_trusted_server_time        // from an authenticated channel (mTLS handshake time / signed assertion)
local_wall_time                 // OS clock (untrusted, can rollback)
monotonic_time_reference        // OS monotonic clock (cannot go backward within a boot)
signed_server_time_assertion    // optional: server-signed timestamp the agent can verify
```
Effective time for expiry checks = `last_trusted_server_time + (monotonic_now − monotonic_at_last_trust)`. This makes expiry evaluation resistant to wall-clock rollback within a boot.

**Security goals met:**
- **Clock rollback can't revive expired artifacts:** monotonic-anchored effective time ignores a backward wall-clock jump.
- **Large drift blocks destructive commands:** if `|local_wall_time − effective_time|` exceeds tolerance, or no trusted anchor exists, state = `TIME_DRIFT`/`TIME_UNKNOWN` → destructive commands fail-closed.
- **Stale update metadata stays rejected:** metadata expiry evaluated against effective time (anti-freeze holds even if wall clock is manipulated).
- **Safe recovery path exists:** the agent re-establishes `last_trusted_server_time` on the next authenticated contact (or via `signed_server_time_assertion`), then returns to `TIME_HEALTHY`.
- **Cert/TLS clock problems don't permanently strand the agent:** the mTLS handshake tolerates a bounded skew window and the recovery flow lets the agent obtain trusted time to fix its own expiry evaluation; a grace window on cert validity avoids a hard lockout, and a documented re-enroll break-glass exists if the cert is truly expired.

**State recovery:** `TIME_UNKNOWN` (no anchor yet) → block security-sensitive expiry ops, allow benign telemetry, seek anchor → on anchor: `TIME_HEALTHY` if within tolerance else `TIME_DRIFT` → `TIME_DRIFT` persists health substatus, blocks destructive ops, keeps retrying anchor.

---

## 8. Tenant defense in depth — RLS / OpenSearch evaluation

Application/service/repository tenant enforcement (V2 §8) **remains mandatory and primary.** Additional layers evaluated:

**PostgreSQL Row-Level Security (endpoint/fleet tables):**
- Benefit: DB-enforced backstop; a missed service-layer `WHERE tenant_id` cannot leak across tenants; defense in depth for the exact class of bug the audit found.
- Cost: every connection must set the tenant GUC (`SET app.tenant_id`); risk of policy/GUC misconfiguration; some ORM/Liquibase friction; harder cross-tenant admin queries need a bypass role.
- Compatibility: works with the existing Postgres + Liquibase stack; requires connection-pool tenant propagation.
- **Recommendation: ADOPT for the security-sensitive endpoint/fleet tables** (agents, commands, policies, EDR events mirror, response audit) as a backstop behind app-layer checks; defer for low-risk operational tables. DECISION REQUIRED on connection-pool tenant propagation approach.

**OpenSearch tenant enforcement (EDR events / telemetry at rest):**
- Benefit: enforces tenant scope on the log/event store where MSSP data volume lives; aligns with the existing `visibleBy.keyword` ACL convention already in the SDK.
- Cost: query-time filter injection must be centralized; document-level security / index-per-tenant tradeoffs (index-per-tenant scales indices, doc-level security adds query overhead); must integrate with the existing `v3-hive-*` index pattern and `SearchIn` ACL.
- Compatibility: **reuse the existing `visibleBy.keyword` mechanism** (already version-locked in mappings) — set `visibleBy` = owning `tenantPrefix` on every EDR event, and require the query layer to scope by it.
- **Recommendation: ADOPT via the existing `visibleBy` ACL** for endpoint/EDR datasets (lowest-friction because the mechanism already exists), rather than a new doc-level-security scheme.

Overall: keep app/service/repo checks mandatory; add PG-RLS on the sensitive relational tables and `visibleBy`-based scoping on EDR events as backstops. Do not adopt broadly if operational complexity proves unacceptable in the P0-A spike.

---

## 9. Update rollback vs anti-downgrade — distinct

Two different mechanisms, must not be conflated:

- **Remote downgrade (rejected):** a server/mirror offering `release_sequence ≤ installed` is refused (V2 §10 anti-downgrade). An attacker cannot push an old vulnerable version.
- **Local automatic rollback (allowed, constrained):** after a *failed* update, the agent may return to the **immediately previous, already-verified, known-good artifact** — the one it was running before the attempted update.

**Proving the rollback artifact was previously verified (anti-abuse):**
- The agent keeps only the **single immediately-previous artifact** it already verified (manifest signature + hash + release_sequence) at the time that version was originally installed, plus a **locally-recorded, signed install record** `{release_sequence, artifact_hash, verified_at, key_id}` in tamper-resistant local state.
- Rollback restores ONLY that recorded artifact after re-checking its stored hash against the install record. It is NOT a general "install any older version" path — an attacker cannot point rollback at an arbitrary old binary because rollback has exactly one candidate (the recorded predecessor) and validates its hash against the signed install record.
- Rollback does not lower the anti-downgrade floor for *future remote* updates below the known-good version except to the recorded predecessor; a subsequent remote update must still exceed the current (post-rollback) `release_sequence`.
- Bounded to one hop (previous known-good); deeper recovery is a re-enroll/reinstall via the signed installer, not chained local rollbacks.

---

## 10. Signed command canonicalization

**Ambiguous JSON is not signed.** Define a canonical encoding over the security-sensitive fields.

- **Recommendation: deterministic protobuf** — sign a canonical byte serialization of a dedicated `SignedCommandCore` message (proto field numbers fixed; serialize with deterministic marshaling — sorted fields, no unknown-field reordering). Rationale: the control plane is already protobuf/gRPC; avoids JSON's key-order/whitespace/number-format ambiguity; language-stable. (Alternative considered: JCS/RFC 8785 canonical JSON — rejected as it adds a second encoding discipline the stack doesn't need.)
- **Signature covers ALL security-sensitive fields:** `schema_version, command_id, tenant_id, agent_id, command_type, arguments, issued_at, expires_at, nonce, actor_id, actor_role, approval_context, incident_id, reason, key_id`. The `signature` field itself is excluded from the signed bytes; `key_id` is included so the verifier binds the signature to a specific key.
- **Strongly-typed arguments:** `arguments` is a typed per-command-type message (e.g. `KillArgs{ target: {process_entity_id, pid, process_start_time, executable_path} }`, `QuarantineArgs{ file_path }`, `IsolateArgs{ iso_type, allowed_ips[] }`), **not** an arbitrary shell/command string. This removes the current `EDR_KILL:<pid>` string-parsing surface (audit §37) and lets the signature cover structured, validated fields. Verifier rejects unknown `command_type` and malformed typed args before execution.

---

## Architecture Freeze Checklist

| # | Item | Status | Note |
|---|---|---|---|
| 1 | Command execution durable state machine (RECEIVED→…→RECONCILE_REQUIRED) + per-action reconcile + PID-reuse-safe target tuple | **READY** | design complete; P0-A T08 |
| 2 | mTLS on BOTH gRPC control and HTTP telemetry; ingest tenant from device identity | **READY** | dual-support per channel; P0-B T16 + P0-A T02 ingest binding |
| 3 | Threshold (M-of-N) root + dual-threshold root transition + emergency recovery | **DECISION REQUIRED** | choose custodian count N and threshold M (e.g. 2-of-3); HSM custody model |
| 4 | Crypto algorithm agility (key metadata; algorithm per key_id) | **READY** (mechanism) / **DECISION REQUIRED** (initial algorithm) | confirm ECDSA-P256 vs Ed25519 vs RSA-PSS after KMS/FIPS/perf/reg check |
| 5 | Phase-gate correction: forged-policy → GATE 3, trust-infra → GATE 0 | **READY** | supersedes V2 §42 GATE 0 policy line |
| 6 | Selective-ACK-ready ACK message (reserved fields) + event.id dedup invariant | **READY** | first release ships contiguous watermark only |
| 7 | Trusted-time recovery (monotonic-anchored effective time; drift fails closed; safe recovery) | **READY** | signed_server_time_assertion optional/phaseable |
| 8 | Tenant defense-in-depth: PG-RLS + OpenSearch `visibleBy` backstops | **DECISION REQUIRED** | confirm RLS connection-pool tenant propagation + spike operational cost in P0-A |
| 9 | Update local-rollback vs remote anti-downgrade separation (signed install record, one-hop) | **READY** | P0-A T10/T11 |
| 10 | Signed command canonicalization (deterministic protobuf) + typed arguments | **READY** | replaces string commands; P0-A T07 |
| — | Application/service/repository tenant enforcement (primary) | **READY** | mandatory, unchanged from V2 §8 |
| — | Root-of-trust bootstrap via signed artifact/installer | **READY** | V2 §7a; underpins items 3, 4 |

**Blocking items to resolve before P0-A implementation planning starts:** #3 (root threshold/custodian model), #4 (initial signing algorithm), #8 (RLS/OpenSearch adoption + tenant propagation). All other freeze items are READY. No item is BLOCKED (no hard external dependency); the three DECISION REQUIRED items are internal choices that can be settled in a short pre-P0-A decision session.
