#!/usr/bin/env bash
# Run SQL injection integration tests for S01-T01.
# Requires: local dev stack running (docker compose up), Java 17, Maven 3.9+

set -e

JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export JAVA_HOME PATH="$JAVA_HOME/bin:$PATH"
export MAVEN_OPTS="-Xmx512m -Djava.io.tmpdir=${TMPDIR:-/tmp}"

export DB_HOST=localhost
export DB_PORT=5438
export DB_NAME=hivearmor
export DB_USER=postgres
export DB_PASS=localdev123!
export ELASTICSEARCH_HOST=localhost
export ELASTICSEARCH_PORT=9200
export ELASTICSEARCH_USER=admin
export ELASTICSEARCH_PASSWORD=LocalDev@2024!
export GRPC_AGENT_MANAGER_HOST=localhost
export GRPC_AGENT_MANAGER_PORT=9000
export INTERNAL_KEY=localdevkey
export ENCRYPTION_KEY=localdevenckey
export SERVER_NAME=localdev
export EVENT_PROCESSOR_HOST=localhost
export EVENT_PROCESSOR_PORT=8085

MVN=/opt/homebrew/Cellar/maven/3.9.16/bin/mvn

cd "$(dirname "$0")"

echo "=== S01-T01 SQL injection tests ==="
$MVN test \
  -Dtest=UtmAssetGroupServiceSqlInjectionTest \
  -DfailIfNoTests=false \
  -Denforcer.skip=true \
  "-DargLine=-Djava.security.egd=file:/dev/./urandom -Xmx512m -Djava.io.tmpdir=${TMPDIR:-/tmp}"
