#!/bin/sh
# docker-entrypoint.sh — import the HiveArmor local-dev CA cert into the JVM
# trust store so the startup OpenSearch TLS check succeeds.
# The cert is on a mounted volume (/cert/ca.crt), so this must run at container
# start (not at image build time).

set -e

CA_CERT="${ELASTICSEARCH_CA_CERT:-/cert/ca.crt}"
JAVA_CACERTS="${JAVA_HOME}/lib/security/cacerts"

if [ -f "$CA_CERT" ]; then
    # Only import if not already present (idempotent across restarts)
    if ! keytool -list -cacerts -storepass changeit -alias hivearmor-local-dev-ca > /dev/null 2>&1; then
        echo "[entrypoint] Importing $CA_CERT into JVM cacerts..."
        keytool -importcert \
            -noprompt \
            -cacerts \
            -storepass changeit \
            -alias hivearmor-local-dev-ca \
            -file "$CA_CERT" \
            > /dev/null 2>&1 && echo "[entrypoint] CA cert imported." \
            || echo "[entrypoint] WARNING: cert import failed — startup may fail if self-signed cert is not trusted"
    else
        echo "[entrypoint] CA cert already in JVM trust store."
    fi
else
    echo "[entrypoint] WARNING: $CA_CERT not found — skipping cert import"
fi

exec java \
    "-Djakarta.json.provider=org.eclipse.parsson.JsonProviderImpl" \
    "-Dorg.eclipse.parsson.JsonProviderImpl=true" \
    -jar /hivearmor.war "$@"
