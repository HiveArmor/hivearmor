---
inclusion: fileMatch
fileMatchPattern: "{agent/**,agent-manager/**,utmstack-collector/**,as400/**,plugins/**,shared/**,installer/**}"
---

# Agent, Worker, and Plugin Conventions

## Agent (`agent/`)

Go 1.25.5 binary. Cross-compiled for Linux/Windows/macOS (amd64 + arm64).  
Runs as an OS system service via `kardianos/service`. CLI via `cobra`.  
**Phase 8 verified**: all 22 Go modules build cleanly with `go build ./...` on Go 1.26.4.

**Build requires ldflags:**
```bash
go build -ldflags "-X 'github.com/utmstack/UTMStack/agent/config.REPLACE_KEY=<secret>'" .
```
Without `REPLACE_KEY`, the agent cannot authenticate to agent-manager.

**Replace directive:** `agent/go.mod` has `replace github.com/utmstack/UTMStack/shared => ../shared`.
The agent **must be built from within the repo root** — it cannot be built in isolation.

**Responsibilities:**
- Register with agentmanager on first run → receive `id` + `key`
- Maintain gRPC bidirectional stream (`AgentStream`) to agentmanager
- Collect logs from: syslog UDP/TCP, file tail, Netflow UDP, auditd (Linux), platform events
- Buffer logs locally in SQLite on network failure
- Forward logs via gRPC to `com.utmstack.inputs` plugin
- Receive and execute remote commands; return results via the same stream
- Self-update via `agent/updater/` sub-module

**CLI commands:** `install`, `run`, `uninstall`, `enable-integration`, `disable-integration`, `change-port`, `change-retention`, `change-paths`, `load-tls-certs`, `clean-logs`

## Agent Manager (`agent-manager/`)

Go 1.25.5 gRPC server. Listens on port 9000 (TLS 1.3, min version enforced).

**Three-tier auth model** (implemented in `agent-manager/agent/interceptor.go`):
1. `connection-key` — for first registration only; validated against `POST /api/authenticateFederationServiceManager` on backend
2. `key/id/type` metadata — for all ongoing agent/collector operations; validated against in-memory cache
3. `internal-key` — for backend-originated panel operations; validated via `subtle.ConstantTimeCompare`

**gRPC services and their auth tier:**

| Service | Auth | Routes |
|---|---|---|
| `AgentService.RegisterAgent` | connection-key | Registration only |
| `AgentService.AgentStream`, `UpdateAgent`, `DeleteAgent` | key/id | Agent-side |
| `PanelService.ProcessCommand`, `ListAgents`, `ListAgentCommands` | internal-key | Backend-side |
| `CollectorService` | same pattern as AgentService | — |
| `PanelCollectorService` | internal-key | — |
| `PingService.Ping` | key/id | Heartbeat |

**In-memory state:**
- `AgentStreamMap` — active gRPC streams per agent ID (mutex-guarded)
- `CacheAgentKey` — agent ID → key (RWMutex-guarded; populated from DB on startup)
- `CommandResultChannel` — UUID → chan for command result routing (cleaned up after 5-min timeout)

`AgentService` and `CollectorService` are **singletons** initialised via `sync.Once`. Do not reinitialise them.

**Command flow:** Backend calls `PanelService.ProcessCommand` → agentmanager looks up stream by agent ID → sends `UtmCommand` to agent → waits on `CommandResultChannel` (5 min timeout) → returns result to backend.

## Collectors (`utmstack-collector/`, `as400/`)

Same ldflags pattern as agent. Same SQLite local buffer pattern.

`utmstack-collector` collects from cloud APIs: AWS, Azure, GCP, O365, CrowdStrike, Sophos, Bitdefender, GitHub.  
`as400` is a dedicated IBM AS/400 journal collector.

Both register as `collector` type with agentmanager using the `collector_key` / `id` credential pair.

## Plugins (`plugins/`)

Each plugin is a **standalone Go module** under `plugins/<name>/`. Built as `com.utmstack.<name>.plugin`.

All plugins use `github.com/threatwinds/go-sdk`. A plugin registers itself by calling one of:

```go
plugins.InitInputPlugin(...)       // com.utmstack.inputs
plugins.InitParsingPlugin(...)     // geolocation, aws, azure, gcp, o365, bitdefender, crowdstrike, sophos, modules-config
plugins.InitAnalysisPlugin(...)    // com.utmstack.events
plugins.InitCorrelationPlugin(...) // com.utmstack.alerts
plugins.InitNotificationPlugin(...)// com.utmstack.stats
```

There is also `plugins.PluginCfg(...)` for reading plugin config and `plugins.AcquireLock()` / `ReleaseLock()` for coordinating shared file writes.

**Plugin binaries must be named `com.utmstack.<name>.plugin`** — the eventprocessor base loads them by this naming convention.

**16 plugins are deployed** (in `event_processor.Dockerfile`). The 17th, `compliance-orchestrator`, is built but deliberately excluded. Do not add it to the Dockerfile without testing and approval.

**`com.utmstack.config` is the most critical plugin** — it polls PostgreSQL every 30 s and writes rules, filters, tenant config, and patterns to `workdir/`. Removing or disabling it freezes the entire configuration pipeline.

**`com.utmstack.alerts`** must never skip its deduplication and groupBy checks. These prevent alert storms. The 7-day dedup window and the parent/child grouping are intentional product behaviours.

## Shared Library (`shared/`)

Go 1.25.1. Provides: `archive`, `exec`, `fs`, `http`, `logger`, `svc` utilities.  
Consumed only by `agent/` and `agent/updater/` via `replace` directives. Not a public API.  
Do not import it from plugins or agent-manager — they use `go-sdk` directly.

## Installer (`installer/`)

Go 1.25.1. Provisions the entire stack on a fresh Ubuntu 22.04 host.

**Requires 4 ldflags at build time:**
```bash
go build -ldflags "
  -X 'installer/config.DEFAULT_BRANCH=<branch>'
  -X 'installer/config.INSTALLER_VERSION=<semver>'
  -X 'installer/config.REPLACE=<encryption-salt>'
  -X 'installer/config.PUBLIC_KEY=<pem-public-key>'
" .
```
CI injects these from GitHub Secrets. The `build.sh` placeholder values produce a non-functional binary.

After install, runs as a background service (`--run` flag), polls Customer Manager API for updates, and applies rolling image updates to the running Docker Swarm stack.

## General Go Conventions (match existing patterns)

**Error handling** — use `catcher.Error(...)` from `go-sdk`, not `fmt.Errorf`:
```go
return catcher.Error("what failed", err, map[string]any{"process": "plugin_com.utmstack.x"})
```

**Retries** — exponential backoff with 3 retries and log on every failure:
```go
retryDelay := 2 * time.Second
for retry := 0; retry < maxRetries; retry++ {
    if err == nil { return nil }
    time.Sleep(retryDelay)
    retryDelay *= 2
}
```

**Graceful shutdown** — all goroutines must accept a `context.Context` and return on `ctx.Done()`.

**Service startup** — on fatal error: log via `catcher.Error`, `time.Sleep(5 * time.Second)`, `os.Exit(1)`. Never `panic` in production paths.

**Plugin startup** — always check mode before starting heavy work:
```go
if plugins.GetCfg("plugin_com.utmstack.x").Env.Mode != "worker" { return }
```
