# Search & Hunt — Backend Contract Spec (non-AI)

_Author: Kiro · Date: 2026-09-07 · Feature: Search & Hunt (`/search`) · AI parts excluded (tracked in
`AI-BACKEND-WORK-SPEC.md`)._

This is the detailed backend contract for the Search & Hunt page after its recent redesign. It is
written to be handed straight to a backend implementer. Frontend contract source of truth:
`frontend-v3/src/pages/search-hunt/searchHunt.service.ts` + `searchHunt.types.ts`.

---

## 0. Summary — what's needed

**Almost everything already exists on the backend.** Of the 20 endpoints this page calls, 19 are
already implemented in `HaHuntResource` / `HaHuntSavedResource` / `HaHuntActionsResource` /
`HaHuntPromotionApprovalResource` / `HaSearchResource` / `SavedQueryResource`. The work is:

1. **NET-NEW — one endpoint: server-side result aggregation for the Metric view** (§2). This is the
   only genuinely missing backend contract for this page.
2. **WIRE-TO-REAL — confirm the existing search/field-stats/export endpoints run real OpenSearch
   queries** against `v3-hive-*` (not fixtures/stubs), and that response shapes match §3.
3. No other new endpoints. No AI endpoints in scope.

All paths are under base `/api` (Vite proxies `/api/*`). All data reads hit **OpenSearch**
(`v3-hive-<type>-YYYY.MM.DD`, version-locked pattern, SDK index builders only); saved-hunts /
history / saved-queries / promotion approvals persist in **PostgreSQL** (Liquibase).

---

## 1. Endpoints already implemented (confirm real, don't rebuild)

| # | Method + Path | Purpose | Store | Status |
|---|---|---|---|---|
|1|POST `/api/ha-hunts/search`|Run a KQL hunt; returns searchId + first page + histogram|OS|exists — confirm real PIT/search_after query|
|2|DELETE `/api/ha-hunts/search/{searchId}`|Cancel search / release PIT|OS|exists|
|3|GET `/api/ha-hunts/search/{searchId}/status`|Search diagnostics + query plan|OS|exists|
|4|GET `/api/ha-hunts/search/{searchId}/stream` (SSE)|Live progress (`search.progress/partial/completed`)|OS|exists — auth via header, token NOT in URL|
|5|GET `/api/ha-hunts/schema`|Field catalog for query builder / field browser|OS mapping|exists|
|6|GET `/api/ha-hunts/search/{searchId}/fields/{field}/values`|Field value facets (`cursor,limit=10,q`)|OS|exists|
|7|GET `/api/ha-hunts/search/{searchId}/field-stats`|Per-field coverage % + cardinality over the snapshot|OS|exists — confirm real, not stub|
|8|GET `/api/ha-hunts/events/{eventId}`|Event detail (`view=highlighted\|raw`, or `views=normalized,raw,pivots,permissions`)|OS|exists|
|9|GET `/api/ha-hunts/query-capabilities`|Operators/functions/field-types/limits/examples|static/PG|exists|
|10|POST `/api/ha-hunts/actions/preview`|Preview promote→evidence/investigation/incident (returns previewToken, approvalRequired)|OS+PG|exists|
|11|POST `/api/ha-hunts/actions`|Execute promotion|PG|exists|
|12|POST `/api/ha-hunts/approvals` (+ GET `/{id}`, POST `/{id}/decision`)|SOC-Manager approval flow|PG|exists|
|13|GET/POST `/api/ha-hunts/saved`, PATCH/DELETE `/{huntId}`|Saved-hunt CRUD|PG|exists|
|14|GET/DELETE `/api/ha-hunts/history`|Run history list / clear|PG|exists|
|15|POST `/api/ha-hunts/search/export` + GET `/api/ha-hunts/search/export/{exportId}/manifest`|Forensic CSV/NDJSON export + chain-of-custody manifest|OS+PG|exists — confirm real stream|
|16|GET `/api/ha-search/timeline`|Legacy timeline search used by `executeSearch`|OS|exists|
|17|GET/POST/DELETE `/api/ha-saved-queries[/{id}]`|Saved-query CRUD (distinct from saved-hunts)|PG|exists|

**Not in scope (AI — deferred):** `POST /api/ha-search/nl-to-dsl`, `GET /api/ha-search/suggestions`,
`POST /api/ha-search/nl-query`, and everything under `/api/ha-hunts/ai/*`.

---

## 2. NET-NEW — Metric view server-side aggregation

### Why
The redesigned Metric view (`HuntMetricsView.tsx`) currently aggregates **client-side over only the
rows already loaded on the page** (typically <=100-500). It states this honestly in the UI:
> "Summarising the N loaded rows of ~M matched — narrow the query for a full-set summary."

For a real Splunk-style Statistics/Visualization view, the metrics must reflect the **entire matched
result set**, not just the loaded page. That requires an OpenSearch aggregation on the server. This
is the one genuinely missing backend contract for this page.

### New endpoint
```
POST /api/ha-hunts/search/aggregate
```
- **Auth:** `@PreAuthorize` — same roles as `/ha-hunts/search` (SOC_ANALYST/ANALYST/SOC_MGR/ADMIN),
  tenant-scoped (`X-Tenant-ID` / authorized scope). ACL via `visibleBy.keyword` like every hunt read.
- **Store:** OpenSearch. Reuse the same query the search runs, then attach `terms` + `cardinality`
  aggregations instead of returning hits. The alert-queue controller already does OpenSearch `terms`
  aggregations (`HaAlertQueueResource` — `org.opensearch.client.opensearch._types.aggregations.*`),
  so copy that pattern.

### Request body
```jsonc
{
  "query": "event.category:authentication and event.outcome:failure",
  "language": "kql",
  "timeRange": { "from": "2026-09-06T00:00:00Z", "to": "2026-09-07T00:00:00Z" },
  "tenantScope": "authorized",
  "indexPattern": "v3-hive-log-*",        // optional; defaults to authorized scope
  // Which breakdowns to compute. Server caps each terms agg (topN, default 8, max 50).
  "breakdowns": [
    { "field": "severity",   "size": 5 },
    { "field": "dataSource", "size": 8 },
    { "field": "action",     "size": 8 },
    { "field": "host",       "size": 8 },
    { "field": "user",       "size": 8 }
  ]
}
```
Notes:
- The `query`/`language`/`timeRange`/`tenantScope`/`indexPattern` fields are IDENTICAL in meaning to
  `POST /ha-hunts/search`, so the same query-build path is reused — the aggregate is "the same search,
  counted instead of listed."
- `breakdowns[].field` must be an aggregatable field from `/ha-hunts/schema` (reject or return
  `state:"unavailable"` for a non-aggregatable/unauthorized field rather than 500).

### Response body
```jsonc
{
  "searchId": "hunt-abc123",             // may reuse the caller's existing searchId/PIT if passed
  "totalApproximate": 48213,             // total MATCHED docs (the honest full-set number)
  "totalIsExact": false,
  "snapshotAt": "2026-09-07T05:30:00Z",
  "kpis": {
    "events": 48213,                     // = totalApproximate
    "withAlerts": 1204,                  // docs where alertCount > 0 (filtered value_count)
    "distinctHosts": 372,                // cardinality agg on host
    "distinctUsers": 288                 // cardinality agg on user
  },
  "breakdowns": [
    {
      "field": "severity",
      "state": "available",              // available | high_cardinality | unavailable | redacted
      "otherCount": 0,                   // matched docs not in the topN buckets
      "buckets": [
        { "value": "critical", "count": 431, "countIsExact": true,
          "includeQuery": "severity:\"critical\"", "excludeQuery": "not severity:\"critical\"" },
        { "value": "high",     "count": 2900, "countIsExact": true,
          "includeQuery": "severity:\"high\"",     "excludeQuery": "not severity:\"high\"" }
        // …up to size buckets
      ]
    }
    // …one object per requested breakdown, same order as request
  ],
  "partialFailures": [ { "source": "v3-hive-log-2026.09.01", "code": "shard_timeout", "message": "…" } ]
}
```
Contract rules that keep the UI honest:
- `includeQuery` / `excludeQuery` are **server-generated, escaped KQL fragments** (same convention
  already used by `/fields/{field}/values` and event-detail highlighted fields) so the Metric view's
  drill-down click (`onDrill(field, value)`) narrows the search safely — the FE must never build KQL
  from a raw value.
- `otherCount` lets the UI show "+N more" honestly instead of implying the topN is the whole set.
- `countIsExact:false` + `totalIsExact:false` where OpenSearch returns approximate counts (shard
  doc-count error / sampling) — surface it, don't round it away.
- Same expiry semantics as search: if a passed `searchId` PIT is gone, return **410
  `HUNT_SEARCH_EXPIRED`** / **404 `HUNT_SEARCH_NOT_FOUND`** as a ProblemDetail (the FE already
  detects these codes and offers "run the hunt again").

### Frontend wiring (small, after the endpoint lands)
- Add `fetchHuntAggregates(request)` to `searchHunt.service.ts` (fixture-mode branch returns a
  fixture like the other calls).
- `HuntMetricsView` gains an optional `aggregates` prop; when present it renders server totals
  (full matched set) and drops the "loaded rows only" scope note; when absent it keeps today's
  client-side fallback so nothing regresses.

---

## 3. WIRE-TO-REAL — confirm existing endpoints return real data

These endpoints EXIST but must be confirmed to run genuine OpenSearch queries (the frontend audit
found stub/partial signals elsewhere in hunt; verify here):
- **`POST /ha-hunts/search`** — real PIT + `search_after` cursor paging over `v3-hive-*`; `histogram`
  is a real `date_histogram`; `totalApproximate`/`totalIsExact` real; `partialFailures` populated
  from shard failures.
- **`GET /ha-hunts/search/{searchId}/field-stats`** — real per-field `coverage` (% docs with the
  field) and `cardinality` over the snapshot, not placeholders.
- **`POST /ha-hunts/search/export`** — streams the real matched set as CSV/NDJSON with a real
  `X-Export-Id`, and the manifest carries a real `sha256` + `record_count` for chain-of-custody.

No shape changes needed for these — only "is it real data" verification.

---

## 4. Conventions the implementer must follow
- New endpoint: base `/api`, path `/ha-hunts/search/aggregate`, package `com.hivearmor`, add
  `@PreAuthorize`, tenant-scope + `visibleBy.keyword` ACL like the other hunt reads.
- OpenSearch index names via SDK builders only; `v3-hive-<type>-YYYY.MM.DD` is version-locked.
- Errors as `ProblemDetail`; reuse the existing `HaHuntExceptionHandler` codes
  (`HUNT_SEARCH_EXPIRED`, `HUNT_SEARCH_NOT_FOUND`).
- No new DB table needed (aggregation is read-only over OpenSearch).
- Follow the existing aggregation code in `HaAlertQueueResource` (terms + cardinality) as the model.

---

## 5. Acceptance checklist
- [ ] `POST /api/ha-hunts/search/aggregate` returns full-matched-set KPIs + topN breakdowns with
      `otherCount` and escaped include/exclude KQL, tenant-scoped, PIT-expiry-aware.
- [ ] Metric view shows the full matched set (no "loaded rows only" caveat when aggregates present).
- [ ] Drill-down click narrows the search using the server-provided `includeQuery`.
- [ ] `/ha-hunts/search`, `/field-stats`, `/search/export` confirmed running real OpenSearch queries.
- [ ] gates green: `tsc` 0, `lint` 0 errors, `lint:css` clean, backend `mvn` build + `liquibase:validate`
      (no schema change expected), tests pass.
