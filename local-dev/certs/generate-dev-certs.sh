#!/usr/bin/env bash
# Regenerate self-signed dev certs for local-dev.
# DO NOT USE IN PRODUCTION — use a proper CA or Let's Encrypt.
#
# Outputs (relative to this script's directory):
#   ca.crt / ca.key          — dev CA (trust anchor for agents/collector)
#   ha.crt / ha.key          — agent-manager gRPC server cert (CN=agent-manager)
#   opensearch.crt / .key    — OpenSearch HTTPS cert
#   opensearch-ca.crt        — copy of ca.crt for OpenSearch truststore
#
# After regenerating, restart the full stack:
#   cd local-dev && docker compose down && docker compose up -d
#
# Agents installed against this stack need to be reinstalled so they pick up
# the new CA cert from the dependency server.

set -euo pipefail
cd "$(dirname "$0")"

DAYS=3650
SUBJ_CA="/C=US/ST=Dev/O=HiveArmor Local Dev/CN=HiveArmor Local Dev CA"
SUBJ_AM="/C=US/ST=Dev/O=HiveArmor Local Dev/CN=agent-manager"
SUBJ_OS="/C=US/ST=Dev/O=HiveArmor Local Dev/CN=opensearch"

echo "[1/4] Generating CA key and self-signed certificate..."
openssl req -x509 -newkey rsa:4096 -keyout ca.key -out ca.crt \
  -days "$DAYS" -nodes -subj "$SUBJ_CA"

echo "[2/4] Generating agent-manager server cert..."
openssl req -newkey rsa:2048 -keyout ha.key -out ha.csr \
  -nodes -subj "$SUBJ_AM"
openssl x509 -req -in ha.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out ha.crt -days "$DAYS"
rm -f ha.csr

echo "[3/4] Generating OpenSearch server cert..."
openssl req -newkey rsa:2048 -keyout opensearch.key -out opensearch.csr \
  -nodes -subj "$SUBJ_OS"
openssl x509 -req -in opensearch.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out opensearch.crt -days "$DAYS"
rm -f opensearch.csr

echo "[4/4] Copying CA cert for OpenSearch truststore..."
cp ca.crt opensearch-ca.crt

chmod 600 ca.key ha.key opensearch.key

echo ""
echo "Done. Files written to $(pwd)"
echo "  ca.crt / ca.key"
echo "  ha.crt / ha.key"
echo "  opensearch.crt / opensearch.key"
echo "  opensearch-ca.crt"
echo ""
echo "Restart the stack:  cd local-dev && docker compose down && docker compose up -d"
