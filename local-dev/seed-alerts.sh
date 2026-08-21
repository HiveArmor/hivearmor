#!/usr/bin/env bash
set -euo pipefail
OS_URL="https://localhost:9200"
CURL="curl -sk -u admin:LocalDev@2024!"
TODAY=$(date -u +%Y.%m.%d)
NOW_EPOCH=$(date -u +%s)
INGEST=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
gen_ts() { date -u -r $(( NOW_EPOCH - $1 )) +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null; }

echo "==> Creating alert indices..."
for PREFIX in workmates1 cwm workmates2; do
  $CURL -X PUT "${OS_URL}/v3-hive-alert-${PREFIX}-${TODAY}" -H 'Content-Type: application/json' -d '{"settings":{"number_of_shards":1,"number_of_replicas":0},"mappings":{"properties":{"@timestamp":{"type":"date"},"name":{"type":"keyword"},"severity":{"type":"integer"},"severityLabel":{"type":"keyword"},"status":{"type":"integer"},"statusLabel":{"type":"keyword"},"category":{"type":"keyword"},"dataSource":{"type":"keyword"},"message":{"type":"text"},"tags":{"type":"keyword"},"visibleBy":{"type":"keyword"},"host":{"properties":{"name":{"type":"keyword"}}},"user":{"properties":{"name":{"type":"keyword"}}},"source":{"properties":{"ip":{"type":"ip"}}}}}}' 2>/dev/null > /dev/null || true
done
echo "  Done"

ALERTS=("Brute force login attempt" "Encoded PowerShell execution" "Lateral movement via PsExec" "Data exfiltration to cloud" "Privilege escalation detected" "C2 beacon communication" "Suspicious DNS tunneling" "Malware signature matched" "Ransomware encryption behavior" "Credential dumping LSASS" "Rogue admin account created" "Firewall rule bypass" "Mass email forwarding" "USB data transfer anomaly" "Supply chain tampering")
CATS=("Credential Access" "Execution" "Lateral Movement" "Exfiltration" "Privilege Escalation" "Command and Control" "Exfiltration" "Execution" "Impact" "Credential Access" "Persistence" "Defense Evasion" "Collection" "Exfiltration" "Initial Access")
SEVS=(10 9 8 7 6 5 4 3 2 1 10 9 8 7 6)

echo "==> Seeding alerts..."
for PREFIX in workmates1 cwm workmates2; do
  IDX="v3-hive-alert-${PREFIX}-${TODAY}"
  BULK=""
  for i in $(seq 0 24); do
    TS=$(gen_ts $(( RANDOM % 14400 )))
    AI=$(( i % 15 ))
    NAME="${ALERTS[$AI]}"
    CAT="${CATS[$AI]}"
    SEV=${SEVS[$AI]}
    # Randomize severity slightly
    SEV=$(( SEV + (RANDOM % 2) - (RANDOM % 2) ))
    if [ $SEV -lt 1 ]; then SEV=1; fi
    if [ $SEV -gt 10 ]; then SEV=10; fi
    STATUS=$(( (RANDOM % 3) + 1 ))
    SEVL="Low"
    if [ $SEV -ge 9 ]; then SEVL="Critical"; fi
    if [ $SEV -ge 7 ] && [ $SEV -lt 9 ]; then SEVL="High"; fi
    if [ $SEV -ge 4 ] && [ $SEV -lt 7 ]; then SEVL="Medium"; fi
    STATL="Open"
    if [ $STATUS -eq 2 ]; then STATL="Open"; fi
    if [ $STATUS -eq 3 ]; then STATL="In Review"; fi
    SRC_IP="10.$(( RANDOM % 255 )).$(( RANDOM % 255 )).$(( RANDOM % 255 ))"
    HOSTS=("SRV-${PREFIX}-01" "WKS-${PREFIX}-10" "DC-${PREFIX}-01" "FW-${PREFIX}-01")
    HOST=${HOSTS[$(( RANDOM % 4 ))]}
    BULK+='{"index":{"_index":"'"${IDX}"'"}}'$'\n'
    BULK+='{"@timestamp":"'"${TS}"'","name":"'"${NAME}"'","severity":'"${SEV}"',"severityLabel":"'"${SEVL}"'","status":'"${STATUS}"',"statusLabel":"'"${STATL}"'","category":"'"${CAT}"'","dataSource":"Correlation Engine","message":"['"${PREFIX}"'] '"${NAME}"' on '"${HOST}"' from '"${SRC_IP}"'","tags":["auto-generated"],"visibleBy":"'"${PREFIX}"'","host":{"name":"'"${HOST}"'"},"user":{"name":"analyst"},"source":{"ip":"'"${SRC_IP}"'"}}'$'\n'
  done
  echo "$BULK" | $CURL -X POST "${OS_URL}/_bulk" -H 'Content-Type: application/x-ndjson' --data-binary @- 2>/dev/null | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'  {\"${PREFIX}\"}: {len(r[\"items\"])} alerts indexed')"
done

echo "==> Verifying..."
sleep 1
TOTAL=$($CURL -s "${OS_URL}/v3-hive-alert-*/_count" | python3 -c "import sys,json; print(json.load(sys.stdin)['count'])")
echo "  Total alerts: ${TOTAL}"
echo "==> Done!"
