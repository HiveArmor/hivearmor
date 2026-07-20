#!/usr/bin/env bash
set -euo pipefail

WORK_DIR="${WORK_DIR:-/workdir}"
SOCK="${WORK_DIR}/sockets/engine_server.sock"
SUPERVISORD_CONF=/tmp/supervisord.conf

mkdir -p "${WORK_DIR}/sockets"
mkdir -p "${WORK_DIR}/pipeline/filters"
mkdir -p "${WORK_DIR}/rules"
mkdir -p "${WORK_DIR}/logs"

GEO_DIR="${WORK_DIR}/geolocation"
mkdir -p "$GEO_DIR"

# Auto-download GeoLite2 CSVs if a license key is provided and files are missing.
if [ -n "${MAXMIND_LICENSE_KEY:-}" ]; then
  _need_download=0
  for _f in asn-blocks-v4.csv asn-blocks-v6.csv blocks-v4.csv blocks-v6.csv locations-en.csv; do
    [ ! -f "$GEO_DIR/$_f" ] && _need_download=1 && break
  done

  if [ "$_need_download" -eq 1 ]; then
    echo "[INFO] MAXMIND_LICENSE_KEY set — downloading latest GeoLite2 CSVs to $GEO_DIR..."
    _dl() {
      local edition="$1"
      curl -fsSL \
        "https://download.maxmind.com/app/geoip_download?edition_id=${edition}&license_key=${MAXMIND_LICENSE_KEY}&suffix=zip" \
        -o "/tmp/geo_${edition}.zip" \
        && unzip -jo "/tmp/geo_${edition}.zip" -d "$GEO_DIR" "*.csv" \
        && rm "/tmp/geo_${edition}.zip" \
        && echo "[INFO] Downloaded $edition" \
        || echo "[WARN] Failed to download $edition"
    }
    _dl GeoLite2-ASN-CSV
    _dl GeoLite2-City-CSV
    mv "$GEO_DIR/GeoLite2-ASN-Blocks-IPv4.csv"    "$GEO_DIR/asn-blocks-v4.csv"  2>/dev/null || true
    mv "$GEO_DIR/GeoLite2-ASN-Blocks-IPv6.csv"    "$GEO_DIR/asn-blocks-v6.csv"  2>/dev/null || true
    mv "$GEO_DIR/GeoLite2-City-Blocks-IPv4.csv"   "$GEO_DIR/blocks-v4.csv"      2>/dev/null || true
    mv "$GEO_DIR/GeoLite2-City-Blocks-IPv6.csv"   "$GEO_DIR/blocks-v6.csv"      2>/dev/null || true
    mv "$GEO_DIR/GeoLite2-City-Locations-en.csv"  "$GEO_DIR/locations-en.csv"   2>/dev/null || true
  fi
fi

# Validate presence of all required GeoIP CSV files.
_missing=0
for _f in asn-blocks-v4.csv asn-blocks-v6.csv blocks-v4.csv blocks-v6.csv locations-en.csv; do
  if [ ! -f "$GEO_DIR/$_f" ]; then
    echo "[WARN] GeoIP file missing: $GEO_DIR/$_f — geolocation enrichment will be disabled"
    _missing=$((_missing + 1))
  fi
done

if [ "$_missing" -eq 0 ]; then
  echo "[INFO] GeoIP CSV files found in $GEO_DIR — geolocation enrichment enabled"
else
  echo "[WARN] $_missing GeoIP file(s) missing. Events will not be enriched with country/city data."
  echo "[WARN] To enable: mount CSV files to $GEO_DIR or set MAXMIND_LICENSE_KEY to auto-download."
fi

# Build supervisord config dynamically so MODE is respected at runtime.
cat > "$SUPERVISORD_CONF" <<'HEADER'
[supervisord]
nodaemon=true
logfile=/dev/null
logfile_maxbytes=0
loglevel=info
pidfile=/var/run/supervisord.pid

[unix_http_server]
file=/var/run/supervisor.sock
chmod=0700

[supervisorctl]
serverurl=unix:///var/run/supervisor.sock

[rpcinterface:supervisor]
supervisor.rpcinterface_factory = supervisor.rpcinterface:make_main_rpcinterface

[program:engine]
command=/usr/local/bin/engine
autorestart=true
startretries=10
startsecs=3
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
HEADER

# Companion plugins wait for the engine socket before starting, so a fresh
# engine restart doesn't leave them perpetually broken.
add_companion() {
    local name="$1"
    local bin="$2"
    cat >> "$SUPERVISORD_CONF" <<PROG

[program:${name}]
command=/wait-for-socket.sh 30 ${SOCK} ${bin}
autorestart=true
startretries=10
startsecs=5
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
PROG
}

if [ "${MODE:-}" != "manager" ]; then
    add_companion "com.hivearmor.config.plugin"      /usr/local/bin/com.hivearmor.config.plugin
    add_companion "com.hivearmor.events.plugin"      /usr/local/bin/com.hivearmor.events.plugin
    add_companion "com.hivearmor.alerts.plugin"      /usr/local/bin/com.hivearmor.alerts.plugin
    add_companion "com.hivearmor.geolocation.plugin" /usr/local/bin/com.hivearmor.geolocation.plugin
fi

if [ -f /usr/local/bin/com.hivearmor.inputs.plugin ]; then
    # inputs plugin writes to Kafka (when KAFKA_BROKER is set) or the engine socket.
    # Start immediately without socket wait — if Kafka is configured it does not
    # need the local engine socket at all. If socket mode, it will retry internally.
    cat >> "$SUPERVISORD_CONF" <<'INPUTS'

[program:com.hivearmor.inputs.plugin]
command=/usr/local/bin/com.hivearmor.inputs.plugin
autorestart=true
startretries=10
startsecs=5
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
INPUTS
fi

# compliance-orchestrator only needs backend + opensearch, no socket dependency
cat >> "$SUPERVISORD_CONF" <<'ORCH'

[program:com.hivearmor.compliance-orchestrator.plugin]
command=/usr/local/bin/com.hivearmor.compliance-orchestrator.plugin
autorestart=true
startretries=5
startsecs=10
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
ORCH

echo "[entrypoint] starting supervisord (mode=${MODE:-default})"
exec supervisord -c "$SUPERVISORD_CONF"
