#!/usr/bin/env bash
# Category 7: kafka-broker
# Requirements: 12.3, 12.4
#
# Probes the optional Kafka bootstrap endpoint when KAFKA_BOOTSTRAP is set.
# Kafka is not a required component of the HiveArmor local-dev stack, so the
# absence of a configured endpoint is treated as an AcceptableInfoExit.
#
# Exit codes:
#   0 — Kafka is configured and the bootstrap endpoint is reachable
#   2 — Kafka is not configured (KAFKA_BOOTSTRAP unset or empty) — AcceptableInfoExit
#   1 — Kafka is configured but the probe failed (protocol-level failure)
set -uo pipefail

KAFKA_BOOTSTRAP="${KAFKA_BOOTSTRAP:-}"

# If KAFKA_BOOTSTRAP is not set, Kafka is not deployed in this environment.
# Return AcceptableInfoExit so the runner continues (Req 12.4).
if [[ -z "$KAFKA_BOOTSTRAP" ]]; then
    echo "[CAT7] KAFKA_BOOTSTRAP is not set — Kafka not configured in this environment — AcceptableInfoExit (exit 2)"
    exit 2
fi

# Derive a plain HTTP probe URL.  Kafka brokers expose a REST management port
# when Confluent REST Proxy or a health-check sidecar is present.
# Fall back to a TCP reachability check via curl's raw connect if the env
# supplies just a host:port.
KAFKA_PROBE_URL="${KAFKA_PROBE_URL:-}"

echo "[CAT7] Kafka bootstrap: ${KAFKA_BOOTSTRAP}"

if [[ -n "$KAFKA_PROBE_URL" ]]; then
    # Use the explicit probe URL if provided (e.g. REST Proxy or Redpanda Admin API)
    echo "[CAT7] Probing Kafka via HTTP: ${KAFKA_PROBE_URL}"
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 \
        "${KAFKA_PROBE_URL}" 2>/dev/null) || true
    curl_exit=$?

    if [[ $curl_exit -ne 0 || "$http_code" == "000" ]]; then
        echo "[FAIL] Kafka probe unreachable at ${KAFKA_PROBE_URL} (curl_exit=${curl_exit}, http_code=${http_code})" >&2
        exit 1
    fi

    if [[ "$http_code" =~ ^2 ]]; then
        echo "[PASS] Kafka probe responded with HTTP ${http_code}"
        exit 0
    fi

    echo "[FAIL] Kafka probe returned unexpected HTTP status: ${http_code}" >&2
    exit 1
else
    # No HTTP probe URL — perform a TCP connectivity check against the first
    # host:port in the bootstrap list.
    # Extract the first broker entry (handles comma-separated lists).
    first_broker=$(echo "$KAFKA_BOOTSTRAP" | cut -d',' -f1 | xargs)
    host=$(echo "$first_broker" | cut -d':' -f1)
    port=$(echo "$first_broker" | cut -d':' -f2)
    port="${port:-9092}"

    echo "[CAT7] TCP-probing Kafka broker at ${host}:${port}"

    # curl's --resolve or direct host:port form for TCP check (no HTTP needed)
    curl -s --connect-timeout 5 "telnet://${host}:${port}" >/dev/null 2>&1
    curl_exit=$?

    if [[ $curl_exit -eq 0 ]]; then
        echo "[PASS] Kafka broker TCP port is reachable at ${host}:${port}"
        exit 0
    else
        echo "[FAIL] Cannot reach Kafka broker at ${host}:${port} (curl_exit=${curl_exit})" >&2
        exit 1
    fi
fi
