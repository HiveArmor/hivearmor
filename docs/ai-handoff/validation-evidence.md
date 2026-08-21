# Validation evidence

Append-only. Record commands, environment, result and unresolved limitation. A screenshot is visual evidence, not a backend or security test.

## 2026-08-13 18:21:42 IST (UTC+05:30) — Handoff baseline

- Repository: `/Users/encryptshell/GIT/HiveArmor-v1`
- Branch/HEAD: `main` / `b749b485b45644e40cf0c27dc516d86b7fd9887e`
- Worktree was already heavily dirty: 148 modified, 278 deleted, 657 untracked.
- Docker discovery command `docker compose ps --format json` from repository root returned “no configuration file provided”; no root compose environment was assumed running from that result.
- Vulnerability frontend, service/types and Java resource/service/DTO were inspected before redesign.
- No vulnerability-specific frontend tests were found at baseline.

No production-readiness claim is made by this baseline entry.

## 2026-08-13 18:42:00 IST (UTC+05:30) — Vulnerability Operations slice

- Focused tests: `npm run test -- --run src/pages/posture/vulnerabilities/VulnerabilitiesPage.test.tsx src/services/vulnService.test.ts` — **7/7 passed**.
- TypeScript: `npm run type-check` — **passed**.
- Repository frontend lint: `npm run lint` — **passed with zero warnings**.
- Complete frontend suite: `npm run test` — **1,046/1,046 tests passed across 165 files**. Two jsdom “navigation not implemented” messages were emitted by unrelated hyperlink behavior; exit status was zero.
- Production build: `npm run build` — **passed**, producing `frontend-v3/dist/`.
- Authenticated fixture-disabled browser: `http://127.0.0.1:4176/posture/vulnerabilities` loaded with the compact shell, fleet summary, filters, safe empty state, sticky pager and status dock. Severity filter transitioned to the filtered empty state. Browser console had **zero warnings/errors**.
- Live backend returned zero vulnerability findings and zero summary counts. Consequently the zero-row workflow is live-verified, while actual live row rendering, drawer data and multi-page navigation remain automated-test evidence only.
- Backend gaps were reconciled and timestamped as `VUL-001`–`VUL-007`; no backend implementation was added in this slice.

## 2026-08-14 10:53:08 IST (UTC+05:30) — CIS Benchmark Posture slice

- Focused tests: `npx vitest run src/pages/posture/cis-benchmark/CisBenchmarkPage.test.tsx src/services/vulnService.test.ts` — **8/8 passed**.
- TypeScript: `npm run type-check` — **passed**.
- Repository frontend lint: `npm run lint` — initially failed on one new hook-dependency warning; after memoizing the summary fallback it **passed with zero warnings**.
- Complete frontend suite: `npm run test` — **1,052/1,052 tests passed across 166 files**. Two jsdom “navigation not implemented” notices were emitted by unrelated hyperlink behavior; exit status was zero.
- Production build: `npm run build` — **passed**, producing `frontend-v3/dist/`.
- Authenticated fixture-disabled browser: `http://127.0.0.1:4176/posture/cis-benchmark` rendered the compact shell, weighted technical summary, filters, priority safe-empty state, icon density controls, sticky pager and status dock. Switching to all outcomes produced the explicit unfiltered “No assessment results were returned” state. Browser console had **zero warnings/errors**.
- Live backend returned zero SCA rows and zero summary records. The zero-row workflow is live-verified; actual row rendering, drawer evidence, mappings and multi-page navigation remain automated-test evidence only.
- Backend gaps were reconciled and timestamped as `CIS-001`–`CIS-008`; no backend implementation or synthetic SCA storage was added in this slice.
- Branch/HEAD remained `main` / `b749b485b45644e40cf0c27dc516d86b7fd9887e`. Worktree remained user-owned and heavily dirty (`148` modified, `278` deleted, `658` untracked at snapshot).

## 2026-08-14 11:26:51 IST (UTC+05:30) — Production-minimum backend planning audit

- Branch/HEAD: `main` / `b749b485b45644e40cf0c27dc516d86b7fd9887e`.
- Worktree remained user-owned and heavily dirty: 426 tracked modified/deleted status entries and 658 untracked entries at the planning snapshot. No unrelated file was changed intentionally.
- Inspected agent registration, TLS connection, local log queue/SQLite retry and collector drop behavior under `agent/`.
- Inspected agent-manager authentication interceptors, registration/key storage, list synchronization surface and deletion audit logging under `agent-manager/`.
- Inspected inputs TLS/authentication, default tenant assignment, Kafka producer, acknowledgement and auth-cache behavior under `plugins/inputs/`.
- Inspected event-processor Kafka consumer, processing orchestration, event writer and alert writer. Confirmed duplicate event-write paths, commit-after-event-only behavior, swallowed alert errors and production `InsecureSkipVerify` transports.
- Inspected `local-dev/docker-compose.yml`, Kafka topic setup, current Dockerfiles, legacy installer composition and active workflow references. Confirmed split frontend-v2/v3 packaging, no frontend-v3 production container, floating installer database/search images and missing current broker topology in the installer.
- Reconciled `DET-ING-001`/`DET-ING-002` rather than replacing their live evidence; recorded new cross-service requirements as `SIEM-001`–`SIEM-010` with a full timestamp.
- Created the offline authoritative-source research note, phased production-minimum backend plan and execution ledger.
- No application code, migration, deployment configuration or production data was changed. No tests or builds were run because this turn was an architecture/contract planning audit; implementation evidence remains `PLANNED`.

## 2026-08-14 11:57:50 IST (UTC+05:30) — PILOT-00 raw-event contract implementation

- Branch/HEAD remained `main` / `b749b485b45644e40cf0c27dc516d86b7fd9887e`; the pre-existing worktree remained heavily dirty and unrelated changes were preserved.
- `plugins/inputs`: `GOCACHE=/tmp/hivearmor-pilot00-go-cache go test ./...` — **passed**. Tests cover v1 envelope/header/key construction and rejection of nil, missing identity and invalid timestamps.
- `event-processor`: `GOCACHE=/tmp/hivearmor-pilot00-go-cache go test ./kafka` — **passed**. Tests cover v1 acceptance, legacy compatibility, tenant mismatch and schema-downgrade rejection.
- Full Go regression: `go test ./...` with the temporary build cache passed for `agent`, `agent-manager` and `plugins/inputs`. Full `event-processor go test ./...` passed when rerun outside the restricted socket sandbox; the sandbox-only attempt could not bind loopback/Unix test listeners.
- Frontend regression: `npm run type-check`, `npm run lint`, `npm run test -- --run` and `npm run build` in `frontend-v3` — **passed**. Complete suite: **1,052/1,052 tests across 166 files**; two existing non-fatal jsdom navigation notices remained.
- Compose syntax: `docker compose --env-file .env config -q` in `local-dev` — **passed**.
- Schema parse and Go formatting/diff checks — **passed**.
- Backend first ran under the shell default Java 21 and was correctly rejected by the Maven enforcer. The full suite was rerun under Temurin 17. It did **not** pass: existing failures include reflective environment mutation in `HaLlmServicePropertyTest`, YAML expectation drift in `YamlRequiredKeyPropertyTest`, Mockito/property failures including `MsspOverviewServicePropertyTest`, followed by a Surefire fork exit. No Java code was changed by `PILOT-00`; these failures remain release-gate baseline debt and are not hidden by the focused Go success.
- No running Redpanda/container rebuild or real-agent event was used to claim `LIVE VERIFIED`. Broker outage, replay, DLQ and zero-loss evidence belongs to `PILOT-03`/`PILOT-09`.

## 2026-08-14 14:01:07 IST (UTC+05:30) — PILOT-01 secure enrollment implementation

- Branch/HEAD remained `main` / `b749b485b45644e40cf0c27dc516d86b7fd9887e`. The worktree was already heavily dirty; unrelated user-owned files were preserved.
- Agent-manager regression: `GOCACHE=/private/tmp/hivearmor-go-cache go test ./...` — **passed**. Tests cover enrollment-token parsing; wrong secret/platform; expired, exhausted and revoked tokens; bcrypt device credentials; and constant-time legacy comparison. The opt-in running-stack test is skipped unless explicitly enabled.
- Agent bootstrap regression: `GOCACHE=/private/tmp/hivearmor-agent-go-cache go test ./cmd ./agent` — **passed**. Tests cover stdin, required source, protected `0600` file and rejection of broader file permissions.
- Race check: `GOCACHE=/private/tmp/hivearmor-go-race-cache go test -race ./agent` in `agent-manager` — **passed**.
- Focused backend test: `JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home /opt/homebrew/bin/mvn -s settings.xml -Dtest=HaAgentEnrollmentResourceTest test` — **4/4 passed**. It verifies authorized tenant-context derivation, fail-closed missing tenant, Admin/SOC Manager method security and diagnostic secret redaction.
- Backend package: the same Temurin 17 environment with `-DskipTests package` — **passed**, producing the repackaged WAR. Maven emitted the existing sandbox-only warning that it could not update a resolver tracking file below `~/.m2`; compilation/package still exited zero.
- Secret-log static check over the changed agent-manager, agent and backend enrollment packages found no direct token/device-key logging. The only matches were fail-closed messages such as “enrollment secrets are not accepted as command arguments” and non-secret invalid-key status text.
- Local images: `docker compose build agentmanager` and `docker compose build backend` — **passed**. `docker compose up -d --no-deps agentmanager backend` recreated only those two services; `docker compose ps agentmanager backend` reported both **healthy**.
- First live authenticated create reproduced HTTP 500. Backend correlation `98134247-3240-4bd3-9094-ac634ace7b61` exposed the safe gRPC detail `INTERNAL: could not protect enrollment token`. Root cause was bcrypt's 72-byte input ceiling applied to the full versioned token. The implementation was corrected to domain-separated SHA-256 pre-hash followed by bcrypt and regression tests were rerun.
- After rebuild, an authenticated tenant-scoped `POST /api/ha-agent-enrollments` passed through the running backend and agent-manager with **HTTP 201**. The one-time token and internal key were written only to `0600` temporary files and were not printed. All host and container temporary secret files were deleted after the attempt.
- The checked-in `TestLiveEnrollmentReplay` is designed to launch two simultaneous registrations against the one-use token, require exactly one success, reject a forged agent ID, revoke the winner through internal authorization and reject the old key immediately. Its temporary Docker-sidecar execution was **not run**: approval was rejected after the current account hit its usage ceiling. This is a recorded external execution blocker, not a passed test.
- No real Windows or Linux package was installed in this slice. Reconnect, rotate, lost-device, re-enroll and immutable audit acceptance remain required. `PILOT-01` therefore remains `IN PROGRESS`, not `CODE COMPLETE`, `LIVE VERIFIED` or `PRODUCTION READY`.

## 2026-08-14 14:26:49 IST (UTC+05:30) — PILOT-01 final hardening and handoff reconciliation

- Added manager-authoritative validation for the four canonical platform values, the `macos`→`darwin` alias, 128-character policy IDs, 255-character actors and a maximum 24-hour token lifetime. Added negative Go tests for every bound.
- Reconciled the bcrypt verifier against OWASP's documented 72-byte/binary-prehash cautions: the versioned SHA-256 digest is now URL-safe Base64 text (43 bytes) before bcrypt. A live read-only database check found **0 active enrollment tokens** before this verifier-format refinement; no issued active token was invalidated.
- Added an explicit Spring Security matcher for `/api/ha-agent-enrollments/**` admitting Admin/SOC Manager before the generic `/api/**` Admin/User rule; retained class-level method authorization as defense in depth. Added `@Size(max=128)` to the REST policy value.
- `GOCACHE=/private/tmp/hivearmor-go-cache go test ./...` in `agent-manager` — **passed** after hardening.
- `GOCACHE=/private/tmp/hivearmor-go-race-cache go test -race ./agent` in `agent-manager` — **passed**.
- `GOCACHE=/private/tmp/hivearmor-agent-go-cache go test ./cmd ./agent` in `agent` — **passed**.
- Focused Temurin 17 Java test `-Dtest=HaAgentEnrollmentResourceTest test` — **4/4 passed**. Temurin 17 `-DskipTests package` — **passed**. The existing restricted-filesystem Maven resolver warning under `~/.m2` remained non-fatal.
- Two initial agent-manager image rebuild attempts failed only on Go proxy HTTP/2 stream resets. The Dockerfile was corrected to copy `go.mod`/`go.sum` before source, remove network-mutating `go mod tidy`, use a BuildKit module cache and force HTTP/1.1 for download. The next scoped agent-manager/backend build **passed**.
- The unused `pilot-live-acceptance` token ID `1d598eb0-465b-4e25-affb-b78a5f4c0ce9` was found with `use_count=0` and revoked in the agent-manager database with actor `codex-acceptance-cleanup`, reason `orphaned live acceptance token cleanup`, and version increment `1→2`. Its one-time secret had already been destroyed and was never printed.
- Final agent-manager and newly packaged backend images were rebuilt and restarted without touching other services. `docker compose ps agentmanager backend` reported both **healthy**; startup logs contained no enrollment errors.
- A host-sandbox HTTP request could not reach local port 8088. The required escalation for the final bounded create/revoke acceptance was rejected because the account approval service reported its usage ceiling. Per policy, the check was not worked around or claimed. The earlier HTTP 201 create remains valid evidence for the pre-final-hardening path; the final lifetime/alias/role behavior is automated-test and healthy-image evidence only.
- `TestLiveEnrollmentReplay` and packaged Windows/Linux lifecycle acceptance remain unexecuted for the same recorded external approval constraint. `PILOT-01` remains `IN PROGRESS`.

## 2026-08-14 14:34:46 IST (UTC+05:30) — final runtime and handoff checkpoint

- `docker compose ps agentmanager backend` in `local-dev` confirmed the final Base64-verifier agent-manager image and packaged backend are both **healthy** after restart.
- The handoff index, current-state snapshot, next-slice instructions, backend ledger and contract register were reconciled to this exact checkpoint. No unrelated worktree changes were modified.
- This health confirmation does not replace the blocked post-hardening HTTP acceptance, the two-client replay/forged-identity/revoked-key test or real Windows/Linux lifecycle acceptance. `PILOT-01` remains `IN PROGRESS`.

## 2026-08-18 12:30:06 IST (UTC+05:30) — PILOT-01 immutable enrollment-audit implementation and live acceptance

- Branch/HEAD remained `main` / `b749b485b45644e40cf0c27dc516d86b7fd9887e`. The pre-existing user-owned worktree remained heavily dirty (`178` modified, `278` deleted, `701` untracked at the final snapshot); unrelated changes were preserved.
- Implemented allowlisted enrollment/credential audit events for token create, consume and revoke plus credential rotate and revoke. Each event is appended inside the same transaction as its state mutation. Added a PostgreSQL `BEFORE UPDATE OR DELETE` trigger that rejects audit-row mutation, safe bounded list/filter queries, internal gRPC projection and tenant-derived Admin/SOC Manager REST projection. Credential rotate/revoke now require a bounded reason.
- Protobuf generation: Homebrew `protoc` with the repository Go plugins regenerated `agent-manager/agent/agent.pb.go` and `agent_grpc.pb.go`; Temurin 17 Maven `generate-sources` regenerated the checked-in Java stubs. Generated Java trailing whitespace was removed mechanically after Maven regeneration.
- Focused agent-manager checks: `GOCACHE=/private/tmp/hivearmor-agent-manager-audit-cache go test ./agent ./database ./models ./config` — **passed**.
- Full agent-manager regression: `GOCACHE=/private/tmp/hivearmor-agent-manager-audit-full go test ./...` — **passed**.
- Agent-manager race check: `GOCACHE=/private/tmp/hivearmor-agent-manager-audit-race go test -race ./agent` — **passed** in 23.483 seconds.
- Focused backend test: Temurin 17 Maven `-Dtest=HaAgentEnrollmentResourceTest test` — **6/6 passed**. It covers exact tenant-scoped audit totals/projection and forwarding of explicit credential-change reasons in addition to the prior role/tenant/redaction cases.
- Backend production package: Temurin 17 Maven `-Pprod -DskipTests package` — **passed**. Maven continued to emit the known restricted-filesystem warning when attempting to update a resolver tracking file below `~/.m2`; it did not fail compilation or packaging.
- Image/runtime: `docker compose build agentmanager backend` — **passed**; `docker compose up -d --no-deps agentmanager backend` restarted only the two changed services; both reported **healthy**.
- Live one-use acceptance: `TestLiveEnrollmentReplay` ran against `127.0.0.1:9000` with TLS CA validation and `0600` temporary token/internal-key files — **passed**. Two concurrent registrations produced exactly one winner; the replay received `PermissionDenied`; a forged numeric agent ID was denied; internal credential revoke succeeded; the old key was denied immediately; token-consumed and credential-revoked events were returned for the winning agent. No secret was printed, and temporary files were deleted.
- Live REST audit acceptance: authenticated tenant `1` create and `GET /api/ha-agent-enrollments/audit?page=0&size=100` — **passed**. The response included created/consumed/credential-revoked event types and contained no token, token hash, credential, credential hash, MAC, IP or hostname fields. The one unused short-lived acceptance token from an earlier failed harness invocation was subsequently revoked through the authenticated API; no active acceptance token remained.
- Database integrity acceptance: verified one non-internal `enrollment_audit_events_append_only` trigger, five audit rows and zero forbidden secret/endpoint columns. Direct SQL `UPDATE` and `DELETE` statements under `ON_ERROR_STOP=1` both failed with the append-only trigger error — **passed**. The attempted mutations did not alter or remove a row.
- Repository-wide Java test suite: `JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home mvn -B -s settings.xml test` — **failed on the known unrelated baseline**, with 348 tests discovered, zero assertion failures and nine errors. Categories were Java-module reflective environment mutation in three `HaLlmServicePropertyTest` cases, unavailable PostgreSQL in `HaClientPrefixUniquenessPropertyTest`, Mockito setup in `MsspOverviewServicePropertyTest`, two invalid-path generators in `HaRuleGenerationServiceFilePropertyTest`, and two YAML expectation/LLM retry cases in `YamlRequiredKeyPropertyTest`, followed by the existing Surefire fork-exit report. No error was in the enrollment resource or agent-manager slice.
- `PILOT-01` remains `IN PROGRESS`. Live replay/forged/revoked/audit/tamper gates are now complete; supported packaged Windows and Linux install/restart/reconnect/rotate/lost-device revoke/authorized re-enroll acceptance remains the phase-closing gate.

## 2026-08-18 13:11:42 IST (UTC+05:30) — PILOT-01 endpoint credential and release-artifact hardening

- Implemented a versioned local device-credential envelope using AES-256-GCM, random nonces and HKDF-SHA256 domain separation bound to the installation UUID. Configuration and UUID YAML are written by owner-only `0600` temporary files, synced and atomically replaced. The prior AES-CBC envelope is read only for migration and is upgraded on the next save. This remains defense in depth over a build-injected wrapping key; platform keystore/device-certificate work remains under `SIEM-007`.
- Added `rotate-credential --credential-file <path|->`. It accepts no secret argument, enforces the credential prefix, validates the issued value against agent-manager before persistence, atomically saves it, restarts an active service and leaves an inactive service stopped. Added unit tests for stdin parsing, validate-before-save ordering and fail-closed invalid credentials.
- Hardened manager behavior so authenticated `UpdateAgent` never echoes a credential. An active non-revoked hostname/MAC duplicate remains blocked; after explicit credential revocation, a fresh authorized one-use token may replace the lost/rebuilt device with a distinct identity.
- Extended the opt-in live lifecycle test to prove rotation invalidates the old key, the rotated key authenticates without response echo, revocation denies reconnect, fresh-token same-device re-enrollment succeeds, the replacement reconnects, cleanup revocation succeeds and required consume/rotate/revoke audit records exist.
- Rebuilt/restarted only agent-manager before acceptance; `docker compose ps backend agentmanager` reported both containers healthy. Tenant-scoped authenticated live acceptance over TLS gRPC port `9000` passed in 1.88 seconds. The latest secret-free REST audit projection showed the expected created, consumed, rotated and revoked event sequence. All temporary token/internal-key files were mode `0600`, deleted by traps and never printed.
- Two pre-registration harness errors were encountered and safely cleaned up: one used a package-relative CA path and one targeted HTTP port `9001` instead of gRPC `9000`. Their unused token IDs `966217d5-f389-43d6-ab22-5e4b62960278` and `d0f01b75-d82e-4bca-aa3e-b025d04dea78` were explicitly revoked through the authenticated tenant-scoped API with audit reasons before the successful run.
- Full agent `go test ./...` and agent-manager `go test ./...` — **passed**. Focused `go test -race ./config ./cmd ./agent` and `go test -race ./agent` — **passed**. `go vet ./...` in both modules — **passed**.
- Linux and Windows amd64/arm64 agent builds and updater builds — **passed** with `CGO_ENABLED=0`. The acceptance binaries used an explicitly non-production wrapping-key marker and are not release artifacts.
- Added deterministic Linux `tar.gz` and Windows `zip` package assembly containing agent, updater, `INSTALL.md` and embedded `SHA256SUMS`. All four archives were generated and their contents inspected locally — **passed**. The deployment workflow now also publishes external SHA-256 checksums and GitHub build provenance.
- Production Windows/macOS signing now fails closed when signing credentials are unavailable. An unsigned fallback is possible only when the reusable workflow is explicitly invoked for non-production. Workflow YAML parsed, package script passed `bash -n`, relevant diffs passed whitespace checks, and retired shared-secret install syntax/static silent-signing fallback scans were clean.
- This checkpoint does **not** prove installation under Windows Service Control Manager or Linux systemd, does not prove actual signed CI artifacts, and does not complete platform keystore/mTLS, the running HTTP role/tenant/input-bound matrix, SBOM/vulnerability gates or release-level outage/soak/restore evidence. `PILOT-01` therefore remains `IN PROGRESS` and the product is not yet production ready.

## 2026-08-18 13:37:18 IST (UTC+05:30) — PILOT-01 REST boundary and RFC problem hardening

- Fixed enrollment-specific exception advice so scoped `ResponseStatusException` values retain their intended HTTP status/detail instead of becoming generic 500 responses. Fixed `TenantContextFilter` to write and commit RFC problem responses directly, preventing `/error` redispatch from converting an unknown tenant into 401. Added filter/controller regression tests.
- Fixed duplicate RFC extension serialization by ignoring the custom Java accessors as Jackson bean properties while retaining values in `ProblemDetail.properties`. A serialization regression test and a live invalid-request probe each confirmed exactly one `correlationId` and one `fieldErrors` key.
- Focused enrollment, tenant-filter and problem-serialization tests — **12 passed, 0 failures**. The broader relevant tenant/enrollment suite — **31 passed, 0 failures**. Maven production package with Java 17 — **passed**. The rebuilt backend and agent-manager containers reported healthy.
- Authenticated live REST matrix — **passed**: `macos` persisted as `darwin`; create `201`; revoke `200`; expiry over 24 hours `400`; negative page `400`; size over 100 `400`; missing tenant `400`; invalid tenant `400`; unknown tenant `404`; unauthenticated tenant `401`. The temporary token was revoked and no one-time secret was printed.
- The complete backend test command executed **372 tests with 0 assertion failures and 9 errors across five unrelated baseline classes**. Recorded categories: three `InaccessibleObjectException` errors from reflective mutation of `ProcessEnvironment`; two sandbox-denied Unicode rule-file writes; one sandbox-denied PostgreSQL connection; one existing Mockito `MissingMethodInvocationException`; and two existing YAML required-key property errors. This is a failed full-suite gate, not a pass and not attributed to the enrollment changes.
- `PILOT-01` remains `IN PROGRESS`. Real Windows SCM/Linux systemd lifecycle, authenticated Analyst/SOC Manager and cross-tenant packaged-host acceptance, actual signed CI artifacts and repository-wide baseline reconciliation remain required. The product is not production ready.

## 2026-08-18 15:30:51 IST (UTC+05:30) — PILOT-01 packaged-host acceptance harnesses

- Branch/HEAD remained `main` / `b749b485b45644e40cf0c27dc516d86b7fd9887e`. The worktree remained user-owned and heavily dirty; unrelated files were preserved.
- Added `agent/release/PILOT-01-PACKAGED-HOST-ACCEPTANCE.md` to define the remaining real Windows/Linux acceptance evidence for `PILOT-01` without changing the enrollment contract.
- Added `agent/release/verify-packaged-linux.sh` to create a tenant-scoped one-time enrollment token through `POST /api/ha-agent-enrollments`, install the unpacked Linux package, exercise `HiveArmorAgent` service-manager start/stop/restart, rotate and revoke the device credential through the real REST resource, confirm audit events and record safe JSON output. The script also checks that the enrollment token and rotated credential do not appear in local logs or process arguments.
- Added `agent/release/verify-packaged-windows.ps1` to perform the same packaged-host acceptance flow from an elevated PowerShell session using the Windows package and Service Control Manager.
- Syntax verification: `bash -n /Users/encryptshell/GIT/HiveArmor-v1/agent/release/verify-packaged-linux.sh` — **passed**.
- Windows parse verification was **not run** because `pwsh` is not installed in the current workspace shell (`command not found: pwsh`). The PowerShell harness was inspected manually only; no claim is made beyond the checked-in script content.
- No live Windows or Linux packaged-host execution was performed in this session. `PILOT-01` therefore remains `IN PROGRESS`; the harnesses reduce drift for the remaining gate but do not replace actual host evidence.

## 2026-08-18 16:16:32 IST (UTC+05:30) — PILOT-02 identity-derived ingress

- Branch/HEAD remained `main` / `b749b485b45644e40cf0c27dc516d86b7fd9887e`. The worktree remained user-owned and heavily dirty; unrelated files were preserved.
- User instruction authorized continuing remaining features while `PILOT-01` packaged-host gates stay open. `PILOT-02` is the only `IN PROGRESS` phase; `PILOT-01` is `BLOCKED` on operator-attached Windows/Linux host evidence and is not `CODE COMPLETE`.
- Agent-manager: added internal-key `VerifyConnectorIdentity` and `ListConnectorAuthorization`; clamped inventory page size to 100; omitted collector keys from list/delete responses; 4 MiB gRPC cap. Presented secrets are never returned. Collectors without tenant binding fail closed.
- Inputs: removed default tenant UUID `ce66672c-e36d-4761-a8c8-90058fee1a24`; replaced 100,000-row plaintext key sync with verify-on-miss plus bounded secret-free projection; bind tenant from verified identity; reject producer tenant conflict; fail closed for connection-key HTTP, GitHub, OTLP and unbound collectors; 4 MiB HTTP/gRPC/OTLP caps; per-connector/tenant token buckets, two-stream cap and Retry-After.
- Envelope: producer key is `tenantId:connectorId`; connector type/id are required on new `ha.raw-event.v1` records. Consumer rejects v1 envelopes that omit connector identity. Legacy unwrapped records remain measured-compatible.
- Protobuf: Homebrew `protoc` 35.1 regenerated Go stubs for `agent-manager/agent` and `plugins/inputs/agent`. Backend Java stubs were **not** regenerated in this slice.
- Focused agent-manager tests: `go test ./agent ./utils -count=1` — **passed**. Race: `go test ./agent ./utils -race -count=1` — **passed**. `go vet ./agent ./utils ./config` — **passed**.
- Focused inputs tests: `go test ./... -count=1` — **passed**. Race: `go test -race -count=1 .` — **passed**. `go vet ./...` — **passed**.
- Event-processor consumer: `go test ./kafka -count=1` — **passed**.
- No live agent-manager/inputs ingest replay, oversized-payload or rate-limit acceptance was executed. Cloud plugins still hard-code the default tenant UUID. Device mTLS remains `SIEM-007`.
- `PILOT-02` is `IN PROGRESS`, not `LIVE VERIFIED` and not `PRODUCTION READY`.

## 2026-08-18 16:59:20 IST (UTC+05:30) — Close PILOT-01/02 and implement PILOT-03

- Branch/HEAD remained `main` / `b749b485b45644e40cf0c27dc516d86b7fd9887e`. The worktree remained user-owned and heavily dirty (`197` modified, `278` deleted, `718` untracked at snapshot); unrelated files were preserved.
- User instruction: close pilot 1, then pilot 2, then proceed with pilot 3. `PILOT-01` and `PILOT-02` are `CODE COMPLETE`. Packaged-host Windows SCM/Linux systemd and live identity ingest against rebuilt images were not executed and are not claimed as `LIVE VERIFIED`.
- Agent: `EnqueueDurable`/`Offer` persist to SQLite before the send queue; `DeleteOld`/`DeleteOldestProcessed` reclaim processed rows only; default retention is 512 MB. Endpoint collectors (syslog, file, netflow, platform, auditd, dns, ebpf, esf, fim, usb, etw, netconn) call `Offer`.
- Inputs: Kafka publish retries with exponential backoff and no longer falls back to the engine socket. Producer batch cap is 4 MiB.
- Event processor: parse failures publish to `hivearmor.raw.events.quarantine` with a redacted reason; original offset commits only after that write. Write failures stay uncommitted. `hivearmor.raw.events.retry` is reserved.
- Topics: `local-dev/kafka-setup/create-topics.sh` creates quarantine/retry and sets `max.message.bytes=4194304` on raw/quarantine/retry.
- Focused agent tests: `go test ./agent ./database -count=1` — **passed**. Race — **passed**. `go vet ./agent ./database` — **passed**.
- Focused inputs tests: `go test ./... -count=1` — **passed**. Race — **passed**. `go vet ./...` — **passed**.
- Event-processor consumer: `go test ./kafka -count=1` — **passed**. Race — **passed**. `go vet ./kafka` — **passed**.
- `hivearmor-collector` and `as400` still drop on full memory queues. Encrypted spool contents and a write-failure retry budget were not implemented. No rebuilt-image outage/replay was run.
- `PILOT-03` is `CODE COMPLETE`, not `LIVE VERIFIED` and not `PRODUCTION READY`. Next implementation phase is `PILOT-04`.

## 2026-08-18 19:55:01 IST (UTC+05:30) — Live PILOT-02/03 ingress and quarantine

- Branch/HEAD remained `main` / `b749b485b45644e40cf0c27dc516d86b7fd9887e`. The worktree remained user-owned and heavily dirty; unrelated files were preserved.
- User instruction: run live tests and check the browser if required.
- Authenticate JSON field is `token`, not `id_token`. Local-dev login does not return JHipster `id_token`.
- Rebuilt `hivearmor/event-processor:local` after fixing quarantine writes: kafka-go rejects a Message.Topic when the Writer already has Topic. `go test ./kafka -count=1` passed, then compose recreated manager/worker. Worker must own `config.lock` or `:50051` is not TLS-served.
- Live script `local-dev/tests/pilot-live-ingress.sh` **passed**: enrolled ProcessLog ack (event id present in OpenSearch count=1), forged tenant denied, oversized payload rejected, burst ResourceExhausted with retry-after, revoked credential denied after 22s projection, enrollment token absent from worker logs, unsupported schema appeared on `hivearmor.raw.events.quarantine`, worker restart left raw.events end offset 91, quarantine survived eventprocessor restart.
- `GET /api/ha-alerts?page=0&size=50` with tenant 1 returned zero items. `POST /api/ha-search/nl-query` returned 500 because soc-ai returned 404. frontend-v3 was started fixture-disabled at `http://localhost:3000/login`; authenticated browser login was not completed. No alert UI claim is made.
- Packaged-host PILOT-01, collector/cloud-plugin tenant binding, device mTLS, broker outage, agent-process spool, `hivearmor-collector`/`as400` drop-on-full and encrypted spool remain open.
- `PILOT-02` is `LIVE VERIFIED` for the identity/size/rate/revoke ingest gates. `PILOT-03` stays `CODE COMPLETE` with quarantine/restart live evidence. Neither is `PRODUCTION READY`. Next implementation phase remains `PILOT-04`.

## 2026-08-18 20:40:00 IST (UTC+05:30) — Wave 1 staging-minimum SIEM (PILOT-04..07 + M6)

- Branch: `staging/siem-mvp` (from `main` / `b749b485…`). Unrelated dirty worktree files were left in place.
- PILOT-04: `go test ./processor ./kafka ./writer ./grpc ./http` in `event-processor` — **passed**. Kafka/socket persist event+alerts before commit/ack. Crash-point fake-store tests cover event-fail, alert-fail, success, filtered.
- PILOT-05: `go test ./rules` — **passed**, including positive/negative cases for the three pilot CEL rules. Matrix: `docs/ai-handoff/pilot-telemetry-matrix.md`.
- PILOT-06 subset: `go test ./config ./internal/httpclient` — **passed**. Production `InsecureSkipVerify` removed from event-processor OpenSearch clients and `sdk/os.Connect`. Staging profile rejects lab secrets and does not start `/v1/inject`.
- PILOT-07: `deploy/staging/docker-compose.yml` `docker compose config` published **443, 50051, 9000** only (no 9200/8088/8090). `frontend-v3/Dockerfile` added. Guide: `deploy/staging/INSTALL.md`.
- M6: frontend `npx vitest run src/services/alerts.service.test.ts src/pages/search-hunt/searchHunt.service.test.ts` — **6/6 passed**. `npm run type-check` — **passed**. Timeline search uses `v3-hive-log-*`.
- Local-dev stack was **not running**. No staging VM, Linux enroll, or detect-to-alert UI was executed.
- Label: **`STAGING CANDIDATE` artifacts**. Not `LIVE VERIFIED` ACC-01–14. Not `PRODUCTION READY`.

## 2026-08-18 21:23:00 IST (UTC+05:30) — Local-dev analyst flow (alerts, hunt, queue, incidents)

- Local-dev Docker: postgres, opensearch, redpanda, agentmanager, eventprocessor (manager+worker), backend — all **healthy**. Backend image rebuilt from `backend/target/hivearmor.war` after hunt promotion + hunt PIT source-only changes (`docker compose build backend && up -d --no-deps backend`). Event-processor rules volume contains the three PILOT CEL files; inject positives produced 4 alerts in `v3-hive-alert-2026.08.18`.
- Authenticated UI at `http://localhost:3000` with fixtures off (`All authorized tenants`, no `X-Tenant-ID`). Login `admin`.
- **Alerts** `/alerts`: live grid, PILOT-LIN-AUTH-FAIL and PILOT-WIN-PS-ENCODED visible. Investigation `/alerts/{id}` loaded PILOT-LIN-AUTH-FAIL with “Why it fired” and T1110; process/network/indicator panels correctly report missing ALT-003/004/005 evidence on thin syslog.
- **Analyst Queue** `/queue`: was empty under default `sort=severity,desc` because live PILOT docs store `severity` as a string and OpenSearch returns zero hits for that sort+range. Frontend now sorts `@timestamp,desc`. After the fix the last-24h queue showed all four PILOT rows.
- **Search & Hunt** `/search`: schema 28 fields, Run search **Query complete / 93 events**, including injected `sshd` at `2026-08-18 15:30:53Z`. Selected one event → promotion bar (Create Evidence / Create Investigation / Escalate to Incident). Confirmed Create Investigation against the rebuilt backend; Investigations list went from 1 to 2 with session **Security Investigation - 1 events**.
- **Incidents** `/incidents`: 22 matching, 33 active. Command Center `/dashboard` was 500 on `sort=createdAt` / `status=open`; mapped to `incidentCreatedDate` and `incidentStatus.in=OPEN`. Reloaded Mission Control: **0 console errors**, 22 total open incidents, priority work stream populated.
- **Investigations** `/investigations`: live list from `/api/ha-investigation-sessions`.
- Focused frontend tests: `alerts.service`, `searchHunt.service`, `incidents.service` — **19/19 passed**. `npm run type-check` — **passed**.
- Remaining honest gaps (not claimed live): tenant 1 (`acme`) still has no `v3-hive-alert-acme-*` / `v3-hive-log-acme-*` (writer is unprefixed); Severity Board `/alerts/board` returned 200 with all lanes 0 (24h + numeric `severity` aggregations vs string PILOT severity and future-dated seed docs); `GET /api/ha-search/timeline` still returns `[]` (hunt uses `/api/ha-hunts/search`, which works); SEC-03 correlated-findings status and SEC-05 remote agent actions remain disabled.
- Label: **`STAGING CANDIDATE` / `LIVE VERIFIED`** for detect-to-alert-to-queue-to-hunt-to-investigation on unscoped tenant. **Not `PRODUCTION READY`.**

## 2026-08-18 21:51:00 IST (UTC+05:30) — Tenant-prefixed writes + Severity Board

- Writer path now matches `MsspIndexResolver`: `BindTenant` + `agentprefix.Register` at event-processor startup; `WriteEventSync` → `v3-hive-log-<prefix>-DATE`; `WriteAlertSync` → `v3-hive-alert-<prefix>-DATE`. Empty prefix still uses the global daily index. Log `dataType` stays a document field. Alert `severity` is stored as a number. Dedup/parent search is tenant-index-scoped.
- Local-dev: `POSTGRESQL_*` added to eventprocessor and worker. `ha_client` id 1 = `acme` with `mssp_managed=true`. Masthead now lists Acme (id 1).
- Rebuilt `hivearmor/event-processor:local` and recreated manager+worker. Injected four PILOT positives and one accepted-password negative with `tenantId=1`. Inject response index was `v3-hive-log-acme-2026.08.18`. Negative produced 0 alerts.
- OpenSearch: documents present in `v3-hive-log-acme-2026.08.18` and `v3-hive-alert-acme-2026.08.18` with `tenantPrefix=acme` and numeric `severity`.
- API with `X-Tenant-ID: 1`: four PILOT alerts (`PILOT-WIN-FAILED-LOGON`, `PILOT-WIN-PS-ENCODED`, two `PILOT-LIN-AUTH-FAIL`). `X-Tenant-ID: 3813` (CWM): no PILOT names. Unscoped list still includes PILOT. Hunt `POST /api/ha-hunts/search` for Acme: **5** events (4 positives + 1 negative).
- Severity Board first returned `dataCompleteness=unavailable` because top_hits sorted on unmapped `riskScore`. Backend now sets `unmappedType` on that sort. After backend rebuild: Acme board `complete`, **Low lane count 4**, overview total/active/unassigned 4. CWM last-24h board 0 (seed alerts are outside the window; not a PILOT leak).
- Authenticated UI `http://localhost:3000`, fixtures off, tenant **Acme**: `/alerts` current scope **4 matching / 4 unassigned** with PILOT rows; `/alerts/board` Low **4** with the four injected alert ids; **0 console errors**. SEC-03 and SEC-05 remain disabled.
- Focused tests: `event-processor` `go test ./writer ./processor ./http` — **passed**. `HaMasthead.test.ts` — **passed**. `frontend-v3` `tsc --noEmit` — **passed**.
- Remaining honest gaps: live EP image does not yet persist `riskScore` (writer change is in source; board previews show Risk 0); engine 1–3 severity lands in the Low lane vs SOC 1–10 bands; PILOT rules currently fire twice (duplicate alert ids in inject); `GET /api/ha-search/timeline` still `[]`; Wave 2 staging VM remains unrun.
- Label: **`STAGING CANDIDATE` / `LIVE VERIFIED`** for Acme tenant-scoped detect→alert→board (and CWM isolation of those PILOT rows). **Not `PRODUCTION READY`.**

## 2026-08-18 22:14:41 IST (UTC+05:30) — PILOT-03 broker-outage + agent SQLite spool

- Work ID: `PILOT-03` / `SIEM-004` / ACC-09 rehearsal. Branch: `staging/siem-mvp`.
- This Darwin host is not a dedicated staging VM; local-dev already owns 443/50051/9000. Wave 2 `deploy/staging up` was **not** started. Staging Compose was updated so eventprocessor and worker set `POSTGRESQL_HOST=postgres` (plus port/user/db) for tenant-prefix writes. `docker compose --env-file` with unique non-lab secrets: published ports **443, 50051, 9000** only.
- Agent: unprocessed retry now runs every **15s**, independent of 10-minute processed-row reclaim. `go test ./agent` — **passed**.
- Live: `local-dev/tests/pilot-broker-outage.sh` against healthy local-dev (no `/v1/inject`). Enrollment token id `4a168fb2-0e6c-4a6d-b083-8e6efbc9e717` (secret not printed), platform linux, tenant 1.
- Redpanda `hivearmor-redpanda` stopped. `Offer` wrote event `5603b518-bea7-4b31-b157-538c1ff7dc44` to a temp SQLite spool; ProcessLog was **not** acked; `LogsDropped=0`; OpenSearch had **no** document for that id.
- Redpanda restored to healthy. The same unprocessed spool row was resent, acked, and indexed to **`v3-hive-log-acme-2026.08.18`** with `tenantPrefix=acme`, `dataType=syslog`.
- After the run: redpanda, eventprocessor manager+worker, and agent-manager were **healthy**.
- This is a Go test driving agent `Offer` + enrolled ProcessLog, not a packaged Linux systemd agent. `hivearmor-collector`/`as400` still drop on full memory queues. Encrypted spool and a write-failure retry budget remain open.
- Label: **`LIVE VERIFIED`** for local-dev broker-outage + agent SQLite spool. **Not `PRODUCTION READY`.** Not Wave 2 staging-VM ACC-01–14.

## 2026-08-19 09:54:00 IST (UTC+05:30) — Localhost SIEM + admin completeness

- Branch: `staging/siem-mvp`. HEAD at snapshot still `b749b48`. Worktree remained dirty; this slice’s frontend-v3 and event-processor image rebuild were not committed.
- Fixtures off. UI `http://localhost:3000` (IPv6 `[::1]`). Login `admin`. Tenant **Acme** (`sessionStorage ha_selected_tenant_id=1`) survived reload.
- Authenticated API probe (JWT field `token`): `/api/account`, overview today/severity/`alert-timeline`, `/ha-alerts`, severity-board, hunt schema/search, detection-rules, correlation-rule, entities, agents, users, settings — **200**. `GET /overview/events-in-time`, `GET /ha-search/timeline?query=sshd`, `GET /ha-tenants`, `GET /ha-audit-log` — **500**. Incident 125 activity — **404** (PG seed, not OpenSearch).
- Mission Control: live Low/Medium/High chart from `GET /api/overview/alert-timeline`; capacity/activity remain honest-unavailable. Alerts Acme **4 matching**; Severity Board loaded; investigation `/alerts/f00ac6a8-5a13-5de5-9881-032ec5af2cf2` **PILOT-WIN-FAILED-LOGON**. Hunt **Run search** → Query complete **1 event** (last 4 hours). Investigations list loaded. Incidents **INC-132** Notes tab present; activity notes **404** shown as “Could not load activity” (not “coming soon”). Detection Engineering **50** rules. Entities Acme **TOTAL 0**. Sensors: GAP-SEC-05 banner, actions blocked. Users/Settings live. Tenants: HTTP 500 copy. Audit: HTTP 500 copy, Export CSV disabled. Scheduled Reports: empty list (admin no longer Access Restricted). Endpoints grid lists pilot agents without AG Grid #239.
- Remaining nav (correlated findings, playbooks, approvals, quarantine, library, assets, identities, AD, exposure, vulns, CIS, compliance, FIM, policies, dashboards, studio, constellation): pages loaded, no crash, honest empty/gated. SEC-03 / SEC-05 / GAP-SEC-06 stay disabled.
- Event-processor image rebuilt; writer already sets `riskScore`. Post-rebuild inject returned duplicate Evaluate (`alerts: 2`, same id twice) and the alert document was **not** found in OpenSearch (`v3-hive-alert-acme-2026.08.19` never created). `riskScore` on a live OS document was **not** confirmed.
- Frontend gates: `npm run lint` passed; `npm run type-check` passed; `npm run test` **1065 passed / 173 files** (two non-fatal jsdom navigation notices); `npm run build` passed.
- Label: **`LIVE VERIFIED`** for localhost analyst SIEM + admin ops against the live backend with remaining nav honest-empty/gated. **Not `PRODUCTION READY`.** Wave 2 staging VM remains the next slice.

## 2026-08-19 12:58:00 IST (UTC+05:30) — Wave 2 EC2 staging ACC-01

- Host: Ubuntu 24.04 amd64, public IP `72.44.52.187`, region `us-east-1`, SSH user `ubuntu`. Docker Engine + Compose installed. `vm.max_map_count=262144`. Lab `local-dev/.env` was not present on the VM.
- Mac arm64 images cannot run on this host. Rebuilt on the VM: postgres, OpenSearch, agent-manager, event-processor, backend (WAR copied from the existing image), frontend-v3. Redpanda and nginx pulled from Docker Hub. Staging compose postgres build context corrected to `docker/postgres` (matches local-dev).
- Fresh Liquibase failed on shipped changeset `20231017003` (`splitStatements` / quoted logstash SQL). Schema was restored from local-dev `hivearmor` so later changesets are recorded; admin password was rotated to a VM-local bootstrap file (not lab `localdev123!`).
- `HIVEARMOR_ENCRYPTION_KEY` must be Base64 of **32** bytes; `ENCRYPTION_KEY` (JWT HS512) must be Base64 of **64** bytes on one line (`openssl rand -base64 64 | tr -d '\n'`).
- Compose `hivearmor-staging` is up: postgres, OpenSearch, Redpanda, agent-manager, backend, eventprocessor manager+worker, frontend-v3, edge. Host publishes **443**, **50051**, **9000** only. `HA_PROFILE=staging`. `http://127.0.0.1:8080/v1/inject` is not published.
- ACC-01: `https://72.44.52.187/` returns frontend-v3 (self-signed cert). `POST /api/authenticate` from the laptop returned **200** with JWT field `token`. TFA off.
- Not done at that timestamp: ACC-04/05/06/10/11/14. Packaged Windows agent, soak, restore drills remain later waves.
- Label: **`STAGING CANDIDATE`** for ACC-01 only. **Not `PRODUCTION READY`.**

## 2026-08-19 13:46:00 IST (UTC+05:30) — Wave 2 EC2 staging ACC-04/05/06/10/11/14

- Harness: `deploy/staging/acc-mvp.sh` on `ubuntu@72.44.52.187`. No `/v1/inject`, no foundation fixtures. Enrollment token id `08014aaa-72f2-4b8a-b200-83e0589ae613` (secret not printed).
- Inputs plugin was failing `internal key does not match` because `local-dev/hivearmor_plugins.yaml` still had the lab `internalKey`. Staging now renders `deploy/staging/hivearmor_plugins.yaml` from `.env` (gitignored) and mounts it into event-processor.
- ACC-04: Linux `RegisterAgent` + ProcessLog ack. Positive event `5db3f894-4b5d-478d-b91a-44c04590a8ea` (`sshd` Failed password). Negative event `c4849a4d-98ce-4ed7-bf3f-3f7e5ec90d1f` (Accepted password).
- ACC-05: `GET /api/ha-alerts?page=0&size=50&sort=@timestamp,desc` with `X-Tenant-ID: 1` listed **PILOT-LIN-AUTH-FAIL** (alert id `da10f27c-18e4-5171-91f5-8f592ec6f934` from the first positive fire; later Failed-password events share that rule’s host/user dedupe). OpenSearch `v3-hive-log-acme-2026.08.19` held the enrolled event ids.
- ACC-06: Accepted SSH did not appear on `/api/ha-alerts`.
- ACC-10: ProcessLog with `TenantId=999999` denied. ACC-11: after credential revoke (~22s projection) ingest denied. Enrollment token absent from worker logs. ACC-14: host `:8080/v1/inject` closed.
- This is enrolled ProcessLog from `go test TestStagingMvpPilot`, not a packaged systemd Linux agent (ACC-02 Windows SCM still open). ACC-09 remains the local-dev broker-outage rehearsal.
- Label: **`STAGING CANDIDATE`** for ACC-01 plus ACC-04/05/06/10/11/14. **Not `PRODUCTION READY`.**

## 2026-08-19 16:20:00 IST (UTC+05:30) — VUL/CIS/HNT-007 backend contracts

- Work: VUL-001/002/004, CIS-001/005, HNT-007 snapshot binding.
- Backend compile succeeded. Focused tests `HaVulnServiceTest,HaCisServiceTest,AgentPackageServiceTest` — **9/9 passed**.
- Frontend focused Vitest 15/15 passed; `npm run type-check` and `npm run lint` passed.
- Remaining: tenant-scoped JDBC predicates, cursor pagination, EPSS/remediation, CIS mutations/AI, hunt evidence as incident items vs description text.
- Not live-verified on the staging VM in this slice. **Not `PRODUCTION READY`.**

## 2026-08-19 16:45:00 IST (UTC+05:30) — Remaining telemetry/incident contracts

- Liquibase `20260819001`: `tenant_id` on vuln/CIS tables; nullable EPSS columns (never invented).
- Keyset cursors + tenant predicates; ingest stamps `tenant_id` when known on the HTTP thread (passed into `@Async`).
- Honest surfaces: EPSS `unavailable`, `GET .../remediation` + 503 execute, CIS observed catalog + 503 mutations.
- Hunt escalate/create-evidence writes incident evidence items with `searchId`; convert-to-incident creates `hive_incident` then OpenSearch `isIncident`.
- Compile/tests recorded in the same session. Not live-verified on staging. **Not `PRODUCTION READY`.**

## 2026-08-19 17:15:00 IST (UTC+05:30) — Staging deploy of tenant/cursor/incident slice

- Rebuilt `backend/target/hivearmor.war` locally (offline Maven) including `TelemetryCursor`, `VulnRemediationDTO`, `ConvertedIncidentDTO`, `CisPackCatalogDTO`, Liquibase `20260819001`.
- Rsynced WAR + `frontend-v3/` to `ubuntu@72.44.52.187`. Rebuilt only `hivearmor/backend:local` and `hivearmor/frontend-v3:local`. Recreated `backend`, `frontend-v3`, `edge`. All three healthy.
- Liquibase `20260819001-telemetry-tenant-epss` **EXECUTED** at 2026-08-19 11:39:07 UTC. Columns `tenant_id` / `epss_*` present on `ha_vuln_finding`; `tenant_id` on SCA tables.
- Authenticated API (`admin`, `X-Tenant-ID: 1`, no secrets logged):
  - `GET /api/ha-vuln/findings` 200 empty then 1 row after inserting labeled probe `CVE-0000-STAGING` with `tenant_id=1`.
  - `GET /api/ha-vuln/findings/1` 200 `epssState=unavailable`.
  - `GET .../remediation` 200 `state=unavailable`.
  - `POST .../remediation/execute` **503** `VUL_REMEDIATION_UNAVAILABLE`.
  - `GET /api/ha-cis/results`, `/summary`, `/catalog` 200 empty lists (no SCA ingest).
  - `POST /api/ha-cis/actions/preview` and `/actions` **503** `CIS_MUTATION_UNAVAILABLE`.
  - `POST /api/ha-alerts/convert-to-incident` **200** with `id` present; PostgreSQL `hive_incident` id **135** status `OPEN` name `STAGING-CONVERT-SLICE`.
- UI: Playwright loaded `https://72.44.52.187/login` (self-signed cert ignored) — heading **Sign in to HiveArmor**, Sign in button present. Authenticated browser login was not completed in this session (credential-handling restriction). SPA routes return the HiveArmor shell. Staging frontend bundle includes EPSS and “not official CIS applicability” copy.
- Hunt promotion evidence-item path was **not** live-exercised. Probe finding `CVE-0000-STAGING` remains in staging inventory for a manual UI pass.
- Label: **`STAGING CANDIDATE`**. **Not `PRODUCTION READY`.**

## 2026-08-19 18:28:18 IST (UTC+05:30) — Staging systemd observed telemetry

- `go test ./serv ./telemetry ./cmd` passed on Darwin. Linux amd64 `hivearmor_agent_service` copied to the staging VM.
- Installed `hivearmor-telemetry.service` (`telemetry-loop 127.0.0.1 yes`) with `EnvironmentFile=-/etc/hivearmor/agent.env`. Unit file has no `HA_INTERNAL_KEY`. Env mode `600`. systemd `EnvironmentFiles=/etc/hivearmor/agent.env`.
- `ActiveEnterTimestamp` and `ha_sca_summary.scanned_at` both **2026-08-19 12:58:18 UTC**. Rows: HA-LOGIN-01 FAIL, HA-SSH-01/02 NOT_APPLICABLE, HA-USER-01 PASS; 400 SBOM components for `staging-vm`.
- This is **not** enrolled `HiveArmorAgent` PILOT-01 (no token consume/rotate/revoke). Not official CIS. OSV still has no egress from the compose `data` network. **`STAGING CANDIDATE`. Not `PRODUCTION READY`.**

## 2026-08-19 18:45:08 IST (UTC+05:30) — Staging packaged Linux HiveArmorAgent (PILOT-01)

- `go test ./agent -run TestEnrollmentPlatform` passed. Register maps `ubuntu` → `linux`.
- Staging agent-manager publishes **9001**; `version.json` seeded. `verify-packaged-linux.sh` captures login JWT on stdout only (status on stderr); `--admin-pass-file` and `--insecure`.
- Live: create token HTTP 201, install `[OK]`, systemd start/stop/restart, rotate 201, revoke 200, audit 200. Report `status=script-complete`, tenant 1, agent id **8**, token id `22c5b5de-2e73-4909-aa9f-e6cc264c089f`. `systemctl is-active HiveArmorAgent` → **active**.
- SOC Manager, Analyst, and unauthorized-tenant checks were not run (users/tenant 2 not supplied). Skip-cert was `yes`. Windows SCM not executed. Device credential is revoked; reconnect ingest was not re-fired. **`STAGING CANDIDATE`. Not `PRODUCTION READY`.**

## 2026-08-19 20:00:00 IST (UTC+05:30) — Packaged-host enrollment role matrix

- Ran `deploy/staging/run-pilot01-role-matrix.sh` on `ubuntu@72.44.52.187` (the packaged Linux host). Bound `soc.manager` and `analyst.chen` to tenant **1** only. Existing tenant **3812** (`workmates1`) used as unauthorized scope.
- `GET /api/ha-agent-enrollments?page=0&size=25`: Admin **200**, SOC Manager **200**, Analyst **403**, SOC Manager + `X-Tenant-ID: 3812` **403**.
- Report `/var/tmp/hivearmor-pilot01-role-matrix.json` `status=script-complete`. Passwords not printed. Windows SCM still open. **`STAGING CANDIDATE`. Not `PRODUCTION READY`.**

## 2026-08-19 20:10:00 IST (UTC+05:30) — Hunt evidence live path (HNT-007)

- `deploy/staging/run-hunt-evidence-live.sh` on the staging VM. Admin JWT, `X-Tenant-ID: 1`. Event messages were not printed.
- `POST /api/ha-hunts/search` `*:*` 14-day window: HTTP 200, 11 items, `searchId` present.
- Preview without `searchId`: 400 `MISSING_SEARCH_ID`. Unknown `searchId`: 404 `HUNT_SEARCH_NOT_FOUND`. Event id outside snapshot: 404.
- Execute `create_evidence` onto incident **135**: 200 `status=created`. Evidence list API count **1**. `hive_evidence_item` rows with matching `source_ref`: **1**.
- Approval/permission-version preview policy and per-event retry outcomes were not added. **`STAGING CANDIDATE`. Not `PRODUCTION READY`.**

## 2026-08-19 20:35:00 IST (UTC+05:30) — Enrollment audit retention/export (SIEM-009 subset)

- `GET /api/ha-agent-enrollments/audit/export` on staging: HTTP 200, 25 NDJSON rows, `X-Audit-Source-Policy: append-only`, counts matched list total and `enrollment_audit_events` tenant 1. Forbidden secret field names were absent. Payloads were not printed.
- `GET /api/ha-retention-policies/ENROLLMENT_AUDIT`: `sourceImmutable=true`. PUT `archiveTarget=S3`: **400**. Postgres `DELETE` on the audit table was rejected. `pg_dump --data-only` wrote `/var/tmp/hivearmor-enrollment-audit.dump.sql` mode 0600 (`dump_bytes=6736`).
- Analyst export 403 was skipped (pass file missing on this run). OpenSearch snapshots, scheduled cluster backup, and clean restore were not executed. **`STAGING CANDIDATE`. Not `PRODUCTION READY`.**

## 2026-08-21 15:10:00 IST (UTC+05:30) — Pipeline signals Admin board + soak timer

- Backend `GET /api/ha-pipeline-signals` (ROLE_ADMIN) + frontend `/admin/pipeline-signals` deployed to staging.
- Live: HTTP 200; OS yellow; store/postgres sizes measured; lag group `hivearmor-event-processor` **0** (after `rpk group list` parser fix); host `latest.json` mounted.
- Hourly `hivearmor-slo-soak.timer` enabled; samples under `~/hivearmor-slo-soak/`. Brand-new Linux VM restore deferred post production-ready. **`STAGING CANDIDATE`. Not `PRODUCTION READY`.**

## 2026-08-21 14:45:00 IST (UTC+05:30) — Windows rotate without harness recovery (SCM 1056 / STOP_PENDING)

- Hardened `agent/utils/services.go`: Windows wait loops distinguish `STOP_PENDING` / `START_PENDING` / `RUNNING` / `STOPPED`; `StartService` accepts **1056** only after `RUNNING`.
- `rotate_credential` restart: wait fully stopped (90s), 3s settle, start, wait running (90s).
- Staging cross-build + Windows ACC-02 reinstall agent **17**: `rotate_rc=0`, no harness recovery; revoke + role matrix passed. Report `C:\ha-agent-test\hivearmor-pilot01-windows-report.json`. **`STAGING CANDIDATE`. Not `PRODUCTION READY`.**

## 2026-08-21 16:15:00 IST (UTC+05:30) — E2E agent pipeline + staging UI walk

- `run-e2e-pipeline-ui.sh`: enroll + ProcessLog pos/neg (no `/v1/inject`); OpenSearch held pos+neg; `PILOT-LIN-AUTH-FAIL` on alerts API; agents API 200.
- Playwright UI (`https://72.44.52.187`): Mission Control, Alerts (PILOT-LIN-AUTH-FAIL + PILOT-WIN-FAILED-LOGON), Search & Hunt (177 events; `pilot-staging-mvp` at ProcessLog timestamps), Sensors, Incidents, Detection Rules, Queue.
- Live SSE dock: Disconnected / 0 EPS during walk. Report `/var/tmp/hivearmor-e2e-pipeline-ui.json`. **Rotate staging admin password.** **`STAGING CANDIDATE`. Not `PRODUCTION READY`.**

## 2026-08-21 15:50:00 IST (UTC+05:30) — SIEM-009 MinIO Object Lock WORM drill LIVE

- No EC2 instance role / valid laptop AWS creds for commercial S3 — used staging MinIO Object Lock instead.
- `run-siem009-worm-object-lock.sh`: stamp `20260821T075407Z` uploaded (3 objects, 9810682 bytes) to bucket `hivearmor-staging-worm-compliance` with **COMPLIANCE** 1d retention; locked version delete **denied**; etag unchanged. Report `/var/tmp/hivearmor-siem009-worm-object-lock.json`. **`STAGING CANDIDATE`. Not AWS Glacier WORM. Not `PRODUCTION READY`.**

## 2026-08-21 15:40:00 IST (UTC+05:30) — SIEM-009 soak pack PARTIAL + Admin soak history

- Timer `hivearmor-slo-soak.timer` active since **2026-08-21 09:28 UTC**; samples under `~/hivearmor-slo-soak/`.
- `collect-siem009-soak-pack.sh`: **5** samples, span **0.561h**, status **`PARTIAL_SOAK`** (need ≥24h). Report `/var/tmp/hivearmor-siem009-soak-pack.json` + tar. ETA complete ~**2026-08-22 09:25 UTC**.
- WAR + frontend redeployed: `GET /api/ha-pipeline-signals` returns `soakHistory` length **5**, lag **0**. Admin UI shows soak history table. **`STAGING CANDIDATE`. Not `PRODUCTION READY`.**

## 2026-08-21 15:25:00 IST (UTC+05:30) — HNT-007 SOC Manager approval path LIVE

- WAR: Temurin 17 offline `mvn -o -Pprod -DskipTests package -Denforcer.skip=true`; rsynced; staging `docker compose build backend` + recreate; liquibase table `ha_hunt_promotion_approval` present; backend **healthy**.
- `deploy/staging/run-hnt007-approval-live.sh`: request PENDING → admin self-approve **400** `SEPARATION_OF_DUTIES` → `soc.manager` APPROVE → escalate execute with `approvalId` **200** (`status=created`) → consumed replay **400**. Report `/var/tmp/hivearmor-hnt007-approval.json`. **`STAGING CANDIDATE`. Not `PRODUCTION READY`.**

## 2026-08-21 14:00:00 IST (UTC+05:30) — HNT-007 gates WAR deploy + LIVE VERIFY

- Local offline Maven: Temurin 17 `mvn -o -Pprod -DskipTests package` (no `MAVEN_TK`) → `backend/target/hivearmor.war` (193189640 bytes).
- Rsynced WAR to staging; `docker compose build backend` + recreate; container WAR size matched; backend **healthy**.
- `deploy/staging/run-hnt007-gates-live.sh`: create_evidence preview `permissionVersion` present, `approvalRequired=false`; escalate/investigation `approvalRequired=true`; escalate without `approvalId` **400** (`APPROVAL_REQUIRED`); create_evidence execute `eventOutcomes` count **1** on incident **135**. Report `/var/tmp/hivearmor-hnt007-gates.json`. **`STAGING CANDIDATE`. Not `PRODUCTION READY`.**

## 2026-08-21 13:50:00 IST (UTC+05:30) — SIEM-009 persist/offbox/SLO + legacy key cutover

- Redpanda named-volume recreate retained topic + HWM 35. Second-host copy of offhost stamp to Windows ACC-02 VM (3 files, ~9.8MB). SLO/lag signals JSON collected (consumer lag 0).
- `ALLOW_LEGACY_TELEMETRY_INTERNAL_KEY=false`; `HA_INTERNAL_KEY` removed from agent.env; signed telemetry-once accepted; INTERNAL_KEY-only ingest **401**.
- HNT-007 permissionVersion/approvalRequired/eventOutcomes were then source-only; WAR deploy + live verify completed in the 14:00 entry above. **`STAGING CANDIDATE`. Not `PRODUCTION READY`.**

## 2026-08-21 13:25:00 IST (UTC+05:30) — SIEM-009 off-volume copy / Redpanda named volume / ISM

- Redpanda `hivearmor-staging_redpanda_data` named volume attached; cluster healthy after migrate from anonymous volume.
- Drill `status=script-complete`: snapshot SUCCESS (9 `v3-hive-*`), offhost tar **833285** bytes under `/var/backups/hivearmor-offhost/20260821T075407Z`, `offhost_on_opensearch_data_volume=false`, ISM `ha-hot-retention` present (14d), Postgres throwaway restore counts matched, renamed OS restore 1 doc. Same-VM only — not new-VM / WORM / SLO. **`STAGING CANDIDATE`. Not `PRODUCTION READY`.**

## 2026-08-21 13:05:00 IST (UTC+05:30) — Windows packaged-host role matrix

- Users `soc.manager` / `analyst.chen` activated with `ROLE_SOC_MANAGER` / `ROLE_ANALYST`, tenant-1 membership; passwords written to Windows `C:\ha-agent-test\secrets\` (not printed).
- From Windows Server 2019 host against staging: Admin **200**, SOC Manager **200**, Analyst **403**, SOC Manager tenant **3812** **403**. Report `C:\ha-agent-test\hivearmor-pilot01-windows-role-matrix.json`. Full install/rotate/revoke on agent **14** also passed in the same session (unauthorized-tenant check corrected to use SOC token). **`STAGING CANDIDATE`. Not `PRODUCTION READY`.**

## 2026-08-21 13:00:00 IST (UTC+05:30) — Windows SCM packaged-host ACC-02 (staging live)

- Host: Windows Server 2019 Datacenter x64 `EC2AMAZ-8F0Q7DL` (`54.160.142.254` / `172.31.16.134`) → staging `172.31.17.117` (443/9000/9001/50051).
- Admin enrollment create 201; install agent **13**; SCM start/stop/start OK; audit token created+consumed; rotate 201; local rotate hit SCM **1056** once then recovered; revoke 200 with credential rotated+revoked audit. Report `C:\ha-agent-test\hivearmor-pilot01-windows-report.json` `status=script-complete`, `roleMatrixSkipped=true`, `skipCertValidation=yes`.
- SOC/Analyst role matrix not run (passwords not provided). Not signed CI package. **`STAGING CANDIDATE`. Not `PRODUCTION READY`.**

## 2026-08-19 21:45:00 IST (UTC+05:30) — CIS catalog / EPSS / signed ingest (staging live)

- Catalog 2 packs (observed + license-required). Connectors 3, all `not_configured`. Forged device key HTTP 401. Missing auth HTTP 401.
- Finding CVE is a 16-character staging placeholder, not a FIRST id; no EPSS row written. Host FIRST probe for a public CVE returned HTTP 200 with 1 data row.
- Enrolled agent **9** `telemetry-once` accepted; `ha_sca_result` 4 / `ha_sca_summary` 1. Agent 8 remains revoked. Legacy INTERNAL_KEY flag still true. **`STAGING CANDIDATE`. Not `PRODUCTION READY`.**

## 2026-08-19 21:15:00 IST (UTC+05:30) — CIS catalog / EPSS / signed ingest (code complete)

- Unique SCA keys now include tenant, pack id and pack version. Catalog seeds an observed HiveArmor pack and a CIS `LICENSE_REQUIRED_NOT_SHIPPED` placeholder with no licensed benchmark text.
- FIRST EPSS parser rejects rows without a probability. Remediation connectors are static `not_configured`. Telemetry ingest prefers `VerifyConnectorIdentity`; staging still allows legacy `INTERNAL_KEY`.
- Driver: `deploy/staging/run-cis-epss-signed-ingest.sh`. Staging image rebuild and live HTTP were not executed in this coding session. Signed 202 from a non-revoked enrolled agent remains open. **`STAGING CANDIDATE`. Not `PRODUCTION READY`.**

## 2026-08-19 20:44:15 IST (UTC+05:30) — Throwaway backup/restore drill (SIEM-009 / ACC-12 subset)

- Driver `deploy/staging/run-siem009-backup-restore.sh` on the staging VM. Dump contents and OpenSearch `_source` were not printed.
- Postgres dumps: `hivearmor` 8,887,462 bytes, `agentmanager` 24,326 bytes, mode 0600. Throwaway restore counts matched live: incidents 42, evidence 1, retention policies 9, users 8. Drill database dropped.
- OpenSearch: cluster yellow, store 3,239,131 bytes, 6 `v3-hive-*` indices, snapshot `SUCCESS`, renamed restore 1 document matched, restore-drill index deleted.
- `hivearmor-backup.timer` enabled (next ~2026-08-20 00:11 UTC). Snapshots are on the primary data volume. Redpanda was not backed up. **`STAGING CANDIDATE`. Not `PRODUCTION READY`.**




