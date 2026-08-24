#!/usr/bin/env bash
# Live SOAR smoke against local-dev backend (port 8088).
# Uses documented local-dev credentials from CLAUDE.md / AGENTS.md.
# Does NOT print tokens.
set -euo pipefail
BASE="${HA_API_BASE:-http://localhost:8088}"
USER="${HA_USER:-admin}"
PASS="${HA_PASS:-localdev123!}"

AUTH_JSON=$(curl -s -X POST "$BASE/api/authenticate" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\",\"rememberMe\":false}")
TOKEN=$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('id_token') or d.get('token') or d.get('access_token') or '')" "$AUTH_JSON")
if [[ -z "$TOKEN" ]]; then
  echo "AUTH_FAILED"
  echo "$AUTH_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('title') or d.get('success'), d.get('detail') or d.get('message') or '')" || true
  exit 1
fi
echo "AUTH_OK"

AUTH="Authorization: Bearer $TOKEN"

echo "LIST=$(curl -s -H "$AUTH" "$BASE/api/ha-playbooks" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 'err')")"

CREATE=$(curl -s -X POST "$BASE/api/ha-playbooks" -H "$AUTH" -H 'Content-Type: application/json' -d '{
  "name":"Local Delay Smoke",
  "description":"Live docker smoke",
  "triggerType":"manual",
  "active":true,
  "steps":[
    {"stepIndex":0,"stepType":"delay","label":"Pause","config":{"delaySeconds":1}},
    {"stepIndex":1,"stepType":"condition","label":"Continue","config":{"field":"x","op":"eq","value":true}}
  ]
}')
PB_ID=$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('id',''))" "$CREATE")
echo "CREATE_ID=$PB_ID"
[[ -n "$PB_ID" ]] || { echo "CREATE_FAILED $CREATE"; exit 1; }

echo "METRICS=$(curl -s -H "$AUTH" "$BASE/api/ha-playbooks/metrics")"

PREV=$(curl -s -X POST "$BASE/api/ha-playbooks/$PB_ID/preview" -H "$AUTH" -H 'Content-Type: application/json' -d '{}')
echo "PREVIEW_STEPS=$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('stepCount'))" "$PREV")"

EXEC=$(curl -s -X POST "$BASE/api/ha-playbooks/$PB_ID/execute" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"agentId":"smoke-agent","inputs":{"hostname":"smoke-host"}}')
EID=$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('executionId',''))" "$EXEC")
echo "EXEC_ID_PRESENT=$([[ -n $EID ]] && echo yes || echo no) STATUS=$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('status'))" "$EXEC")"
sleep 3
HIST=$(curl -s -H "$AUTH" "$BASE/api/ha-playbooks/$PB_ID/history")
echo "HISTORY=$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print([(x.get('status'), x.get('executionId')[:8] if x.get('executionId') else '') for x in d])" "$HIST")"

# unauthenticated soc-ai should 401
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/soc-ai/analyze" -H 'Content-Type: application/json' -d '{}')
echo "SOC_AI_UNAUTH=$CODE"
echo "SMOKE_OK"
