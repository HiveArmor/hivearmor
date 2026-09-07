#!/usr/bin/env bash
# AM-DOC-01 — lightweight agent proto subset ⊆ agent-manager SoT check.
#
# Status: STAGING CANDIDATE stub (name-level presence only; not full wire-compat).
# Full protobuf AST / field number drift CI is deferred.
#
# Usage: bash agent/scripts/check-proto-subset.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AGENT_PROTO="$ROOT/agent/protos/agent.proto"
MANAGER_PROTO="$ROOT/agent-manager/protos/agent.proto"

if [[ ! -f "$AGENT_PROTO" ]]; then
  echo "ERROR: missing $AGENT_PROTO" >&2
  exit 1
fi
if [[ ! -f "$MANAGER_PROTO" ]]; then
  echo "ERROR: missing $MANAGER_PROTO" >&2
  exit 1
fi

# Required symbols the endpoint agent relies on (must exist in manager SoT).
REQUIRED=(
  AgentService
  AgentStream
  RegisterAgent
  UpdateAgent
  DeleteAgent
  BidirectionalStream
  RemoteCommand
  CommandResult
  PanelService
  ProcessCommand
)

fail=0
for sym in "${REQUIRED[@]}"; do
  if ! grep -Eq "(service|rpc|message)[[:space:]]+${sym}\\b" "$MANAGER_PROTO"; then
    echo "FAIL: manager proto missing required symbol: $sym" >&2
    fail=1
  fi
  if ! grep -Eq "(service|rpc|message)[[:space:]]+${sym}\\b" "$AGENT_PROTO"; then
    # PanelService / ProcessCommand may be manager-facing only in agent tree —
    # warn but do not fail when agent subset intentionally omits panel admin.
    if [[ "$sym" == "PanelService" || "$sym" == "ProcessCommand" ]]; then
      echo "note: agent subset omits $sym (expected if agent only implements AgentService stream)"
      continue
    fi
    echo "FAIL: agent subset missing required symbol: $sym" >&2
    fail=1
  fi
done

# Enrollment RPCs must live in manager SoT (agent subset may omit).
for sym in CreateEnrollmentToken ListEnrollmentTokens RevokeEnrollmentToken; do
  if ! grep -Eq "rpc[[:space:]]+${sym}\\b" "$MANAGER_PROTO"; then
    echo "WARN: manager SoT missing enrollment RPC $sym (verify intentional)" >&2
  fi
done

if [[ "$fail" -ne 0 ]]; then
  echo "proto subset check FAILED — see agent/protos/README.md (AM-DOC-01)" >&2
  exit 2
fi

echo "OK: agent proto subset symbols present in manager SoT (name-level stub check)"
