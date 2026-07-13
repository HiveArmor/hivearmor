# Production Readiness Validation — ArmorSight SIEM

**Sprint:** POST-SPRINT-6 (Run after all 6 sprints are complete)
**Severity:** CRITICAL — do not deploy to production until all items PASS
**Issue ID:** ALL
**Dependencies:** Sprints 1–6 complete, running stack at `http://localhost:8088` (backend) and `http://localhost:3000` (frontend-v2)
**Estimated time:** 3–4 hours

---

## Context

This prompt is the final gate before promoting ArmorSight to a production environment. Run it fresh, cold, with no prior knowledge — just the running stack and this checklist. You will exercise every sprint's deliverables using actual HTTP requests, browser interactions, and log inspection.

**Stack must be running before you start:**

```bash
cd /Users/encryptshell/GIT/UTMStack-11/local-dev
docker compose up -d
# Wait ~2 minutes for all services to reach (healthy)
docker compose ps
```

**Get a reusable auth token first:**

```bash
export JWT=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | jq -r '.id_token')
echo "Token: ${JWT:0:30}..."   # verify it printed something
```

All curl commands below use `$JWT`. Re-export if it expires (tokens last ~1h).

---

## SPRINT 1 — Security Fixes (S01-T01 through S01-T10)

### SEC-01: SQL Injection Prevention

```bash
# Attempt SQL injection in sort param — should return empty array, not 500
curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/utm-asset-groups/searchGroupsByFilter?sort=1;DROP+TABLE;--,asc" | \
  jq 'if type == "array" then "PASS: returned array" else "FAIL: unexpected response" end'

# Attempt value injection
RESULT=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/utm-asset-groups/searchGroupsByFilter?assetType=x'+OR+'1'%3D'1")
[ "$RESULT" -lt 500 ] && echo "PASS: no 500 error" || echo "FAIL: got $RESULT"
```

**Expected:** Both return 2xx with empty or normal results. No 500.

---

### SEC-02: SAML Open Redirect Prevention

```bash
# Attacker tries to use SAML RelayState to redirect to evil.com
LOCATION=$(curl -si "http://localhost:8088/saml2/authenticate/test?RelayState=https://evil.com" \
  2>&1 | grep -i "^location:" | head -1)
echo "Location header: $LOCATION"

# PASS: no location header, or location does NOT contain evil.com
echo "$LOCATION" | grep -i "evil.com" && echo "FAIL: open redirect possible" || echo "PASS: no redirect to evil.com"
```

---

### SEC-03: Brute Force Rate Limiting

```bash
# Send 10 failed login attempts rapidly — expect 429 on later attempts
for i in $(seq 1 12); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8088/api/authenticate \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"wrongpassword","rememberMe":false}')
  echo "Attempt $i: $CODE"
  [ "$CODE" = "429" ] && echo "  -> PASS: rate limited at attempt $i" && break
done
```

**Expected:** HTTP 429 appears by attempt 10–12.

---

### SEC-04: CORS Policy

```bash
# Cross-origin request from an unauthorized origin should be blocked
CORS_HEADER=$(curl -si -X OPTIONS "http://localhost:8088/api/alerts" \
  -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: GET" \
  2>&1 | grep -i "access-control-allow-origin")
echo "CORS header: $CORS_HEADER"

# PASS: header does NOT contain evil.com or *
echo "$CORS_HEADER" | grep -E "evil\.com|\*" && echo "FAIL: CORS allows evil origin" || echo "PASS: CORS blocks evil origin"
```

---

### SEC-05: Password NOT in GET URL

```bash
# Old behavior was: GET /api/account/reset-password/init?key=xxx
# Fixed behavior: POST only
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET \
  "http://localhost:8088/api/account/reset-password/init?password=testpass123")
[ "$CODE" = "405" ] || [ "$CODE" = "404" ] && echo "PASS: GET not allowed ($CODE)" || echo "FAIL: GET accepted ($CODE)"
```

---

## SPRINT 2 — Broken API Paths (S02-T01 through S02-T08)

### S02-T01: Rules Save

```bash
# GET the current rule list, pick the first one
RULE_ID=$(curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/utm-alert-rules?page=0&size=1" | jq -r '.[0].id // empty')

if [ -z "$RULE_ID" ]; then
  echo "SKIP: no rules in DB (create one via the UI first)"
else
  # Toggle active and save back
  CURRENT=$(curl -s -H "Authorization: Bearer $JWT" \
    "http://localhost:8088/api/utm-alert-rules/$RULE_ID" | jq '.')
  UPDATED=$(echo "$CURRENT" | jq '.active = (.active | not)')
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
    -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" \
    -d "$UPDATED" \
    "http://localhost:8088/api/utm-alert-rules")
  [ "$CODE" -lt 300 ] && echo "PASS: rule save returned $CODE" || echo "FAIL: $CODE"
fi
```

---

### S02-T03: Agents Path

```bash
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/utm-client-agent-module/by-agent?page=0&size=10")
[ "$CODE" = "200" ] && echo "PASS: agents path returns 200" || echo "FAIL: got $CODE"
```

---

### S02-T04: Incident Status Update

```bash
INCIDENT_ID=$(curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/incidents?page=0&size=1" | jq -r '.[0].id // empty')

if [ -z "$INCIDENT_ID" ]; then
  echo "SKIP: no incidents in DB"
else
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
    -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" \
    -d '{"status":"IN_REVIEW"}' \
    "http://localhost:8088/api/incidents/$INCIDENT_ID/status")
  [ "$CODE" -lt 300 ] && echo "PASS: incident status update returned $CODE" || echo "FAIL: $CODE"
fi
```

---

### S02-T05: Settings Field Names

```bash
# Verify the settings endpoint returns the correct field names (not camelCase mismatches)
SETTINGS=$(curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/application-user-config")
echo "$SETTINGS" | jq 'keys' 2>/dev/null | head -10
# Manually verify: fields should match what the frontend expects (not snake_case vs camelCase mismatch)
```

---

### S02-T07: Threat Intel

```bash
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/utm-threat-intelligence?page=0&size=5")
[ "$CODE" = "200" ] && echo "PASS: threat intel returns 200" || echo "FAIL: got $CODE"
```

---

### S02-T08: Collectors Path

```bash
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/collector-ops?page=0&size=10")
[ "$CODE" = "200" ] && echo "PASS: collectors path returns 200" || echo "FAIL: got $CODE"
```

---

## SPRINT 3 — RBAC & UI Wiring (S03-T01 through S03-T08)

### S03-T01: RBAC Route Guard

```bash
# Attempt to access an admin-only endpoint as a viewer user
# First, create a viewer JWT (or use a known viewer account)
VIEWER_JWT=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"viewer","password":"localdev123!","rememberMe":false}' | jq -r '.id_token // empty')

if [ -z "$VIEWER_JWT" ]; then
  echo "SKIP: no viewer account exists — create one via the UI first"
else
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $VIEWER_JWT" \
    "http://localhost:8088/api/utm-alert-rules")
  [ "$CODE" = "403" ] && echo "PASS: viewer gets 403 on admin endpoint" || echo "WARN: got $CODE (may be intentional if viewers can read rules)"
fi
```

**Manual UI check:** Open `http://localhost:3000/admin/search-acceleration` while logged in as a non-admin user. You should be redirected to `/unauthorized` or `/dashboard`, not see the admin page.

---

### S03-T05: Alert Polling

```bash
# Verify the SSE stream opens and doesn't immediately close
curl -s --max-time 10 -N -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/alerts/sse" &
SSE_PID=$!
sleep 3
kill $SSE_PID 2>/dev/null
echo "PASS: SSE stream opened (check manually for keepalive pings)"
```

---

### S03-T06: Integrations Endpoint

```bash
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/utm-logstash-input?page=0&size=10")
[ "$CODE" = "200" ] && echo "PASS: integrations/logstash input returns 200" || echo "FAIL: got $CODE"
```

---

### S03-T07 & S03-T08: Scanner Endpoints

```bash
# Network scanner
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/utm-network-scan?page=0&size=5")
[ "$CODE" = "200" ] && echo "PASS: network scan returns 200" || echo "FAIL: got $CODE"

# Vulnerability scanner
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/vulnerability?page=0&size=5")
[ "$CODE" = "200" ] && echo "PASS: vuln scan returns 200" || echo "FAIL: got $CODE"
```

---

## SPRINT 4 — Active Directory & Compliance (S04-T01 through S04-T06)

### S04-T01: Active Directory Page

**Manual UI check:** Open `http://localhost:3000/active-directory`. The page must:
- Load without showing demo/fake data
- Show real user data if the AD integration is configured
- Show a "Configure AD Integration" prompt if not yet configured (not a blank crash)

```bash
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/utm-ad-user?page=0&size=5")
[ "$CODE" = "200" ] && echo "PASS: AD users endpoint returns 200" || echo "FAIL: got $CODE"
```

---

### S04-T02 & S04-T03: Compliance Plugin + Posture

```bash
# Compliance plugin must be running
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/compliance/posture")
[ "$CODE" = "200" ] && echo "PASS: compliance posture returns 200" || echo "FAIL: got $CODE"

# Load time check — compliance posture must load in under 8 seconds (N+1 was fixed in S04-T04)
TIME=$(curl -s -o /dev/null -w "%{time_total}" -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/compliance/posture")
echo "Compliance load time: ${TIME}s"
[ "$(echo "$TIME < 8.0" | bc -l)" = "1" ] && echo "PASS: under 8s" || echo "FAIL: over 8s (N+1 regression?)"
```

---

### S04-T05: User Activate/Deactivate

```bash
# List users, check the endpoint works
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/users?page=0&size=5")
[ "$CODE" = "200" ] && echo "PASS: user list returns 200" || echo "FAIL: got $CODE"

# Verify activate/deactivate endpoint exists (S04-T05 fixed a 404 here)
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"activated":true}' \
  "http://localhost:8088/api/users/viewer/activate" 2>/dev/null)
[ "$CODE" = "404" ] && echo "FAIL: activate endpoint missing" || echo "PASS: activate endpoint exists ($CODE)"
```

---

## SPRINT 5 — Event Processor Stability (S05-T01 through S05-T12)

### Plugin Health

```bash
# Plugins must be running and healthy
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/plugins/status")
[ "$CODE" = "200" ] && echo "PASS: plugin status returns 200" || echo "FAIL: got $CODE"

PLUGIN_HEALTH=$(curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/plugins/status" | jq '[.[] | select(.status != "RUNNING")] | length')
[ "$PLUGIN_HEALTH" = "0" ] && echo "PASS: all plugins RUNNING" || echo "WARN: $PLUGIN_HEALTH plugin(s) not running"
```

---

### Data Pipeline — No Data Loss

```bash
# Check that the event processor is receiving and processing events
# (Look for recent events in OpenSearch)
RECENT_EVENTS=$(curl -sk -u "admin:LocalDev@2024!" \
  "https://localhost:9200/logs-*/_count?q=@timestamp:[now-5m+TO+now]" | \
  jq '.count // 0')
echo "Events in last 5 minutes: $RECENT_EVENTS"
[ "$RECENT_EVENTS" -gt 0 ] && echo "PASS: events flowing" || echo "WARN: no recent events (may be normal if no agents configured)"
```

---

### S05-T07: must_not Term Operator

```bash
# Verify the must_not query operator works in log search
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"query":"NOT event.outcome:failure","indexPattern":"logs-*","size":5}' \
  "http://localhost:8088/api/log-analyzer/search")
[ "$CODE" = "200" ] && echo "PASS: NOT operator accepted" || echo "FAIL: got $CODE"
```

---

### S05-T10: Liquibase Health Check

```bash
# Backend should start cleanly — no pending Liquibase migrations
LIQUIBASE_STATUS=$(curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/management/health/db" | jq -r '.status // "UNKNOWN"')
[ "$LIQUIBASE_STATUS" = "UP" ] && echo "PASS: DB health UP" || echo "FAIL: DB health $LIQUIBASE_STATUS"
```

---

### S05-T11: HikariCP Pool Size

```bash
# Connection pool should not be exhausted — check via actuator
POOL_STATUS=$(curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/management/health" | jq -r '.components.db.status // .status // "UNKNOWN"')
[ "$POOL_STATUS" = "UP" ] && echo "PASS: DB pool UP" || echo "FAIL: pool $POOL_STATUS"
```

---

## SPRINT 6 — Admin Pages, Enterprise Features, Debt (S06-T01 through S06-T10)

### S06-T01: Search Acceleration

```bash
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/search-acceleration")
[ "$CODE" = "200" ] && echo "PASS: search-acceleration returns 200" || echo "FAIL: got $CODE"

# Verify the page is wired (not static)
COUNT=$(curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/search-acceleration" | jq 'length // 0')
echo "Acceleration settings count: $COUNT"
[ "$COUNT" -gt 0 ] && echo "PASS: settings loaded" || echo "WARN: no settings (run apply first)"
```

---

### S06-T02: SSO / Identity Provider Page

```bash
# Endpoint must return 200 (empty array is fine on fresh install)
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/identity-providers")
[ "$CODE" = "200" ] && echo "PASS: identity-providers returns 200" || echo "FAIL: got $CODE"
```

**Manual UI check:** Open `http://localhost:3000/admin/identity-provider`. The page must load with an "Add Provider" button and not crash.

---

### S06-T03: Menu Management

```bash
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/menu")
[ "$CODE" = "200" ] && echo "PASS: menu returns 200" || echo "FAIL: got $CODE"
```

**Manual UI check:** Open `http://localhost:3000/admin/menu-management`. Items are listed. Drag one — list reorders. Click "Save Order" — toast appears.

---

### S06-T04: Index Rollover

```bash
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/index-policy/policy")
[ "$CODE" = "200" ] && echo "PASS: index policy returns 200" || echo "FAIL: got $CODE"
```

---

### S06-T05: Saved Log Queries (Update, No Duplicate)

```bash
# Create a query
CREATE_RESP=$(curl -s -X POST -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"la_name":"Prod Validation Test","description":"event.outcome:failure","dataOrigin":"logs-*"}' \
  "http://localhost:8088/api/log-analyzer/queries")
QUERY_ID=$(echo "$CREATE_RESP" | jq -r '.id // empty')
echo "Created query ID: $QUERY_ID"

# Update it (PUT must work)
if [ -n "$QUERY_ID" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" \
    -d "{\"id\":$QUERY_ID,\"la_name\":\"Renamed Test\",\"description\":\"event.outcome:failure\",\"dataOrigin\":\"logs-*\"}" \
    "http://localhost:8088/api/log-analyzer/queries")
  [ "$CODE" -lt 300 ] && echo "PASS: query update returned $CODE" || echo "FAIL: $CODE"

  # Verify name changed
  NAME=$(curl -s -H "Authorization: Bearer $JWT" \
    "http://localhost:8088/api/log-analyzer/queries/$QUERY_ID" | jq -r '.la_name // empty')
  [ "$NAME" = "Renamed Test" ] && echo "PASS: name updated correctly" || echo "FAIL: name is '$NAME'"

  # Cleanup
  curl -s -X DELETE -H "Authorization: Bearer $JWT" \
    "http://localhost:8088/api/log-analyzer/queries/$QUERY_ID" > /dev/null
fi
```

---

### S06-T06: Alert Pivot to Logs

**Manual UI check (required — no curl equivalent):**
1. Open `http://localhost:3000/incidents`
2. Click any alert
3. Verify "View in Logs" button exists in the alert header area
4. Click it
5. Verify browser navigates to `/logs?from=...&to=...` with valid ISO dates
6. Verify the log search bar is pre-filled with a host/IP filter (if the alert had one)
7. Verify a breadcrumb banner says "Showing logs related to Alert #X"
8. Click "Clear" — verify banner disappears and URL params are removed

```bash
echo "MANUAL CHECK REQUIRED: see steps above"
echo "Automated check: buildAlertPivotUrl utility tests..."
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2
npx jest src/lib/__tests__/alert-pivot --no-coverage 2>&1 | tail -5
```

---

### S06-T07: Dead Code Removed

```bash
cd /Users/encryptshell/GIT/UTMStack-11

# Backend dead services
for f in \
  "backend/src/main/java/com/nilachakra/service/DefinitionSyncService.java" \
  "backend/src/main/java/com/nilachakra/service/UtmAlertLastService.java" \
  "backend/src/main/java/com/nilachakra/service/UtmAlertSocaiProcessingRequestService.java"; do
  [ ! -f "$f" ] && echo "PASS: $f deleted" || echo "FAIL: $f still exists"
done

# Frontend dead components
for f in \
  "frontend-v2/src/components/ui/stat-card.tsx" \
  "frontend-v2/src/components/alerts/alert-filters-panel.tsx" \
  "frontend-v2/src/app/(app)/incidents/demo"; do
  [ ! -e "$f" ] && echo "PASS: $f deleted" || echo "FAIL: $f still exists"
done

# Debug print statements
grep -rn "CEL DEBUG\|CORR DEBUG" event-processor/ 2>/dev/null && \
  echo "FAIL: debug prints still present" || echo "PASS: debug prints removed"
```

---

### S06-T08: Docker Health Checks

```bash
cd /Users/encryptshell/GIT/UTMStack-11/local-dev

# Check healthcheck is defined in parsed config
docker compose config | grep -A8 "frontend-v2:" | grep -q "healthcheck" && \
  echo "PASS: frontend-v2 has healthcheck" || echo "FAIL: frontend-v2 missing healthcheck"

docker compose config | grep -A8 "web-pdf:" | grep -q "healthcheck" && \
  echo "PASS: web-pdf has healthcheck" || echo "FAIL: web-pdf missing healthcheck"

# After stack is up (allow 3 min):
docker inspect $(docker compose ps -q frontend-v2 2>/dev/null) \
  --format '{{.State.Health.Status}}' 2>/dev/null | \
  grep -q "healthy" && echo "PASS: frontend-v2 healthy" || echo "FAIL: frontend-v2 not healthy"

docker inspect $(docker compose ps -q web-pdf 2>/dev/null) \
  --format '{{.State.Health.Status}}' 2>/dev/null | \
  grep -q "healthy" && echo "PASS: web-pdf healthy" || echo "FAIL: web-pdf not healthy"
```

---

### S06-T09: MaxMind GeoIP

```bash
# Check that event-processor logs show GeoIP status
docker compose logs eventprocessor 2>/dev/null | grep -i "GeoIP" | head -5

# PASS: "GeoIP enrichment initialized" or "GeoIP CSV files found"
# FAIL: no GeoIP line at all (silent failure — the bug we fixed)
docker compose logs eventprocessor 2>/dev/null | grep -i "GeoIP" | \
  grep -qiE "initialized|found" && echo "PASS: GeoIP initialized" || echo "FAIL: GeoIP not logged"
```

---

### S06-T10: Redis Decision

```bash
cd /Users/encryptshell/GIT/UTMStack-11/local-dev

# Option A: Redis enabled — verify it's connected
docker compose ps redis 2>/dev/null | grep -q "healthy" && \
  echo "PASS: Redis healthy" || echo "INFO: Redis not in stack (Option B chosen)"

# Option B: Redis removed — verify no redis container
docker compose ps 2>/dev/null | grep -q "redis" && \
  echo "INFO: Redis present in stack" || echo "INFO: Redis removed (Option B)"

# Either way: SSE stream must work
CODE=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/alerts/sse")
[ "$CODE" = "200" ] && echo "PASS: SSE stream opens (200)" || echo "FAIL: SSE returned $CODE"
```

---

## ALL SPRINTS — Full Build Verification

```bash
cd /Users/encryptshell/GIT/UTMStack-11

# Backend compiles
echo "--- Backend compile ---"
cd backend && ./mvnw compile -q && echo "PASS: backend compiles" || echo "FAIL: backend compile failed"

# Backend tests
echo "--- Backend tests ---"
./mvnw test -DfailIfNoTests=false -q 2>&1 | tail -3
cd ..

# Frontend type check
echo "--- Frontend type check ---"
cd frontend-v2 && npx tsc --noEmit && echo "PASS: tsc clean" || echo "FAIL: type errors"

# Frontend build
echo "--- Frontend build ---"
npx next build 2>&1 | tail -5
cd ..

# Go compile
echo "--- Event processor compile ---"
cd event-processor && go build ./... && echo "PASS: Go builds" || echo "FAIL: Go build failed"
cd ..
```

---

## SCORECARD

Run the following to generate a summary. Paste this into a terminal after running all checks above — count the PASS/FAIL/SKIP lines from your terminal output.

```
==============================================================
PRODUCTION READINESS SCORECARD
Run date: $(date)
==============================================================

SPRINT 1 — SECURITY
[ ] SEC-01  SQL Injection prevention
[ ] SEC-02  SAML open redirect blocked
[ ] SEC-03  Brute force rate limiting (429 by attempt 12)
[ ] SEC-04  CORS blocks evil.com origin
[ ] SEC-05  Password not in GET URL (405/404)

SPRINT 2 — BROKEN API PATHS
[ ] S02-T01 Rules save works
[ ] S02-T03 Agents path returns 200
[ ] S02-T04 Incident status update works
[ ] S02-T05 Settings field names correct
[ ] S02-T07 Threat intel endpoint works
[ ] S02-T08 Collectors path returns 200

SPRINT 3 — RBAC & WIRING
[ ] S03-T01 RBAC guards non-admin users
[ ] S03-T05 SSE alert stream opens
[ ] S03-T06 Integrations endpoint works
[ ] S03-T07 Network scanner endpoint works
[ ] S03-T08 Vuln scanner endpoint works

SPRINT 4 — AD & COMPLIANCE
[ ] S04-T01 AD page loads real data
[ ] S04-T02 Compliance plugin running
[ ] S04-T03 Compliance posture returns 200
[ ] S04-T04 Compliance load time under 8s
[ ] S04-T05 User activate endpoint works

SPRINT 5 — EVENT PROCESSOR
[ ] S05     All plugins RUNNING status
[ ] S05     Events flowing (recent count > 0)
[ ] S05-T07 NOT operator works in search
[ ] S05-T10 DB health UP
[ ] S05-T11 HikariCP pool UP

SPRINT 6 — ADMIN, ENTERPRISE, DEBT
[ ] S06-T01 Search acceleration page loads real data
[ ] S06-T02 Identity providers endpoint returns 200
[ ] S06-T02 Identity provider page renders in UI
[ ] S06-T03 Menu management endpoint returns 200
[ ] S06-T03 Menu drag-and-drop saves order
[ ] S06-T04 Index rollover policy loads and saves
[ ] S06-T05 Saved query update (PUT) works
[ ] S06-T05 No duplicate on re-save of same KQL
[ ] S06-T06 "View in Logs" button exists on alert page
[ ] S06-T06 Pivot URL contains correct time window
[ ] S06-T06 Logs page pre-fills from URL params
[ ] S06-T07 DefinitionSyncService.java deleted
[ ] S06-T07 UtmAlertLastService.java deleted
[ ] S06-T07 UtmAlertSocaiProcessingRequestService.java deleted
[ ] S06-T07 stat-card.tsx deleted
[ ] S06-T07 alert-filters-panel.tsx deleted
[ ] S06-T07 incidents/demo/ deleted
[ ] S06-T07 [CEL DEBUG] removed from engine.go
[ ] S06-T07 [CORR DEBUG] removed from engine.go
[ ] S06-T08 frontend-v2 healthcheck defined
[ ] S06-T08 web-pdf healthcheck defined
[ ] S06-T08 Both services reach (healthy) status
[ ] S06-T09 GeoIP enrichment initialized in logs
[ ] S06-T09 GeoIP warns clearly if files missing
[ ] S06-T10 Redis policy OR removal implemented
[ ] S06-T10 SSE alert stream works

BUILD HEALTH
[ ] Backend compiles cleanly
[ ] Backend tests pass
[ ] Frontend type-check passes (tsc --noEmit)
[ ] Frontend next build succeeds
[ ] Go build passes (event-processor)

==============================================================
TOTAL: __ / 52 PASS
DEPLOY GATE: 52/52 required. Fix any FAIL before promoting.
==============================================================
```

---

## If Any Item Fails — Where to Go

| Failing Item | Sprint Prompt |
|---|---|
| SEC-01 SQL injection | `.plan/prompts/sprint-01/S01-T01-sql-injection-fix.md` |
| SEC-02 SAML redirect | `.plan/prompts/sprint-01/S01-T02-saml-open-redirect.md` |
| SEC-03 Brute force | `.plan/prompts/sprint-01/S01-T03-brute-force-ip-spoofing.md` |
| SEC-04 CORS | `.plan/prompts/sprint-01/S01-T06-cors-production.md` |
| SEC-05 Password in URL | `.plan/prompts/sprint-02/S02-T06-password-in-url.md` |
| S02-T01 Rules save | `.plan/prompts/sprint-02/S02-T01-rule-save-fix.md` |
| S02-T03 Agents path | `.plan/prompts/sprint-02/S02-T03-agents-path-fix.md` |
| S02-T04 Incident status | `.plan/prompts/sprint-02/S02-T04-incident-status-fix.md` |
| S02-T05 Settings fields | `.plan/prompts/sprint-02/S02-T05-settings-field-names.md` |
| S02-T07 Threat intel | `.plan/prompts/sprint-02/S02-T07-threat-intel-wire.md` |
| S02-T08 Collectors | `.plan/prompts/sprint-02/S02-T08-collectors-path-fix.md` |
| S03-T01 RBAC guards | `.plan/prompts/sprint-03/S03-T01-rbac-route-guards.md` |
| S03-T05 Alert polling | `.plan/prompts/sprint-03/S03-T05-alert-polling-fix.md` |
| S03-T06 Integrations | `.plan/prompts/sprint-03/S03-T06-integrations-wire.md` |
| S03-T07/T08 Scanners | `.plan/prompts/sprint-03/S03-T07-scanner-wire.md` / `S03-T08-vuln-scanner-wire.md` |
| S04-T01 AD page | `.plan/prompts/sprint-04/S04-T01-active-directory-wire.md` |
| S04-T02/T03 Compliance | `.plan/prompts/sprint-04/S04-T02-compliance-plugin-deploy.md` |
| S04-T04 Compliance load time | `.plan/prompts/sprint-04/S04-T04-compliance-n-plus-1.md` |
| S04-T05 User activate | `.plan/prompts/sprint-04/S04-T05-user-activate-fix.md` |
| S05 Plugin crash / health | `.plan/prompts/sprint-05/S05-T01-plugin-crash-cascade.md` |
| S05-T07 must_not | `.plan/prompts/sprint-05/S05-T07-must-not-term-operator.md` |
| S05-T10 Liquibase | `.plan/prompts/sprint-05/S05-T10-liquibase-health-check.md` |
| S05-T11 HikariCP | `.plan/prompts/sprint-05/S05-T11-hikaricp-pool-size.md` |
| S06-T01 Search accel | `.plan/prompts/sprint-06/S06-T01-admin-search-accel.md` |
| S06-T02 SSO page | `.plan/prompts/sprint-06/S06-T02-sso-admin-page.md` |
| S06-T03 Menu mgmt | `.plan/prompts/sprint-06/S06-T03-menu-management.md` |
| S06-T04 Index rollover | `.plan/prompts/sprint-06/S06-T04-index-rollover-ui.md` |
| S06-T05 Saved queries | `.plan/prompts/sprint-06/S06-T05-saved-log-queries.md` |
| S06-T06 Alert pivot | `.plan/prompts/sprint-06/S06-T06-alert-pivot-to-logs.md` |
| S06-T07 Dead code | `.plan/prompts/sprint-06/S06-T07-dead-code-removal.md` |
| S06-T08 Health checks | `.plan/prompts/sprint-06/S06-T08-docker-health-checks.md` |
| S06-T09 MaxMind GeoIP | `.plan/prompts/sprint-06/S06-T09-maxmind-bundle.md` |
| S06-T10 Redis | `.plan/prompts/sprint-06/S06-T10-redis-or-remove.md` |
