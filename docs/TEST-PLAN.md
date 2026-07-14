# HiveArmor Event Processor — Feature Test Plan

This document provides step-by-step test cases for every engine component. Each test is self-contained: prerequisite state, exact commands, and pass/fail criteria are fully specified so tests can be run independently and repeated.

---

## Prerequisites

**Local stack running:**
```bash
cd local-dev
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
```

**Environment variables (set in shell for test commands):**
```bash
export OS_URL="https://localhost:9200"
export OS_CRED="admin:${OPENSEARCH_INITIAL_ADMIN_PASSWORD}"
export ENGINE_URL="http://localhost:8090"
```

**Verify engine is up:**
```bash
curl -s http://localhost:8000/health
# Expected: {"status":"ok"} or similar 200 response
```

**Verify OpenSearch is up:**
```bash
curl -sk -u "${OS_CRED}" "${OS_URL}/_cluster/health" | jq .status
# Expected: "green" or "yellow"
```

---

## Section 1: Health and Startup

### T-001 — Engine health endpoint

```bash
curl -sf http://localhost:8000/health
```

**Pass**: HTTP 200, body contains `"ok"` or `"status":"running"`.

### T-002 — Ingest endpoint reachable

```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{"dataType":"linux","dataSource":"test","tenantID":"default","raw":"test"}'
```

**Pass**: HTTP 200 or 202. HTTP 4xx/5xx = fail.

---

## Section 2: Pipeline Operators

Test each operator in isolation. For each test: inject a raw event, wait 7 seconds, query OpenSearch for the expected field.

### Helper function
```bash
inject_and_check() {
  local raw="$1"
  local query_field="$2"
  local expected_value="$3"
  curl -s -X POST http://localhost:8090/v1/inject \
    -H "Content-Type: application/json" \
    -d "{\"dataType\":\"linux\",\"dataSource\":\"test\",\"tenantID\":\"default\",\"raw\":\"${raw}\"}"
  sleep 7
  RESULT=$(curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_log-linux-*/_search" \
    -H "Content-Type: application/json" \
    -d "{\"query\":{\"match\":{\"${query_field}\":\"${expected_value}\"}},\"size\":1}" | jq -r '.hits.total.value')
  [ "$RESULT" -gt 0 ] && echo "PASS" || echo "FAIL (expected ${expected_value} in ${query_field})"
}
```

### T-101 — JSON operator

**Setup**: Ensure `$WORK_DIR/pipeline/filters/linux.yaml` contains a `json` step targeting a JSON raw field.

**Inject:**
```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "linux",
    "dataSource": "test-server",
    "tenantID": "default",
    "raw": "{\"eventID\": \"4688\", \"processName\": \"cmd.exe\", \"commandLine\": \"whoami\"}"
  }'
sleep 7
curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_log-linux-*/_search?q=log.eventID:4688&size=1" | jq '.hits.hits[0]._source | {eventID: .log.eventID, processName: .log.processName}'
```

**Pass**: `log.eventID = "4688"`, `log.processName = "cmd.exe"` visible in result.

### T-102 — Grok operator

**Inject** a raw syslog line:
```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "linux",
    "dataSource": "test-server",
    "tenantID": "default",
    "raw": "Jul  8 12:34:56 myhost sshd[9999]: Failed password for root from 192.168.100.50 port 22 ssh2"
  }'
sleep 7
```

**Check:**
```bash
curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_log-linux-*/_search?q=origin.ip:192.168.100.50&size=1" | jq '.hits.hits[0]._source | {origin_ip: ."origin.ip", message: .log.message}'
```

**Pass**: `origin.ip = "192.168.100.50"`, `log.message` contains "Failed password for root".

### T-103 — KV operator

**Inject** a key=value format log:
```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "linux",
    "dataSource": "test-kv",
    "tenantID": "default",
    "raw": "action=login user=alice src_ip=10.10.10.10 result=success"
  }'
sleep 7
```

**Check:**
```bash
curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_log-linux-*/_search?q=log.user:alice&size=1" | jq '.hits.hits[0]._source.log'
```

**Pass**: `log.action = "login"`, `log.user = "alice"`, `log.src_ip = "10.10.10.10"`, `log.result = "success"`.

### T-104 — Rename operator

**Setup**: Parser YAML has `rename` step: `from: [log.src_ip]  to: origin.ip`.

**Inject** event with `log.src_ip`:
```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{"dataType":"linux","dataSource":"test","tenantID":"default","raw":"{\"src_ip\":\"172.16.0.5\"}"}'
sleep 7
```

**Check:**
```bash
curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_log-linux-*/_search?q=origin.ip:172.16.0.5&size=1" | jq '.hits.hits[0]._source."origin.ip"'
```

**Pass**: `"172.16.0.5"` returned. `log.src_ip` should NOT appear.

### T-105 — Add operator (conditional)

**Setup**: Parser YAML has `add` step: `field: severity  value: "high"  where: 'contains("log.message", "CRITICAL")'`.

**Inject matching event:**
```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{"dataType":"linux","dataSource":"test","tenantID":"default","raw":"CRITICAL: disk full on /dev/sda1"}'
sleep 7
```

**Pass**: Document has `severity = "high"`.

**Inject non-matching event:**
```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{"dataType":"linux","dataSource":"test","tenantID":"default","raw":"INFO: normal operation"}'
sleep 7
```

**Pass**: Document does NOT have `severity = "high"`.

### T-106 — Drop operator

**Setup**: Parser YAML has `drop` step: `where: 'contains("raw", "health-check")'`.

**Count before:**
```bash
BEFORE=$(curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_log-linux-*/_count" | jq .count)
```

**Inject drop-matching event:**
```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{"dataType":"linux","dataSource":"test","tenantID":"default","raw":"GET /health-check HTTP/1.1 200"}'
sleep 7
```

**Check:**
```bash
AFTER=$(curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_log-linux-*/_count" | jq .count)
[ "$BEFORE" -eq "$AFTER" ] && echo "PASS (event dropped)" || echo "FAIL (count increased to ${AFTER})"
```

### T-107 — Dynamic operator (geolocation)

**Setup**: Parser YAML has `dynamic` step targeting `com.hivearmor.geolocation` on `origin.ip`.

**Inject event with public IP:**
```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{"dataType":"linux","dataSource":"test","tenantID":"default","raw":"login from 8.8.8.8 port 22","originIP":"8.8.8.8"}'
sleep 7
```

**Check:**
```bash
curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_log-linux-*/_search?q=origin.ip:8.8.8.8&size=1" | jq '.hits.hits[0]._source.origin'
```

**Pass**: `origin.geo.country` or `origin.geo.city` is populated with non-empty string.

---

## Section 3: CEL Rule Evaluation

### T-201 — Single-event rule fires

**Inject** a Windows credential dumping event (rule 2001: eventID 4688 + mimikatz in commandLine):
```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "wineventlog",
    "dataSource": "dc01",
    "tenantID": "default",
    "raw": "{\"EventID\":\"4688\",\"NewProcessName\":\"C:\\\\mimikatz.exe\",\"CommandLine\":\"mimikatz sekurlsa::logonpasswords\"}",
    "log": {"eventID": "4688", "processName": "C:\\mimikatz.exe", "commandLine": "sekurlsa::logonpasswords"}
  }'
sleep 3
```

**Check:**
```bash
curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_alert-*/_search?q=name:*Credential*&size=1" | jq '.hits.hits[0]._source | {name, technique, severity}'
```

**Pass**: Alert exists with name containing "Credential" or "Mimikatz", technique "T1003", severity 3.

### T-202 — CEL `contains` with string path (correct syntax)

This test verifies the go-sdk CEL transform works correctly. The rule WHERE must use string literal paths, not map access.

**Correct**: `contains("log.message", "Failed password")`
**Wrong**: `contains(log["message"], "Failed password")`

**Inject** an SSH failure:
```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "linux",
    "dataSource": "test-server",
    "tenantID": "default",
    "raw": "Jul  8 10:00:01 server sshd[1234]: Failed password for invalid user admin from 1.2.3.4 port 22222 ssh2",
    "log": {"message": "Failed password for invalid user admin from 1.2.3.4 port 22222 ssh2"}
  }'
sleep 3
```

Check engine logs for `ok=true` (if debug prints still active) or simply verify that sufficient events accumulate to trigger rule 1001 (test T-301 below).

### T-203 — CEL `safe` with default prevents nil panic

**Inject** an event missing the `origin.ip` field:
```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "linux",
    "dataSource": "test-server",
    "tenantID": "default",
    "raw": "Jul  8 10:00:01 server sshd[1234]: Failed password for root from  port 22 ssh2"
  }'
sleep 3
```

**Pass**: No crash in engine logs. Event may or may not generate an alert (acceptable), but engine continues processing.

### T-204 — Rule with no matching dataType does NOT fire

**Inject** a linux event, verify that a `wineventlog`-only rule (e.g., rule 2001) does NOT generate an alert:
```bash
BEFORE=$(curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_alert-*/_search?q=name:*Windows*&size=0" | jq .hits.total.value)
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{"dataType":"linux","dataSource":"test","tenantID":"default","raw":"linux-only event"}'
sleep 3
AFTER=$(curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_alert-*/_search?q=name:*Windows*&size=0" | jq .hits.total.value)
[ "$BEFORE" -eq "$AFTER" ] && echo "PASS" || echo "FAIL (Windows alert fired on Linux event)"
```

---

## Section 4: Correlation (Threshold) Detection

### T-301 — SSH brute force correlation (5+ failures from same IP in 10 min)

**This is the canonical E2E test** — the full inject → parse → correlate → alert → frontend pipeline.

**Step 1**: Inject 4 SSH failures from test IP (won't trigger yet):
```bash
for i in 1 2 3 4; do
  curl -s -X POST http://localhost:8090/v1/inject \
    -H "Content-Type: application/json" \
    -d "{
      \"dataType\": \"linux\",
      \"dataSource\": \"test-server\",
      \"tenantID\": \"default\",
      \"raw\": \"Jul  8 10:00:0${i} server sshd[1234]: Failed password for root from 203.0.113.100 port 22 ssh2\",
      \"originIP\": \"203.0.113.100\",
      \"log\": {\"message\": \"Failed password for root from 203.0.113.100 port 22 ssh2\"}
    }"
  sleep 1
done
```

**Step 2**: Wait for BulkQueue flush:
```bash
sleep 7
```

**Step 3**: Verify 4 events in OpenSearch:
```bash
curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_log-linux-*/_search?q=origin.ip:203.0.113.100&size=0" | jq .hits.total.value
# Expected: 4
```

**Step 4**: Inject the 5th (trigger) event:
```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "linux",
    "dataSource": "test-server",
    "tenantID": "default",
    "raw": "Jul  8 10:00:05 server sshd[1234]: Failed password for root from 203.0.113.100 port 22 ssh2",
    "originIP": "203.0.113.100",
    "log": {"message": "Failed password for root from 203.0.113.100 port 22 ssh2"}
  }'
sleep 3
```

**Step 5**: Check for alert:
```bash
curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_alert-*/_search?q=name:*Brute*+AND+adversary.ip:203.0.113.100&size=1" \
  | jq '.hits.hits[0]._source | {name, technique, severity, adversary}'
```

**Pass**: Alert exists with:
- `name` contains "Brute Force"
- `adversary.ip = "203.0.113.100"`
- `technique = "T1110.003"`
- `severity` = 2 or higher

**Frontend check**: Open `http://localhost:3000/alerts` — alert should appear at top of list.

### T-302 — Correlation does NOT fire below threshold

**Inject 4 failures from a different IP** (below the threshold of 5):
```bash
for i in 1 2 3 4; do
  curl -s -X POST http://localhost:8090/v1/inject \
    -H "Content-Type: application/json" \
    -d "{\"dataType\":\"linux\",\"dataSource\":\"test\",\"tenantID\":\"default\",\"raw\":\"Failed password from 198.51.100.99\",\"originIP\":\"198.51.100.99\",\"log\":{\"message\":\"Failed password from 198.51.100.99\"}}"
  sleep 0.5
done
sleep 7
```

**Check:**
```bash
COUNT=$(curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_alert-*/_search?q=adversary.ip:198.51.100.99&size=0" | jq .hits.total.value)
[ "$COUNT" -eq 0 ] && echo "PASS (no alert)" || echo "FAIL (alert fired below threshold)"
```

### T-303 — Correlation time window expiry

**Inject 4 failures, wait past the time window (10m + buffer), inject 5th:**
```bash
# Inject 4 events
for i in 1 2 3 4; do
  curl -s -X POST http://localhost:8090/v1/inject \
    -H "Content-Type: application/json" \
    -d "{\"dataType\":\"linux\",\"dataSource\":\"test\",\"tenantID\":\"default\",\"raw\":\"Failed password from 192.0.2.50\",\"originIP\":\"192.0.2.50\",\"log\":{\"message\":\"Failed password from 192.0.2.50\"}}"
  sleep 0.5
done
sleep 7  # Wait for flush

# Simulate time window expiry by checking correlation returns count < 5 after 10 min
# (Manual test: wait 10+ minutes, then inject 5th)
echo "Wait 10+ minutes, then run the 5th inject below to verify no alert fires:"
echo 'curl -s -X POST http://localhost:8090/v1/inject -H "Content-Type: application/json" -d '"'"'{"dataType":"linux","dataSource":"test","tenantID":"default","raw":"Failed password from 192.0.2.50","originIP":"192.0.2.50","log":{"message":"Failed password from 192.0.2.50"}}'"'"
```

**Pass**: No brute-force alert fires after the 10-minute window expires.

### T-304 — Windows failed login correlation (rule 2002)

```bash
for i in 1 2 3 4 5; do
  curl -s -X POST http://localhost:8090/v1/inject \
    -H "Content-Type: application/json" \
    -d "{\"dataType\":\"wineventlog\",\"dataSource\":\"dc01\",\"tenantID\":\"default\",\"raw\":\"{}\",\"originIP\":\"10.0.0.50\",\"log\":{\"eventID\":\"4625\",\"targetUser\":\"Administrator\"}}"
  sleep 0.5
done
sleep 7
curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_alert-*/_search?q=name:*Windows*Failed*&size=1" | jq '.hits.hits[0]._source.name'
```

**Pass**: Alert with name containing "Windows" and "Failed" or "Login" exists.

---

## Section 5: Alert Deduplication and Grouping

### T-401 — Duplicate alert suppression

**Run T-301 to generate a brute-force alert for `203.0.113.100`.**

Then inject another 5 failures from the same IP:
```bash
for i in 1 2 3 4; do
  curl -s -X POST http://localhost:8090/v1/inject \
    -H "Content-Type: application/json" \
    -d '{"dataType":"linux","dataSource":"test","tenantID":"default","raw":"Failed password from 203.0.113.100","originIP":"203.0.113.100","log":{"message":"Failed password from 203.0.113.100"}}'
  sleep 0.5
done
sleep 7
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{"dataType":"linux","dataSource":"test","tenantID":"default","raw":"Failed password from 203.0.113.100","originIP":"203.0.113.100","log":{"message":"Failed password from 203.0.113.100"}}'
sleep 3
```

**Check:**
```bash
COUNT=$(curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_alert-*/_search?q=adversary.ip:203.0.113.100+AND+name:*Brute*&size=0" | jq .hits.total.value)
echo "Alert count for 203.0.113.100: ${COUNT}"
```

**Pass**: Count is 1 (dedup suppressed the second alert within the 7-day window).

### T-402 — Alert groupBy creates parent/child relationship

**Inject two different-type alerts for the same adversary IP** and verify they get linked under a common parent:

```bash
# Alert 1: brute force (see T-301 for full flow)
# Alert 2: service installation
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{"dataType":"wineventlog","dataSource":"dc01","tenantID":"default","raw":"{}","originIP":"203.0.113.100","log":{"eventID":"4697","serviceName":"evil-svc","commandLine":"C:\\evil.exe"}}'
sleep 3
```

**Check:**
```bash
curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_alert-*/_search?q=adversary.ip:203.0.113.100&size=5" | jq '[.hits.hits[]._source | {name, parentAlertId}]'
```

**Pass**: At least one alert has a non-null `parentAlertId` field pointing to the earlier alert's ID.

---

## Section 6: Writer and Index Correctness

### T-501 — Events written to correct daily index

```bash
TODAY=$(date +%Y.%m.%d)
curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_log-linux-${TODAY}/_count" | jq .count
```

**Pass**: Count > 0 (events from earlier tests are in today's index).

### T-502 — Flat and nested fields both stored

```bash
DOC=$(curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_log-linux-*/_search?q=origin.ip:203.0.113.100&size=1" | jq '.hits.hits[0]._source')
FLAT=$(echo $DOC | jq -r '."origin.ip"')
NESTED=$(echo $DOC | jq -r '.origin.ip')
echo "Flat: ${FLAT}   Nested: ${NESTED}"
```

**Pass**: Both `"origin.ip"` (flat key) and `.origin.ip` (nested object path) return the same IP value.

### T-503 — Alerts written to correct daily index

```bash
TODAY=$(date +%Y.%m.%d)
curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_alert-${TODAY}/_count" | jq .count
```

**Pass**: Count matches the number of alerts generated in Section 4 tests.

---

## Section 7: Hot-Reload

### T-601 — Pipeline YAML hot-reload (no restart)

**Step 1**: Add a new `add` step to an existing filter YAML:
```yaml
# Append to existing linux.yaml steps:
- type: add
  field: test.hotreload
  value: "yes_this_works"
```

**Step 2**: Wait 35 seconds (one full poll cycle + buffer):
```bash
sleep 35
```

**Step 3**: Inject an event and verify new field:
```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{"dataType":"linux","dataSource":"test","tenantID":"default","raw":"hotreload test event"}'
sleep 7
curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_log-linux-*/_search?q=test.hotreload:yes_this_works&size=1" | jq '.hits.total.value'
```

**Pass**: Count = 1. Revert the YAML change after the test.

### T-602 — Rule YAML hot-reload (no restart)

**Step 1**: Add a test rule to `$WORK_DIR/rules/test-hotreload.yaml`:
```yaml
- id: 9999
  dataTypes: [linux]
  name: "TEST: Hot Reload Rule"
  impact: [adversary]
  category: "Test"
  technique: "T0000"
  where: 'contains("raw", "HOTRELOAD_TRIGGER_XYZ")'
  riskScore: 5
```

**Step 2**: Wait 35 seconds, then inject trigger event:
```bash
sleep 35
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{"dataType":"linux","dataSource":"test","tenantID":"default","raw":"HOTRELOAD_TRIGGER_XYZ"}'
sleep 3
```

**Step 3**: Check engine logs for rule 9999 evaluation, or check alerts:
```bash
curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_alert-*/_search?q=name:*Hot+Reload*&size=1" | jq '.hits.total.value'
```

**Pass**: Alert count = 1 (or risk score incremented if riskScore-only rule). Delete the test rule file after the test.

---

## Section 8: Enterprise Features

### T-701 — Risk scoring accumulation

**Inject multiple low-risk events** (riskScore-type rules must be defined in rule YAML):
```bash
for i in $(seq 1 15); do
  curl -s -X POST http://localhost:8090/v1/inject \
    -H "Content-Type: application/json" \
    -d "{\"dataType\":\"linux\",\"dataSource\":\"test\",\"tenantID\":\"default\",\"raw\":\"Failed password from 10.0.99.1\",\"originIP\":\"10.0.99.1\",\"log\":{\"message\":\"Failed password from 10.0.99.1\"}}"
  sleep 0.3
done
sleep 7
```

**Check risk scores index:**
```bash
curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_risk-scores-*/_search?q=key:10.0.99.1&size=1" | jq '.hits.hits[0]._source'
```

**Pass**: Document exists with `key = "10.0.99.1"` and `score > 0`.

### T-702 — Offense engine groups related alerts

**Prerequisite**: At least 3 alerts for the same `adversary.ip` (e.g., from T-301 and T-304 using the same IP).

**Check:**
```bash
curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_offense-*/_search&size=5" | jq '[.hits.hits[]._source | {name, adversary, alertCount}]'
```

**Pass**: At least one offense document exists with `alertCount >= 3`.

### T-703 — Lookup table enrichment

**Step 1**: Seed an asset record:
```bash
curl -sk -u "${OS_CRED}" -X PUT "${OS_URL}/_v3_hive_lookup-assets/_doc/1" \
  -H "Content-Type: application/json" \
  -d '{"ip":"10.0.1.100","hostname":"web-server-01","criticality":"high","business_unit":"ecommerce"}'
```

**Step 2**: Inject event from that IP:
```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{"dataType":"linux","dataSource":"test","tenantID":"default","raw":"login from 10.0.1.100","originIP":"10.0.1.100"}'
sleep 7
```

**Step 3**: Verify enrichment:
```bash
curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_log-linux-*/_search?q=origin.ip:10.0.1.100&size=1" | jq '.hits.hits[0]._source | {"asset.hostname": .["asset.hostname"], "asset.criticality": .["asset.criticality"]}'
```

**Pass**: `asset.hostname = "web-server-01"`, `asset.criticality = "high"`.

### T-704 — Anomaly baseline detection

**This test requires waiting for the baseline goroutine to run (15 min interval in production). For test purposes, inject a burst:**

```bash
# Inject 100 events rapidly (well above normal baseline)
for i in $(seq 1 100); do
  curl -s -X POST http://localhost:8090/v1/inject \
    -H "Content-Type: application/json" \
    -d '{"dataType":"linux","dataSource":"test","tenantID":"default","raw":"anomaly test event"}' &
done
wait
sleep 20
```

**Check:**
```bash
curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_alert-*/_search?q=category:Anomaly&size=1" | jq '.hits.hits[0]._source.name'
```

**Pass**: An anomaly alert exists (name contains "Anomaly" or "Unusual Volume"). Note: requires `anomalyDetect: true` in at least one rule and baseline data for comparison.

### T-705 — Sequence detection (multi-step)

**Prerequisite**: A sequence rule defined in YAML, e.g.:
```yaml
sequence:
  - where: 'contains("log.message", "Failed password")'
    within: 30s
  - where: 'contains("log.message", "session opened")'
    within: 5m
```

**Step 1**: Inject the first step event:
```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{"dataType":"linux","dataSource":"test","tenantID":"default","raw":"Failed password for root from 10.0.0.99 port 22","originIP":"10.0.0.99","log":{"message":"Failed password for root from 10.0.0.99"}}'
sleep 2
```

**Step 2**: Inject the second step (within time window):
```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{"dataType":"linux","dataSource":"test","tenantID":"default","raw":"session opened for user root from 10.0.0.99","originIP":"10.0.0.99","log":{"message":"session opened for user root from 10.0.0.99"}}'
sleep 3
```

**Check:**
```bash
curl -sk -u "${OS_CRED}" "${OS_URL}/_v3_hive_alert-*/_search?q=adversary.ip:10.0.0.99+AND+category:*Sequence*&size=1" | jq '.hits.hits[0]._source.name'
```

**Pass**: Sequence alert fired.

**Negative test (out of order)**: Inject step 2 before step 1 — no alert should fire.

---

## Section 9: Docker Integration

### T-801 — Engine starts cleanly in Docker

```bash
docker compose -f local-dev/docker-compose.yml -f local-dev/docker-compose.override.yml up -d eventprocessor
sleep 30
docker compose -f local-dev/docker-compose.yml -f local-dev/docker-compose.override.yml ps eventprocessor
```

**Pass**: Status shows `healthy` (healthcheck passes `curl -sf http://localhost:8000/health`).

### T-802 — Engine reconnects after OpenSearch restart

```bash
# Stop OpenSearch
docker compose -f local-dev/docker-compose.yml stop opensearch
sleep 10
# Restart OpenSearch
docker compose -f local-dev/docker-compose.yml start opensearch
sleep 30
# Verify engine is still healthy
curl -sf http://localhost:8000/health && echo "PASS" || echo "FAIL"
```

**Pass**: Health endpoint returns 200 after OpenSearch comes back.

### T-803 — Inject endpoint available inside Docker network

```bash
# From inside the docker network (e.g., via docker exec)
docker exec -it $(docker ps -qf name=eventprocessor) curl -s http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{"dataType":"linux","dataSource":"docker-test","tenantID":"default","raw":"docker network test"}'
```

**Pass**: HTTP 200/202 response.

---

## Section 10: Real Agent Path (Unix Socket)

### T-901 — Events processed via engine_server.sock

This test requires the inputs plugin running and connecting to the unix socket.

**Check socket exists:**
```bash
docker exec -it $(docker ps -qf name=eventprocessor) ls -la /workdir/sockets/engine_server.sock
```

**Pass**: Socket file exists.

**Check inputs plugin connecting:**
```bash
docker compose -f local-dev/docker-compose.yml logs inputs --tail=20 | grep -i "connected\|engine"
```

**Pass**: Inputs plugin log shows connection to engine socket.

**Send real event via agent** (requires an agent registered and connected):
- Register a test agent via the HiveArmor frontend at `http://localhost:3000`
- Verify events from that agent appear in `_v3_hive_log-*`

---

## Section 11: Regression Tests (Run After Any Engine Change)

Run all of the following after any commit to `event-processor/`:

| Test ID | Description | Expected result |
|---|---|---|
| T-001 | Health endpoint | HTTP 200 |
| T-002 | Ingest endpoint reachable | HTTP 200/202 |
| T-101 | JSON parse | Fields extracted |
| T-102 | Grok parse + IP extraction | `origin.ip` extracted |
| T-201 | Single-event rule fires | Alert in OpenSearch |
| T-301 | Brute force correlation | Alert after 5th event |
| T-302 | Below threshold — no alert | No alert |
| T-401 | Dedup suppression | 1 alert not 2 |
| T-501 | Events in daily index | Count > 0 |
| T-502 | Flat + nested fields stored | Both accessible |
| T-601 | Parser hot-reload | New field within 35s |
| T-602 | Rule hot-reload | New rule fires within 35s |

Automated script (run from repo root):

```bash
#!/bin/bash
# regression-test.sh
set -euo pipefail

BASE="http://localhost:8090"
OS="https://localhost:9200"
OS_CRED="admin:${OPENSEARCH_INITIAL_ADMIN_PASSWORD}"
PASS=0; FAIL=0

check() {
  local name="$1"; local cmd="$2"; local expected="$3"
  actual=$(eval "$cmd" 2>/dev/null)
  if [[ "$actual" == *"$expected"* ]]; then
    echo "  PASS: $name"; ((PASS++))
  else
    echo "  FAIL: $name (got: $actual)"; ((FAIL++))
  fi
}

echo "=== HiveArmor Regression Suite ==="
check "T-001 health" "curl -sf $BASE/../health" "ok"
check "T-002 ingest" "curl -s -o/dev/null -w '%{http_code}' -X POST $BASE/v1/inject -H 'Content-Type: application/json' -d '{\"dataType\":\"linux\",\"dataSource\":\"test\",\"tenantID\":\"default\",\"raw\":\"test\"}'" "20"

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
```

---

## Known Timing Constraints

| Component | Delay | Impact on tests |
|---|---|---|
| BulkQueue flush | 5s (or 500 docs) | Always sleep 7s after inject before OpenSearch check |
| Rule hot-reload | 30s poll | Sleep 35s after editing rule YAML |
| Pipeline hot-reload | 30s poll | Sleep 35s after editing pipeline YAML |
| Baseline goroutine | 15 min | T-704 requires waiting or forcing a goroutine tick |
| Docker healthcheck | 30s start_period + 15s interval | T-801 wait 30s after start |