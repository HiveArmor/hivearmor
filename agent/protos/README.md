# Agent protobuf notes

## Canonical source of truth

**Enrollment and full AgentService/PanelService RPCs** are defined in:

`agent-manager/protos/agent.proto`

That tree is the **canonical** contract for agent-manager ↔ backend and enrollment
token RPCs (`CreateEnrollmentToken`, consume-on-register, credential rotate/revoke, etc.).

Related copies (must stay wire-compatible with the manager SoT):

| Tree | Role |
|---|---|
| `agent-manager/protos/` | **SoT** — generate manager stubs; enrollment + panel admin RPCs |
| `backend/src/main/proto/` | Backend gRPC client stubs (panel / agent types used by Java) |
| `agent/protos/` | **Subset** for the endpoint agent binary only |

## This directory (`agent/protos/`)

The checked-in stubs here are a **subset** used by the endpoint agent binary
(register, stream, ping, command result types). They intentionally omit some
manager-only enrollment admin RPCs.

When regenerating agent stubs, copy only the messages/services the agent calls
from the manager proto — do not delete enrollment RPCs from the manager tree
to “match” this subset.

## Sync rule (AGT-DOC-01 / AM-DOC-01)

1. Prefer editing **agent-manager** protos first for any new enrollment / panel RPC.
2. When the agent must call or decode a new message, copy the compatible subset
   into `agent/protos/` and regenerate Go stubs.
3. When the backend must call a new panel RPC, update `backend/src/main/proto/`
   from the same manager SoT and regenerate Java.
4. Run the drift check before merging proto changes:

```bash
bash agent/scripts/check-proto-subset.sh
```

The script is a **STAGING CANDIDATE** stub: it fails if required agent subset
RPC/message names are missing from the manager proto. Full protobuf AST / field
compatibility CI is deferred (AM-DOC-01 residual).

Do not treat `agent/protos/agent.proto` as complete for enrollment APIs.
