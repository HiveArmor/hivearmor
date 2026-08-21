#!/usr/bin/env bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ELASTICSEARCH_HOST=localhost
export ELASTICSEARCH_PORT=9200
export ELASTICSEARCH_USER=admin
export ELASTICSEARCH_PASSWORD='LocalDev@2024!'
export DB_HOST=localhost
export DB_PORT=5438
export DB_USER=postgres
export DB_PASS='localdev123!'
export DB_NAME=hivearmor
export INTERNAL_KEY=local-dev-internal-key-do-not-use-in-prod-12345678
export ENCRYPTION_KEY=ZjY4MDYwNWU0ZTQ3MGFkMjJiY2IzYjMyNzAyMGE5NzMxMjdhY2JhMmQ5MDg5MzVjMmJhMTZlY2I5ZjE0NDZiNg==
export GRPC_AGENT_MANAGER_HOST=localhost
export GRPC_AGENT_MANAGER_PORT=9000
export SERVER_NAME=localhost
export HIVEARMOR_ENCRYPTION_KEY=XDv9ooNP0JE2FhMyGDJDPHcostNIRsYNdqEVkXMlyDc=
export SOC_AI_BASE_URL=http://localhost:8090
export EVENT_PROCESSOR_HOST=localhost
export EVENT_PROCESSOR_PORT=9002
export APP_TFA_ENABLED=false
export ELASTICSEARCH_CA_CERT=
export JHIPSTER_CORS_ALLOWED_ORIGINS='http://localhost:3000,http://localhost:5173'
export LLM_PROVIDER=disabled
mvn -s settings.xml spring-boot:run -Dmaven.test.skip=true -Denforcer.skip=true -Dspring-boot.run.profiles=dev
