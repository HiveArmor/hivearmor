#!/usr/bin/env bash
# SOC-AI Plugin — Standalone Mode Runner
# Run this to start the plugin locally without the full HiveArmor gRPC infrastructure.
#
# Usage:
#   export SOC_AI_API_KEY="sk-..."           # your LLM API key
#   export SOC_AI_PROVIDER="openai"          # or anthropic, gemini, ollama, etc.
#   export SOC_AI_MODEL="gpt-4o"             # model name
#   ./run-standalone.sh
#
# The backend internal key is read from ../local-dev/.env automatically.
# All env vars can be overridden.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load backend internal key from local-dev .env if not already set
if [[ -z "${SOC_AI_INTERNAL_KEY:-}" ]]; then
  ENV_FILE="$SCRIPT_DIR/../../local-dev/.env"
  if [[ -f "$ENV_FILE" ]]; then
    INTERNAL_KEY_VAL=$(grep '^INTERNAL_KEY=' "$ENV_FILE" | cut -d'=' -f2-)
    export SOC_AI_INTERNAL_KEY="${INTERNAL_KEY_VAL}"
    echo "Using INTERNAL_KEY from local-dev/.env"
  fi
fi

# Required
: "${SOC_AI_PROVIDER:?Set SOC_AI_PROVIDER (openai|anthropic|gemini|ollama|mistral|deepseek|groq)}"
: "${SOC_AI_API_KEY:?Set SOC_AI_API_KEY}"
: "${SOC_AI_MODEL:?Set SOC_AI_MODEL (e.g. gpt-4o or claude-3-5-sonnet-20241022)}"

# Defaults
export SOC_AI_STANDALONE="true"
export SOC_AI_BACKEND_URL="${SOC_AI_BACKEND_URL:-http://localhost:8088}"
export SOC_AI_INTERNAL_KEY="${SOC_AI_INTERNAL_KEY:-local-dev-internal-key-do-not-use-in-prod-12345678}"
export SOC_AI_OPENSEARCH_URL="${SOC_AI_OPENSEARCH_URL:-https://localhost:9200}"
export SOC_AI_OPENSEARCH_USER="${SOC_AI_OPENSEARCH_USER:-admin}"
export SOC_AI_OPENSEARCH_PASS="${SOC_AI_OPENSEARCH_PASS:-LocalDev@2024!}"

# Build if binary is missing or source is newer
BINARY="$SCRIPT_DIR/soc-ai-plugin"
NEEDS_BUILD=false

if [[ ! -f "$BINARY" ]]; then
  NEEDS_BUILD=true
elif find "$SCRIPT_DIR" -name "*.go" -newer "$BINARY" | grep -q .; then
  NEEDS_BUILD=true
fi

if $NEEDS_BUILD; then
  echo "Building soc-ai-plugin..."
  (cd "$SCRIPT_DIR" && go build -o "$BINARY" .)
  echo "Build complete."
fi

echo ""
echo "Starting SOC-AI plugin (standalone mode)"
echo "  Provider : $SOC_AI_PROVIDER"
echo "  Model    : $SOC_AI_MODEL"
echo "  Backend  : $SOC_AI_BACKEND_URL"
echo "  Port     : 8090"
echo ""

exec "$BINARY"
