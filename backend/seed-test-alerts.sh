#!/bin/bash
# Seed Sprint 36 test alert data into OpenSearch
# Run from the repo root

OS_URL="https://localhost:9200"
OS_AUTH="admin:LocalDev@2024!"
INDEX="v3-hive-alert-cwm-2026.08.05"

echo "=== Seeding Sprint 36 test alerts into $INDEX ==="

# Delete existing index to start fresh
curl -s -k -u "$OS_AUTH" -X DELETE "$OS_URL/$INDEX" > /dev/null 2>&1
echo "Deleted old index (if existed)"

# Create index with proper mappings
curl -s -k -u "$OS_AUTH" -X PUT "$OS_URL/$INDEX" -H "Content-Type: application/json" -d '{
  "settings": {"number_of_shards": 1, "number_of_replicas": 0},
  "mappings": {
    "properties": {
      "name": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
      "severity": {"type": "integer"},
      "status": {"type": "integer"},
      "riskScore": {"type": "integer"},
      "@timestamp": {"type": "date"},
      "category": {"type": "keyword"},
      "assigneeId": {"type": "keyword"},
      "assigneeName": {"type": "keyword"},
      "tags": {"type": "keyword"},
      "tenantId": {"type": "keyword"},
      "threatIntelMatched": {"type": "boolean"},
      "slaDueAt": {"type": "date"},
      "mitreTacticId": {"type": "keyword"},
      "mitreTacticName": {"type": "keyword"},
      "mitreTechniqueName": {"type": "keyword"},
      "mitreTechniqueId": {"type": "keyword"},
      "mitreSubTechnique": {"type": "keyword"},
      "locked": {"type": "boolean"},
      "version": {"type": "integer"},
      "riskFactors": {"type": "nested", "properties": {"name": {"type": "keyword"}, "weight": {"type": "float"}, "contribution": {"type": "float"}}},
      "threatIntelIndicators": {"type": "nested", "properties": {"source": {"type": "keyword"}, "type": {"type": "keyword"}, "confidence": {"type": "integer"}, "lastSeen": {"type": "date"}}},
      "statusHistory": {"type": "nested", "properties": {"timestamp": {"type": "date"}, "action": {"type": "keyword"}, "actor": {"type": "keyword"}, "detail": {"type": "text"}}},
      "primaryEntityId": {"type": "keyword"},
      "primaryEntityType": {"type": "keyword"},
      "primaryEntityLabel": {"type": "keyword"},
      "description": {"type": "text"},
      "correlationId": {"type": "keyword"},
      "parentId": {"type": "keyword"}
    }
  }
}' 2>/dev/null
echo ""
echo "Created index with mappings"

# Bulk insert test alerts
BULK_DATA='{"index":{"_id":"ALT-001"}}
{"name":"Critical: Ransomware Encryption Detected","severity":10,"status":1,"riskScore":95,"@timestamp":"2026-08-05T08:00:00Z","category":"malware","tenantId":"cwm","tags":["ransomware","critical"],"assigneeId":"analyst1","assigneeName":"John Doe","threatIntelMatched":true,"mitreTacticId":"TA0040","mitreTacticName":"Impact","mitreTechniqueName":"Data Encrypted for Impact","mitreTechniqueId":"T1486","version":1,"locked":false,"description":"Detected ransomware encryption on host DC-SERVER-01","primaryEntityId":"host-dc01","primaryEntityType":"host","primaryEntityLabel":"DC-SERVER-01","riskFactors":[{"name":"severity","weight":0.4,"contribution":4.0},{"name":"asset_criticality","weight":0.35,"contribution":3.3},{"name":"recurrence","weight":0.25,"contribution":2.4}],"threatIntelIndicators":[{"source":"AlienVault OTX","type":"hash","confidence":92,"lastSeen":"2026-08-04T18:00:00Z"}],"statusHistory":[{"timestamp":"2026-08-05T08:00:00Z","action":"created","actor":"system","detail":"Alert created by correlation rule"}]}
{"index":{"_id":"ALT-002"}}
{"name":"Critical: C2 Beacon Activity","severity":10,"status":1,"riskScore":98,"@timestamp":"2026-08-05T05:00:00Z","category":"command_and_control","tenantId":"cwm","tags":["c2","cobalt-strike"],"threatIntelMatched":true,"mitreTacticId":"TA0011","mitreTacticName":"Command and Control","mitreTechniqueName":"Application Layer Protocol","mitreTechniqueId":"T1071","version":1,"locked":false,"description":"Cobalt Strike beacon detected communicating with known C2 server","primaryEntityId":"host-ws05","primaryEntityType":"host","primaryEntityLabel":"WS-FINANCE-05","correlationId":"CORR-001"}
{"index":{"_id":"ALT-003"}}
{"name":"High: Suspicious PowerShell Execution","severity":9,"status":1,"riskScore":85,"@timestamp":"2026-08-05T07:30:00Z","category":"execution","tenantId":"cwm","tags":["powershell","encoded"],"threatIntelMatched":false,"mitreTacticId":"TA0002","mitreTacticName":"Execution","mitreTechniqueName":"PowerShell","mitreTechniqueId":"T1059.001","mitreSubTechnique":"T1059.001","version":1,"locked":false,"description":"Encoded PowerShell command detected bypassing execution policy","correlationId":"CORR-001"}
{"index":{"_id":"ALT-004"}}
{"name":"High: Lateral Movement via RDP","severity":8,"status":2,"riskScore":78,"@timestamp":"2026-08-05T07:00:00Z","category":"lateral_movement","tenantId":"cwm","tags":["rdp","lateral"],"assigneeId":"analyst2","assigneeName":"Jane Smith","threatIntelMatched":false,"mitreTacticId":"TA0008","mitreTacticName":"Lateral Movement","mitreTechniqueName":"Remote Desktop Protocol","mitreTechniqueId":"T1021.001","version":2,"locked":false,"statusHistory":[{"timestamp":"2026-08-05T07:00:00Z","action":"created","actor":"system","detail":"Alert created"},{"timestamp":"2026-08-05T07:15:00Z","action":"status_change","actor":"analyst2","detail":"Moved to in_review"}]}
{"index":{"_id":"ALT-005"}}
{"name":"High: Data Exfiltration via HTTPS","severity":8,"status":1,"riskScore":80,"@timestamp":"2026-08-05T02:00:00Z","category":"exfiltration","tenantId":"cwm","tags":["exfil","https"],"threatIntelMatched":true,"slaDueAt":"2026-08-05T12:30:00Z","mitreTacticId":"TA0010","mitreTacticName":"Exfiltration","mitreTechniqueName":"Exfiltration Over Web Service","mitreTechniqueId":"T1567","version":1,"locked":false}
{"index":{"_id":"ALT-006"}}
{"name":"Medium: Failed Login Brute Force","severity":6,"status":1,"riskScore":55,"@timestamp":"2026-08-05T06:30:00Z","category":"authentication","tenantId":"cwm","tags":["brute-force"],"threatIntelMatched":false,"version":1,"locked":false,"slaDueAt":"2026-08-05T14:00:00Z","description":"Multiple failed login attempts from IP 192.168.1.100"}
{"index":{"_id":"ALT-007"}}
{"name":"Medium: Unusual DNS Queries","severity":5,"status":1,"riskScore":45,"@timestamp":"2026-08-05T06:00:00Z","category":"network","tenantId":"cwm","tags":["dns","tunneling"],"threatIntelMatched":true,"slaDueAt":"2026-08-05T14:00:00Z","version":1,"locked":false}
{"index":{"_id":"ALT-008"}}
{"name":"Medium: Privilege Escalation Attempt","severity":7,"status":5,"riskScore":65,"@timestamp":"2026-08-05T04:00:00Z","category":"privilege_escalation","tenantId":"cwm","tags":["privesc"],"assigneeId":"analyst1","assigneeName":"John Doe","version":3,"locked":true,"statusHistory":[{"timestamp":"2026-08-05T04:00:00Z","action":"created","actor":"system","detail":"Alert created"},{"timestamp":"2026-08-05T04:30:00Z","action":"status_change","actor":"analyst1","detail":"Acknowledged"},{"timestamp":"2026-08-05T05:00:00Z","action":"status_change","actor":"analyst1","detail":"Closed as resolved"}]}
{"index":{"_id":"ALT-009"}}
{"name":"Low: SSH Login from New IP","severity":3,"status":1,"riskScore":25,"@timestamp":"2026-08-05T05:30:00Z","category":"authentication","tenantId":"cwm","version":1,"locked":false}
{"index":{"_id":"ALT-010"}}
{"name":"Low: Informational Scan Detected","severity":2,"status":1,"riskScore":15,"@timestamp":"2026-08-05T03:00:00Z","category":"reconnaissance","tenantId":"cwm","version":1,"locked":false}
'

curl -s -k -u "$OS_AUTH" -X POST "$OS_URL/$INDEX/_bulk" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary "$BULK_DATA" | python3 -c "
import sys, json
resp = json.load(sys.stdin)
if resp.get('errors'):
    print('ERROR: Some documents failed to index')
    for item in resp['items']:
        if item['index'].get('error'):
            print(f\"  {item['index']['_id']}: {item['index']['error']['reason']}\")
else:
    print(f\"SUCCESS: Indexed {len(resp['items'])} alerts in {resp['took']}ms\")
"

# Verify count
echo ""
echo "=== Verification ==="
COUNT=$(curl -s -k -u "$OS_AUTH" "$OS_URL/$INDEX/_count" | python3 -c "import sys,json; print(json.load(sys.stdin)['count'])")
echo "Total alerts in index: $COUNT"

# Quick search test
echo ""
echo "=== Sample query (top 3 by severity) ==="
curl -s -k -u "$OS_AUTH" "$OS_URL/$INDEX/_search" -H "Content-Type: application/json" -d '{
  "size": 3,
  "sort": [{"severity": "desc"}, {"_id": "asc"}],
  "_source": ["name", "severity", "status", "category"]
}' | python3 -c "
import sys, json
resp = json.load(sys.stdin)
for hit in resp['hits']['hits']:
    src = hit['_source']
    print(f\"  {hit['_id']}: severity={src['severity']} status={src['status']} - {src['name']}\")
"

echo ""
echo "=== Done! Test alerts seeded successfully ==="
