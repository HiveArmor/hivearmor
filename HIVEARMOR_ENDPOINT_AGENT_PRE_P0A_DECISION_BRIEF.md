# HIVEARMOR ENDPOINT SENSOR PLATFORM — PRE-P0-A DECISION BRIEF

> Date: 2026-09-09 · **DECISION SUPPORT ONLY — no code, no migrations, no `.proto`, no commits.**
> Resolves the three `DECISION REQUIRED` items from `HIVEARMOR_ENDPOINT_AGENT_ARCHITECTURE_FREEZE_ADDENDUM.md` (checklist #3, #4, #8) so P0-A implementation planning can begin. Each item: context → options with tradeoffs → recommendation → what the decision unblocks. These are internal architecture choices; none has an external blocker.

---

## DECISION 1 — Root-of-trust threshold & custodian model (Freeze #3)

### Context
The immutable trust root (freeze §3) signs/authorizes the four intermediates (Device CA, Command, Update, Policy signing). A single root key is a single point of catastrophic compromise: whoever holds it can mint any trust. We must choose **N** (number of root keys/custodians) and **M** (signatures required = threshold), and where the keys live.

### Options
| Option | Model | Pros | Cons |
|---|---|---|---|
| A | Single root key (1-of-1) in one KMS | simplest ops | one compromise/loss = platform-wide catastrophe; no dual-threshold transition possible; **fails the freeze §3 requirement** |
| B | **2-of-3 threshold, 3 separate HSM/KMS custodians** | any 1 key compromise or loss survivable; enables dual-threshold root transition; industry norm for signing roots | needs 3 custody locations + a signing ceremony for root ops (rare events) |
| C | 3-of-5 threshold, 5 custodians | tolerates 2 compromises/losses | heavier ceremony; overkill for current org size; slower emergency recovery |

### Recommendation — **Option B: 2-of-3.**
Rationale: 2-of-3 is the smallest model that (a) survives one lost or compromised custodian, (b) satisfies the freeze §3 **dual-threshold transition** (old-quorum AND new-quorum must sign a root change), and (c) keeps the signing ceremony light enough to actually run correctly. Custody split: e.g. cloud KMS (primary) + a second cloud/region KMS + an offline HSM held by security leadership; intermediates (Device CA, Command, Update, Policy) each get their own key in KMS/HSM, rotated via root-signed metadata. Root operations are rare (rotation, emergency revocation), so ceremony cost is acceptable.
- **Unblocks:** freeze #3 → READY; underpins #4 (algorithm applies per key) and the whole signed-command/update/policy chain (T04, T05 in the P0-A master table).
- **Follow-through:** a one-page root-key ceremony + custody runbook (who holds which custodian, how a signing session runs, emergency-revocation steps) authored during P0-A T42.

---

## DECISION 2 — Initial signing algorithm (Freeze #4)

### Context
Algorithm agility is already designed in (per-`key_id` metadata, freeze §4) — this decision only picks the **default** initial algorithm for the four signing purposes; others remain addable without a wire change. Selection criteria: KMS/HSM support, FIPS requirements, performance, customer/regulatory constraints. HiveArmor targets **enterprise IT, government, and MSSP** (per project overview) — government/MSSP strongly implies FIPS may be contractually required.

### Options
| Option | Algorithm | KMS/HSM support | FIPS 140-3 | Performance | Fit |
|---|---|---|---|---|---|
| A | **ECDSA P-256** | broadest — every major KMS/HSM (AWS KMS, GCP KMS, Azure, PKCS#11 HSM) | mature/validated | fast (ample for command/policy/update volume) | best breadth for gov/MSSP |
| B | Ed25519 | growing but uneven KMS/HSM coverage; some KMS lack it | FIPS status newer/less universally accepted | fastest verify | great where KMS supports it and FIPS not mandated |
| C | RSA-PSS (3072) | universal | mature/validated | slower, larger sigs | fallback / legacy-HSM compatibility |

### Recommendation — **Option A: ECDSA P-256 as the default**, with Ed25519 permitted per-deployment where the KMS supports it and FIPS is not required.
Rationale: given government/MSSP targets, **broadest KMS/HSM support + established FIPS validation** outweigh Ed25519's speed edge — verification cost is not a bottleneck at command/policy/update volumes. The agility model (freeze §4) means a FIPS-exempt, performance-sensitive deployment can select Ed25519 by key metadata without a code fork, and RSA-PSS stays available for legacy HSMs. Apply P-256 to all four purposes (Device CA, Command, Update, Policy signing) for a uniform default.
- **Unblocks:** freeze #4 → READY; sets the default for T04/T05/T07/T10/T26.
- **Follow-through:** confirm the chosen production KMS/HSM's P-256 signing + attestation support during the P0-A T05 spike; record FIPS-mode requirement per customer tier.

---

## DECISION 3 — Tenant defense-in-depth adoption (Freeze #8)

### Context
Application/service/repository tenant checks are mandatory and primary (V2 §8) — this decision is only about the **backstop layers**, because the audit found the exact bug class (un-scoped agent reads, untenanted EDR events) that a DB/store-enforced backstop would have caught. Two backstops evaluated: PostgreSQL Row-Level Security (relational fleet tables) and OpenSearch tenant scoping (EDR/telemetry at rest).

### Options
| Option | Scope | Benefit | Cost / risk |
|---|---|---|---|
| A | App-layer only (no backstop) | simplest; no infra change | a single missed `WHERE tenant_id` leaks across tenants — this is precisely the audited defect; weakest for gov/MSSP |
| B | **PG-RLS on sensitive relational tables + `visibleBy` ACL on EDR events** | DB/store-enforced backstop for the highest-value datasets; `visibleBy` already exists in the SDK (reuse, low friction); catches the audited bug class | RLS needs per-connection tenant GUC propagation through the pool; EDR ingest must set `visibleBy`; modest complexity, scoped to sensitive tables |
| C | RLS/tenant enforcement on ALL tables + doc-level security everywhere | maximal | high operational complexity, cross-tenant admin friction, query overhead; over-engineered for low-risk operational tables |

### Recommendation — **Option B: targeted backstops.**
Apply **PG-RLS to the security-sensitive relational tables** (agents, agent_commands, policies, response/command audit, any EDR-event mirror) as a backstop behind the app-layer checks; enforce **OpenSearch tenant scope via the existing `visibleBy.keyword` ACL** on EDR/telemetry events (set `visibleBy = owning tenantPrefix` at ingest, require the query layer to scope by it). Do NOT blanket-apply to low-risk operational tables. Reuse of the existing `visibleBy` mechanism (already version-locked in mappings, per project constraints) makes the OpenSearch side low-cost; RLS is scoped to the tables where a leak actually matters.
- **Open sub-decision (settle in P0-A spike):** connection-pool tenant propagation for RLS — set `app.tenant_id` GUC per checkout/transaction. Confirm the chosen approach and measure operational cost in a short P0-A spike before committing RLS fleet-wide.
- **Unblocks:** freeze #8 → READY (with the propagation approach confirmed in-spike); backstops T01/T02 tenant work.

---

## Decision summary

| # | Item | Recommended decision | Residual action |
|---|---|---|---|
| 1 | Root threshold/custody | **2-of-3 threshold, 3 HSM/KMS custodians** | author root ceremony + custody runbook (T42) |
| 2 | Initial signing algorithm | **ECDSA P-256 default**, agility retained (Ed25519/RSA-PSS per key metadata) | confirm KMS P-256 support + FIPS-mode per customer tier in T05 spike |
| 3 | Tenant defense-in-depth | **PG-RLS on sensitive relational tables + `visibleBy` ACL on EDR events**; app-layer stays primary | confirm RLS connection-pool tenant propagation in a P0-A spike |

With these three settled, all Architecture Freeze Checklist items move to **READY** and P0-A implementation planning can begin. Each recommendation is reversible/adjustable within the agility and layering designs already frozen (algorithm is per-key metadata; backstops are additive; root threshold can grow to 3-of-5 later without re-architecting).
