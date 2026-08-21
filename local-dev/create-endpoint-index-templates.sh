#!/usr/bin/env bash
# create-endpoint-index-templates.sh
#
# Creates OpenSearch index templates for all new endpoint telemetry dataTypes:
#   v3-hive-fim-*           File Integrity Monitoring events
#   v3-hive-process-*       Process creation/exit events (eBPF/ETW/ESF)
#   v3-hive-netconn-*       Per-process network connection events
#   v3-hive-dns-*           DNS query/response events
#   v3-hive-usb-*           USB device insert/remove events
#   v3-hive-driver-load-*   Kernel module / driver load events
#   v3-hive-vuln-*          CVE vulnerability findings (from SBOM matching)
#   v3-hive-sca-*           SCA/CIS benchmark check results
#
# Usage:
#   OPENSEARCH_URL=https://localhost:9200 \
#   OPENSEARCH_USER=admin \
#   OPENSEARCH_PASS=LocalDev@2024! \
#   bash create-endpoint-index-templates.sh
#
# The index pattern follows the locked platform convention:
#   v3-hive-<type>-YYYY.MM.DD
# Do NOT change this pattern without migrating all existing data.

set -euo pipefail

OS_URL="${OPENSEARCH_URL:-https://localhost:9200}"
OS_USER="${OPENSEARCH_USER:-admin}"
OS_PASS="${OPENSEARCH_PASS:-LocalDev@2024!}"

CURL_OPTS=(-sk -u "${OS_USER}:${OS_PASS}" -H "Content-Type: application/json")

put_template() {
  local name="$1"
  local body="$2"
  echo "  Creating template: ${name}"
  curl "${CURL_OPTS[@]}" -X PUT "${OS_URL}/_index_template/${name}" -d "${body}" -o /dev/null
  echo " ✓"
}

echo "Creating HiveArmor endpoint telemetry index templates..."

# ── FIM — File Integrity Monitoring ──────────────────────────────────────────
put_template "ha-fim" '{
  "index_patterns": ["v3-hive-fim-*"],
  "priority": 200,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.refresh_interval": "5s"
    },
    "mappings": {
      "properties": {
        "@timestamp":       { "type": "date" },
        "dataType":         { "type": "keyword" },
        "dataSource":       { "type": "keyword" },
        "action":           { "type": "keyword" },
        "origin.file":      { "type": "keyword" },
        "origin.filename":  { "type": "keyword" },
        "origin.path":      { "type": "keyword" },
        "origin.sha256":    { "type": "keyword" },
        "origin.md5":       { "type": "keyword" },
        "origin.sizeInBytes": { "type": "long" },
        "origin.user":      { "type": "keyword" },
        "origin.process":   { "type": "keyword" },
        "log.old_hash":         { "type": "keyword" },
        "log.new_permissions":  { "type": "keyword" },
        "log.old_permissions":  { "type": "keyword" },
        "log.old_owner":        { "type": "keyword" },
        "log.new_owner":        { "type": "keyword" },
        "hostname":         { "type": "keyword" },
        "severity":         { "type": "keyword" }
      }
    }
  }
}'

# ── PROCESS — Process creation and exit ──────────────────────────────────────
put_template "ha-process" '{
  "index_patterns": ["v3-hive-process-*"],
  "priority": 200,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.refresh_interval": "2s"
    },
    "mappings": {
      "properties": {
        "@timestamp":       { "type": "date" },
        "dataType":         { "type": "keyword" },
        "dataSource":       { "type": "keyword" },
        "action":           { "type": "keyword" },
        "origin.process":   { "type": "keyword" },
        "origin.pid":       { "type": "long" },
        "log.ppid":         { "type": "long" },
        "origin.user":      { "type": "keyword" },
        "origin.path":      { "type": "keyword" },
        "origin.command":   { "type": "text", "fields": { "keyword": { "type": "keyword", "ignore_above": 1024 } } },
        "origin.sha256":    { "type": "keyword" },
        "severity":         { "type": "keyword" },
        "hostname":         { "type": "keyword" }
      }
    }
  }
}'

# ── NETCONN — Per-process network connections ─────────────────────────────────
put_template "ha-netconn" '{
  "index_patterns": ["v3-hive-netconn-*"],
  "priority": 200,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.refresh_interval": "5s"
    },
    "mappings": {
      "properties": {
        "@timestamp":       { "type": "date" },
        "dataType":         { "type": "keyword" },
        "dataSource":       { "type": "keyword" },
        "action":           { "type": "keyword" },
        "protocol":         { "type": "keyword" },
        "origin.ip":        { "type": "ip" },
        "origin.port":      { "type": "integer" },
        "target.ip":        { "type": "ip" },
        "target.port":      { "type": "integer" },
        "origin.process":   { "type": "keyword" },
        "origin.pid":       { "type": "long" },
        "log.tcp_state":    { "type": "keyword" },
        "log.bytes_sent":   { "type": "long" },
        "log.bytes_received": { "type": "long" },
        "log.duration_ms":  { "type": "long" },
        "severity":         { "type": "keyword" },
        "hostname":         { "type": "keyword" }
      }
    }
  }
}'

# ── DNS — DNS query/response events ──────────────────────────────────────────
put_template "ha-dns" '{
  "index_patterns": ["v3-hive-dns-*"],
  "priority": 200,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.refresh_interval": "5s"
    },
    "mappings": {
      "properties": {
        "@timestamp":             { "type": "date" },
        "dataType":               { "type": "keyword" },
        "dataSource":             { "type": "keyword" },
        "log.query":              { "type": "keyword" },
        "log.query_type":         { "type": "keyword" },
        "log.response_code":      { "type": "keyword" },
        "log.answers":            { "type": "keyword" },
        "log.ttl":                { "type": "integer" },
        "log.query_length":       { "type": "integer" },
        "log.subdomain_entropy":  { "type": "float" },
        "origin.ip":              { "type": "ip" },
        "origin.process":         { "type": "keyword" },
        "origin.pid":             { "type": "long" },
        "severity":               { "type": "keyword" },
        "hostname":               { "type": "keyword" }
      }
    }
  }
}'

# ── USB — USB device events ───────────────────────────────────────────────────
put_template "ha-usb" '{
  "index_patterns": ["v3-hive-usb-*"],
  "priority": 200,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.refresh_interval": "30s"
    },
    "mappings": {
      "properties": {
        "@timestamp":           { "type": "date" },
        "dataType":             { "type": "keyword" },
        "dataSource":           { "type": "keyword" },
        "action":               { "type": "keyword" },
        "deviceVid":            { "type": "keyword" },
        "devicePid":            { "type": "keyword" },
        "deviceManufacturer":   { "type": "keyword" },
        "deviceProduct":        { "type": "keyword" },
        "deviceSerial":         { "type": "keyword" },
        "deviceBus":            { "type": "keyword" },
        "devicePath":           { "type": "keyword" },
        "log.device_vid":       { "type": "keyword" },
        "log.device_pid":       { "type": "keyword" },
        "log.device_desc":      { "type": "keyword" },
        "log.device_instance":  { "type": "keyword" },
        "severity":             { "type": "keyword" },
        "hostname":             { "type": "keyword" }
      }
    }
  }
}'

# ── DRIVER-LOAD — Kernel module / driver load events ─────────────────────────
put_template "ha-driver-load" '{
  "index_patterns": ["v3-hive-driver-load-*"],
  "priority": 200,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.refresh_interval": "10s"
    },
    "mappings": {
      "properties": {
        "@timestamp":       { "type": "date" },
        "dataType":         { "type": "keyword" },
        "dataSource":       { "type": "keyword" },
        "action":           { "type": "keyword" },
        "log.module_name":  { "type": "keyword" },
        "log.module_path":  { "type": "keyword" },
        "origin.process":   { "type": "keyword" },
        "origin.pid":       { "type": "long" },
        "severity":         { "type": "keyword" },
        "hostname":         { "type": "keyword" }
      }
    }
  }
}'

# ── VULN — CVE vulnerability findings ────────────────────────────────────────
put_template "ha-vuln" '{
  "index_patterns": ["v3-hive-vuln-*"],
  "priority": 200,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.refresh_interval": "30s"
    },
    "mappings": {
      "properties": {
        "@timestamp":         { "type": "date" },
        "agent_id":           { "type": "keyword" },
        "agent_hostname":     { "type": "keyword" },
        "cve_id":             { "type": "keyword" },
        "purl":               { "type": "keyword" },
        "package_name":       { "type": "keyword" },
        "installed_version":  { "type": "keyword" },
        "fixed_version":      { "type": "keyword" },
        "cvss_v3":            { "type": "float" },
        "severity":           { "type": "keyword" },
        "is_kev":             { "type": "boolean" },
        "published_at":       { "type": "date" },
        "first_seen_at":      { "type": "date" },
        "last_seen_at":       { "type": "date" }
      }
    }
  }
}'

# ── SCA — Security Configuration Assessment results ───────────────────────────
put_template "ha-sca" '{
  "index_patterns": ["v3-hive-sca-*"],
  "priority": 200,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.refresh_interval": "60s"
    },
    "mappings": {
      "properties": {
        "@timestamp":       { "type": "date" },
        "agent_id":         { "type": "keyword" },
        "agent_hostname":   { "type": "keyword" },
        "check_id":         { "type": "keyword" },
        "check_title":      { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
        "pack_id":          { "type": "keyword" },
        "level":            { "type": "keyword" },
        "status":           { "type": "keyword" },
        "observed_value":   { "type": "text" },
        "expected_value":   { "type": "text" },
        "compliance_tags":  { "type": "keyword" },
        "mitre":            { "type": "keyword" },
        "scanned_at":       { "type": "date" }
      }
    }
  }
}'

echo ""
echo "All endpoint index templates created successfully."
echo ""
echo "Templates created:"
echo "  ha-fim          → v3-hive-fim-YYYY.MM.DD"
echo "  ha-process      → v3-hive-process-YYYY.MM.DD"
echo "  ha-netconn      → v3-hive-netconn-YYYY.MM.DD"
echo "  ha-dns          → v3-hive-dns-YYYY.MM.DD"
echo "  ha-usb          → v3-hive-usb-YYYY.MM.DD"
echo "  ha-driver-load  → v3-hive-driver-load-YYYY.MM.DD"
echo "  ha-vuln         → v3-hive-vuln-YYYY.MM.DD"
echo "  ha-sca          → v3-hive-sca-YYYY.MM.DD"
