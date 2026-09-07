#!/usr/bin/env bash
# DET-INDEX-001 — assert correlation afterEvents indexPattern has no legacy v11-log-*
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail=0

# YAML rules must not use v11-log indexPattern
if rg -n 'indexPattern:[[:space:]]*"?v11-log-' rules/ backend/rules/ 2>/dev/null; then
  echo "FAIL: found v11-log indexPattern in rules YAML" >&2
  fail=1
else
  echo "OK: no v11-log indexPattern in rules/"
fi

# Underscore form must not remain
if rg -n 'indexPattern:[[:space:]]*"?_v3_hive_log' rules/ backend/rules/ 2>/dev/null; then
  echo "FAIL: found _v3_hive_log indexPattern in rules YAML" >&2
  fail=1
else
  echo "OK: no _v3_hive_log indexPattern in rules/"
fi

# Seed SQL must not embed v11-log indexPattern
if rg -n '"indexPattern":"v11-log-' backend/src/main/resources/config/liquibase/data/ 2>/dev/null; then
  echo "FAIL: found v11-log indexPattern in liquibase seed SQL" >&2
  fail=1
else
  echo "OK: no v11-log indexPattern in liquibase data/"
fi

exit "$fail"
