#!/usr/bin/env bash
#
# PR-C — Investigation Pivot (Crosstab) OpenSearch correctness verification.
#
# Validates the HaHuntCrosstabPlanner query mechanics against a REAL local OpenSearch, using a
# crafted, production-faithful dataset (text-with-keyword mapping). The hunt test convention here is
# plain JUnit with no Testcontainers, so these correctness cases (approximate top-N, non-additive
# totals, per-type Stage-B, and the mandatory exclusion-intersection) run here rather than as unit
# tests — they need a live cluster.
#
# Reproduces the exact query shapes the planner issues:
#   Stage A  — eligible-scope filter (exists row AND exists col) + terms discovery + cardinality.
#   Stage B  — bool.filter[members] + nested terms matrix + keyed `filters` selected-member totals.
#   Exclude  — NOT (A AND B): removes the intersection only, never A!=x AND B!=y.
#
# Usage:  bash local-dev/verify-crosstab.sh
# Env:    OS (default https://localhost:9200), OS_AUTH (default admin:LocalDev@2024!)
#
# Exits non-zero if any assertion fails. Cleans up its test index on exit.
set -euo pipefail

OS="${OS:-https://localhost:9200}"
OS_AUTH="${OS_AUTH:-admin:LocalDev@2024!}"
IDX="v3-hive-log-crosstab-verify"
R="user.name.keyword"
C="source.geo.country.keyword"
fail=0

cleanup() { curl -sk -u "$OS_AUTH" -X DELETE "$OS/$IDX" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "== seeding crafted dataset into $IDX =="
curl -sk -u "$OS_AUTH" -X DELETE "$OS/$IDX" >/dev/null 2>&1 || true
curl -sk -u "$OS_AUTH" -X PUT "$OS/$IDX" -H 'Content-Type: application/json' -d '{
 "mappings":{"properties":{
   "@timestamp":{"type":"date"},
   "user.name":{"type":"text","fields":{"keyword":{"type":"keyword","ignore_above":256}}},
   "source.geo.country":{"type":"text","fields":{"keyword":{"type":"keyword","ignore_above":256}}},
   "host.name":{"type":"text","fields":{"keyword":{"type":"keyword","ignore_above":256}}},
   "source.ip":{"type":"ip"},
   "user.roles":{"type":"text","fields":{"keyword":{"type":"keyword","ignore_above":256}}}
 }}}' >/dev/null

curl -sk -u "$OS_AUTH" -X POST "$OS/$IDX/_bulk?refresh=true" -H 'Content-Type: application/x-ndjson' --data-binary '
{"index":{}}
{"@timestamp":"2026-09-08T10:00:00Z","user.name":"alice","source.geo.country":"RU","host.name":"H1","source.ip":"10.0.0.1","user.roles":["admin","backup"]}
{"index":{}}
{"@timestamp":"2026-09-08T10:01:00Z","user.name":"alice","source.geo.country":"RU","host.name":"H1","source.ip":"10.0.0.1"}
{"index":{}}
{"@timestamp":"2026-09-08T10:02:00Z","user.name":"alice","source.geo.country":"IN","host.name":"H2","source.ip":"10.0.0.2"}
{"index":{}}
{"@timestamp":"2026-09-08T10:03:00Z","user.name":"bob","source.geo.country":"RU","host.name":"H1","source.ip":"10.0.0.1"}
{"index":{}}
{"@timestamp":"2026-09-08T10:04:00Z","user.name":"bob","source.geo.country":"IN","host.name":"H3","source.ip":"10.0.0.3"}
{"index":{}}
{"@timestamp":"2026-09-08T10:05:00Z","user.name":"carol","host.name":"H9","source.ip":"10.0.0.9"}
' >/dev/null

assert() { # assert <label> <actual> <expected>
  if [ "$2" = "$3" ]; then echo "  PASS  $1  ($2)"; else echo "  FAIL  $1  expected=$3 actual=$2"; fail=1; fi
}

echo "== Stage A: eligible scope + discovery =="
A=$(curl -sk -u "$OS_AUTH" "$OS/$IDX/_search" -H 'Content-Type: application/json' -d "{
 \"size\":0,\"track_total_hits\":true,
 \"aggs\":{\"eligible\":{\"filter\":{\"bool\":{\"filter\":[{\"exists\":{\"field\":\"$R\"}},{\"exists\":{\"field\":\"$C\"}}]}},
   \"aggs\":{\"row_card\":{\"cardinality\":{\"field\":\"$R\"}},\"col_card\":{\"cardinality\":{\"field\":\"$C\"}}}}}}")
TOTAL=$(echo "$A" | python3 -c "import sys,json;print(json.load(sys.stdin)['hits']['total']['value'])")
ELIG=$(echo "$A" | python3 -c "import sys,json;print(json.load(sys.stdin)['aggregations']['eligible']['doc_count'])")
assert "totalMatched (all hunt matches)" "$TOTAL" "6"
assert "pivotEligibleMatched (carol dropped: missing country)" "$ELIG" "5"

echo "== Stage B: keyed-filter selected-member totals (own scope, not summed from cells) =="
B=$(curl -sk -u "$OS_AUTH" "$OS/$IDX/_search" -H 'Content-Type: application/json' -d "{
 \"size\":0,\"query\":{\"bool\":{\"filter\":[{\"exists\":{\"field\":\"$R\"}},{\"exists\":{\"field\":\"$C\"}}]}},
 \"aggs\":{
   \"row_totals\":{\"filters\":{\"filters\":{\"alice\":{\"term\":{\"$R\":\"alice\"}},\"bob\":{\"term\":{\"$R\":\"bob\"}}}}},
   \"col_totals\":{\"filters\":{\"filters\":{\"RU\":{\"term\":{\"$C\":\"RU\"}},\"IN\":{\"term\":{\"$C\":\"IN\"}}}}}
 }}")
ALICE=$(echo "$B" | python3 -c "import sys,json;print(json.load(sys.stdin)['aggregations']['row_totals']['buckets']['alice']['doc_count'])")
RU=$(echo "$B" | python3 -c "import sys,json;print(json.load(sys.stdin)['aggregations']['col_totals']['buckets']['RU']['doc_count'])")
assert "rowTotal(alice) at member scope" "$ALICE" "3"
assert "colTotal(RU) at member scope" "$RU" "3"

echo "== MANDATORY: Exclude from Hunt = NOT (A AND B) removes the intersection ONLY =="
X=$(curl -sk -u "$OS_AUTH" "$OS/$IDX/_search" -H 'Content-Type: application/json' -d "{
 \"size\":20,\"query\":{\"bool\":{\"must_not\":[{\"bool\":{\"filter\":[{\"term\":{\"$R\":\"alice\"}},{\"term\":{\"$C\":\"RU\"}}]}}]}},
 \"_source\":[\"user.name\",\"source.geo.country\"]}")
ALICE_RU_GONE=$(echo "$X" | python3 -c "
import sys,json;d=json.load(sys.stdin)
combos=[(h['_source'].get('user.name'),h['_source'].get('source.geo.country')) for h in d['hits']['hits']]
print('yes' if ('alice','RU') not in combos else 'no')")
ALICE_IN_KEPT=$(echo "$X" | python3 -c "
import sys,json;d=json.load(sys.stdin)
combos=[(h['_source'].get('user.name'),h['_source'].get('source.geo.country')) for h in d['hits']['hits']]
print('yes' if ('alice','IN') in combos else 'no')")
BOB_RU_KEPT=$(echo "$X" | python3 -c "
import sys,json;d=json.load(sys.stdin)
combos=[(h['_source'].get('user.name'),h['_source'].get('source.geo.country')) for h in d['hits']['hits']]
print('yes' if ('bob','RU') in combos else 'no')")
assert "alice+RU excluded" "$ALICE_RU_GONE" "yes"
assert "alice+IN KEPT (would be wrongly dropped by user!=alice)" "$ALICE_IN_KEPT" "yes"
assert "bob+RU KEPT (would be wrongly dropped by country!=RU)" "$BOB_RU_KEPT" "yes"

echo
if [ "$fail" = "0" ]; then echo "ALL CROSSTAB CORRECTNESS CHECKS PASSED"; else echo "SOME CHECKS FAILED"; exit 1; fi
