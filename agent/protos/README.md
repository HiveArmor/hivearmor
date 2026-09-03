# Agent protobuf notes

## Canonical source of truth

**Enrollment and full AgentService/PanelService RPCs** are defined in:

`agent-manager/protos/agent.proto`

That tree is the **canonical** contract for agent-manager ↔ backend and enrollment
token RPCs (`CreateEnrollmentToken`, consume-on-register, credential rotate/revoke, etc.).

## This directory (`agent/protos/`)

The checked-in stubs here are a **subset** used by the endpoint agent binary
(register, stream, ping, command result types). They intentionally omit some
manager-only enrollment admin RPCs.

## Sync rule (AGT-DOC-01)

1. Prefer editing **agent-manager** protos first for any new enrollment / panel RPC.
2. When the agent must call or decode a new message, copy the compatible subset
   into `agent/protos/` and regenerate Go stubs.
3. CI should eventually wire-compat check agent subset ⊆ manager proto (see
   `.plan/audits/AGENT_PLATFORM_EXTERNAL_WORK.md` AM-DOC-01).

Do not treat `agent/protos/agent.proto` as complete for enrollment APIs.
