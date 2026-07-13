# Phase 8 — Go Module Updates

**Date**: June 2026  
**Status**: ✅ Complete  
**Risk**: Low — all modules already on current dependency versions  

## Summary

All Go modules were already at current dependency versions. No `go.mod` or `go.sum` changes
were required. `go mod tidy` confirmed consistency across all modules.

## Modules Verified

| Module | Go Version | Build | Tests |
|---|---|---|---|
| `agent/` | go 1.25.5 | ✅ | ✅ (no test files — vacuous pass) |
| `agent-manager/` | go 1.25.5 | ✅ | ✅ (no test files) |
| `utmstack-collector/` | go 1.25.5 | ✅ | — |
| `as400/` | go 1.25.5 | ✅ | — |
| `shared/` | go 1.25.1 | ✅ | — |
| `plugins/alerts` | go 1.25.5 | ✅ | — |
| `plugins/aws` | go 1.25.5 | ✅ | — |
| `plugins/azure` | go 1.25.5 | ✅ | — |
| `plugins/bitdefender` | go 1.25.5 | ✅ | — |
| `plugins/compliance-orchestrator` | go 1.25.5 | ✅ | — |
| `plugins/config` | go 1.25.5 | ✅ | — |
| `plugins/crowdstrike` | go 1.25.5 | ✅ | — |
| `plugins/events` | go 1.25.5 | ✅ | — |
| `plugins/feeds` | go 1.25.5 | ✅ | — |
| `plugins/gcp` | go 1.25.8 | ✅ | — |
| `plugins/geolocation` | go 1.25.5 | ✅ | — |
| `plugins/inputs` | go 1.25.5 | ✅ | — |
| `plugins/modules-config` | go 1.25.8 | ✅ | — |
| `plugins/o365` | go 1.25.5 | ✅ | — |
| `plugins/soc-ai` | go 1.25.5 | ✅ | — |
| `plugins/sophos` | go 1.25.5 | ✅ | — |
| `plugins/stats` | go 1.25.5 | ✅ | — |

## Known Build Blocker — installer/

`installer/` depends on `github.com/utmstack/license-manager-sdk v0.1.0` — a private
UTMStack repository (same pattern as `opensearch-connector` on the backend). The installer
cannot be built without org access credentials.

This is documented separately and does not affect any runtime services (agent, agent-manager,
collector, plugins) — those all build and run correctly.

## Key Dependency Versions (all current as of June 2026)

| Dependency | Version |
|---|---|
| `google.golang.org/grpc` | 1.81.1 |
| `github.com/gin-gonic/gin` | 1.12.0 |
| `gorm.io/gorm` | 1.31.1 |
| `gorm.io/driver/postgres` | 1.6.0 |
| `github.com/google/uuid` | 1.6.0 |
| `golang.org/x/crypto` | 0.52.0 |
| `golang.org/x/net` | 0.55.0 |
| `google.golang.org/protobuf` | 1.36.11 |

## Test Coverage Gap (tracking per testing.md)

Zero `*_test.go` files exist in any Go module. `go test ./...` passes vacuously.
Priority targets per `testing.md`:

1. `agent-manager/agent/interceptor.go` — `isInternalKeyValid`, `authHeaders`
2. `agent-manager/agent/agent_imp.go` — `ValidateAgentKey`
3. `plugins/alerts/main.go` — `isDuplicate`, `getPreviousAlertId`
4. `plugins/geolocation/` — IP lookup, missing-field handling

These are tracked for a future testing phase — not blocking Phase 8 completion.

## Next Phase

**Phase 9 — ECharts 4 → 5**: Upgrade `echarts`, `ngx-echarts`, `echarts-gl`, `echarts-wordcloud`
in the frontend. Visual regression check on all dashboard chart types.
