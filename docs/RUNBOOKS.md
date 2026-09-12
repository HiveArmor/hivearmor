# HiveArmor Runbooks

Central index of operator / SRE runbooks. Each entry links the runbook, states who runs
it and when, and whether it requires a code change (most do not — they are Postgres
roles, environment variables, and verification gates).

> New runbooks: add them to the correct section below and link the file. Keep the RLS
> enablement pair (backend + agent-manager) together — they are independent databases and
> both must be done to close tenant isolation at the database layer.

---

## Tenant isolation — Row-Level Security (RLS) enablement

HiveArmor enforces tenant isolation at two layers: application-layer scoping (already
live) and PostgreSQL RLS (shipped but **inert** until an operator provisions unprivileged
roles). There are **two independent databases**, each with its own runbook — enabling one
does not enable the other.

| Runbook | Database | What it does | Code change? |
|---|---|---|---|
| [`HIVEARMOR_BACKEND_RLS_PILOT_ENABLEMENT_RUNBOOK.md`](../HIVEARMOR_BACKEND_RLS_PILOT_ENABLEMENT_RUNBOOK.md) | `hivearmor` (backend) | Backfill `tenant_id` → provision `hivearmor_app` (unprivileged) + `hivearmor_migrator` (BYPASSRLS) → verify with the T18 matrix. Activates the #281/#282 pilot on the 4 EDR/response tables. | No |
| [`HIVEARMOR_A2_7_MANAGER_RLS_ENABLEMENT_RUNBOOK.md`](../HIVEARMOR_A2_7_MANAGER_RLS_ENABLEMENT_RUNBOOK.md) | `hivearmor_agents` (agent-manager) | Provision `hivearmor_agents_app` (unprivileged, table-owner) + `hivearmor_agents_system` (BYPASSRLS) → wire `DB_USER`/`DB_SYSTEM_USER` → staging canary (T-BOOT/T-CANARY) → rollout. Activates the A2-7 policies (#290–#294). | No |
| [`HIVEARMOR_A2_6_RLS_ROLE_PROVISIONING.md`](../HIVEARMOR_A2_6_RLS_ROLE_PROVISIONING.md) | reference | Role-provisioning design of record (unprivileged app role + BYPASSRLS migrator, the GUC aspect ordering). Both runbooks above build on it. | No |

**Golden rule for both:** the app must connect as a **non-superuser, non-BYPASSRLS** role,
or the RLS policies are a silent no-op. Rollback for either is instant — revert the app
datasource to the superuser role and RLS goes dormant, with app-layer scoping still
protecting every path.

**Acceptance gate (both):** `HIVEARMOR_P0A1_T18_CROSS_TENANT_TEST_MATRIX.md` — the
cross-tenant test matrix; the canary (app role, no tenant GUC → zero rows) is the proof
RLS actually bites.

---

## Platform operations

| Runbook | Scope | Notes |
|---|---|---|
| [`docs/PLATFORM-OWNER-RUNBOOK.md`](./PLATFORM-OWNER-RUNBOOK.md) | Platform owner ops | General platform-owner operational procedures. |
| [`docs/EVENT-PROCESSOR.md`](./EVENT-PROCESSOR.md) | Event processor | Technical reference for the core Go correlation engine. |
| [`docs/TEST-PLAN.md`](./TEST-PLAN.md) | Event processor | Feature test plan. |
| [`docs/ai-handoff/bedrock-operating-guide.md`](./ai-handoff/bedrock-operating-guide.md) | AI / Bedrock | Operating precautions for Codex with Amazon Bedrock. |

---

## Detection engineering

| Runbook | Scope | Notes |
|---|---|---|
| [`HIVEARMOR_GRAPH_RULE_CALIBRATION_RUNBOOK.md`](../HIVEARMOR_GRAPH_RULE_CALIBRATION_RUNBOOK.md) | Graph-offense rules `9125–9128` | Calibrate the Neo4j graph-rule thresholds against a real, populated graph before relying on the alerts. Uses the read-only `event-processor/cmd/graph-calibrate` tool (reports each metric's P90/P95/P99 + a recommended threshold). No code change — thresholds live in the rule YAML. |

---

## Conventions

- **RLS enablement docs** live at repo root as `HIVEARMOR_*_RUNBOOK.md` (alongside the
  P0-A1/P0-A2 programme docs and `HIVEARMOR_A2_6_RLS_ROLE_PROVISIONING.md`).
- **Platform / component runbooks** live under `docs/`.
- Every enablement runbook ends with an **acceptance checklist** and a **rollback**
  section; keep that shape for new ones.
