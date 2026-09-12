# HiveArmor — Graph-Offense Rule Threshold Calibration Runbook

**Applies to:** the `graph_offense` detection rules `9125–9128` (and any future
graph rule) in `rules/enterprise-pack/`.
**Audience:** detection engineers / SOC operators enabling the Neo4j graph pack.
**Status of the rules:** shipped as **staging candidates** with *guessed* starting
thresholds. This runbook is how you replace those guesses with data-driven values
before you rely on the alerts.

---

## 1. Why calibration is required

Each graph rule fires when a graph metric crosses a threshold, e.g.:

| Rule | Metric | Shipped threshold |
|------|--------|-------------------|
| 9125 GRAPH-PRIV-USER-HOST-FANOUT | distinct hosts a privileged user logged into (2h) | ≥ 8 |
| 9126 GRAPH-HOST-MANY-RISKY-EXTERNAL | distinct risk-scored external IPs a host talked to (3h) | ≥ 4 |
| 9127 GRAPH-SHARED-IP-MANY-ACCOUNTS | distinct accounts authenticating from one IP (1h) | ≥ 6 |
| 9128 GRAPH-NEW-EXTERNAL-MULTI-HOST | distinct hosts contacting a <1-day-old external IP (4h) | ≥ 2 |

The "right" threshold depends entirely on **your** environment — a jump host that
100 admins use, a CI runner that clones from one egress IP, a monitoring box that
touches many externals — so a single shipped constant is a guess. Calibration
measures the **actual distribution** of each metric on your graph and sets the
threshold above normal activity.

**Prerequisite:** the Neo4j entity graph must already be populated by the
event-processor's graph-enrichment pipeline over a **representative window** of
normal activity (ideally 1–2 weeks of steady state, no active incident). Calibrating
against an empty or freshly-seeded graph is meaningless.

---

## 2. Run the calibrator (read-only)

`event-processor/cmd/graph-calibrate` runs the *denominator* of each rule (its
MATCH/WITH, without the `>= N` cut and without the alert LIMIT) and reports the
observed distribution. It **only reads** the graph.

```bash
cd event-processor
NEO4J_PASSWORD='<pw>' go run ./cmd/graph-calibrate/ \
  --uri http://<neo4j-host>:7474 \
  --user neo4j
  # --margin 1.25   (default; recommended threshold = ceil(P99 × margin))
```

Flags fall back to the same env vars the engine uses: `NEO4J_URI`, `NEO4J_USER`,
`NEO4J_PASSWORD`. Point it at the **same** Neo4j the graph evaluator reads.

Example output:

```
── 9126 (GRAPH-HOST-MANY-RISKY-EXTERNAL)
   metric: distinct risk-scored external IPs per host (3h)
   n=1840  min=1  median=1  P90=2  P95=3  P99=6  max=41
   current threshold: 4
   RECOMMENDED (ceil P99×1.25): 8  → RAISE from 4 (current would over-fire on normal activity)
```

---

## 3. Choose the threshold

The recommendation is `ceil(P99 × margin)`. Read it as a starting point, not gospel:

1. **Start at the recommended value.** P99 means "only the top 1% of normal keys
   reach here"; the margin lifts you clear of that tail.
2. **Sanity-check the max.** If `max` is far above P99, inspect those top keys in
   the Neo4j Browser — they are either the loud-but-benign infrastructure you must
   exclude (add them to a DET-FP exception), or they are already the offenses you
   want to catch (then a lower threshold is fine).
3. **Trade FP vs sensitivity with the margin.** Alert-fatigue-averse SOC → higher
   margin (fewer, higher-confidence alerts). Coverage-first → margin nearer 1.0
   (threshold ≈ P99), accepting more review volume.
4. **Never drop below the floor of 2** (the tool enforces this) — a graph
   "fan-out" of 1 is not a pattern.
5. **Re-run seasonally.** Estates grow; re-calibrate quarterly or after major
   onboarding.

---

## 4. Apply the threshold

Edit the rule's `cypherQuery` in `rules/enterprise-pack/91NN-*.yml` — change the
single `WHERE <metric> >= N` value. Example for 9126:

```cypher
  WITH h, count(DISTINCT ip) AS riskyPeers, collect(DISTINCT ip.address)[0..8] AS sampleIPs
  WHERE riskyPeers >= 8      // was 4 — calibrated to P99×1.25 on <date>
```

Then:

```bash
cd event-processor && go run ./cmd/validate-schema/ --rules ../rules/   # must stay 0 failed
```

Open a PR, note the calibration date + the observed P99 in the body, and — since
these are staging rules — get a human detection-engineer sign-off before promoting
out of staging.

---

## 5. Validate the tuned rule still fires on a true positive

After raising a threshold, confirm you did not tune past real attacks: run the
rule's full `cypherQuery` in the Neo4j Browser against a graph seeded with a known
offense (see the synthetic seed under the PR that added these rules), or replay a
past incident's window. The `graph-validate` tool (`cmd/graph-validate`) loads the
rules and, with a reachable Neo4j, executes them.

---

## 6. Notes

- The calibrator is **read-only** and touches only Neo4j — it adds no load to the
  event-processor and does not write to the graph.
- Thresholds live in the rule YAML, not in code — no rebuild/redeploy of the engine
  is needed to re-tune, only a rules reload.
- If a metric shows `no grouping keys matched in-window`, the graph is empty for that
  relationship/window — populate it or widen the window before trusting any number.
