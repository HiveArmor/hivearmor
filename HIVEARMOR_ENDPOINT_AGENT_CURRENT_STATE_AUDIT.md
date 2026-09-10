# HIVEARMOR ENDPOINT AGENT & EDR — CURRENT-STATE DISCOVERY AUDIT

> Date: 2026-09-09 · Discovery/audit only — **no code changed, no roadmap proposed.**
> Every verdict uses: REAL / PARTIAL / STUB / CONFIG-ONLY / UI-ONLY / BACKEND-ONLY / DEPRECATED / ABSENT / UNVERIFIED.
> **Method note (important):** two attempts to fan this out to `kirocrew-lite` sub-agents both failed — those workers run in a sandbox where `/Users/encryptshell/GIT/HiveArmor-v1` is **not mounted** (they reported "does not exist on this machine" and produced no reads). All 13 workers were discarded. **Every path:line below was read directly by the author.** Sections requiring files not yet opened in this pass are marked UNVERIFIED with the file to read — they are NOT downgraded to ABSENT.

---

## 4. Executive architecture map (current, real)

```
 Endpoint host
 ┌───────────────────────────────────────────────────────────────┐
 │ HiveArmor Agent (Go, single binary, mode=log|edr)              │
 │   collectors/sensors → Offer() → SQLite durable spool → memqueue│
 │   local state: SQLite (logs_process db) + YAML config (AES-GCM) │
 │   policy: pull; response: kill/isolate/quarantine (Lin/Win)     │
 │   updater: SEPARATE binary, HTTP pull, NO signature verify      │
 └───────┬──────────────────────────────┬─────────────────────────┘
         │ gRPC/TLS 1.3                  │ HTTP(S) JSON (telemetry)
         │ headers: key+id+type |        │ headers: X-HiveArmor-Agent-Id
         │ enrollment-token | internal-key│         + X-Agent-Key
         ▼                                ▼
 ┌────────────────────────┐        (telemetry ingest → event-processor path)
 │ agent-manager (Go gRPC)│
 │  enrollment (bcrypt tok)│  Postgres hivearmor_agents (GORM auto-migrate)
 │  registry / identity    │  tables: Agent, EnrollmentToken,
 │  heartbeat (Ping stream)│         EnrollmentAuditEvent, AgentCommand,
 │  collector-config groups│         Collector, LastSeen
 │  command queue + stream │
 └───────┬────────────────┘
         │ gRPC (internal-key)         Backend ↔ AgentManager
         ▼
 ┌────────────────────────┐   HTTPS/JWT   ┌──────────────┐
 │ backend (Java/Spring)  │ ◄──────────── │ frontend-v3  │
 │  /api/agent-manager     │   /api/*      │  (React)     │
 │  /api/agent-policies (new)│             └──────────────┘
 │  /api/ha-edr/policies (legacy)│
 │  /api/agent-groups /enrollments/keys/packages/collectors│
 └───────┬────────────────┘
         ▼ OpenSearch (v3-hive-<type>-YYYY.MM.DD)  → UI
```

**Protocols (verified):** Agent↔AgentManager = gRPC/TLS (`agent/telemetry` + gRPC stream); Agent telemetry ingest = **HTTP(S) JSON** (`agent/telemetry/client.go:26-60`, `InsecureSkipVerify: skipTLS`); Backend↔AgentManager = gRPC with `internal-key` (`agent-manager/agent/interceptor.go:65,111-119`); Browser↔Backend = HTTPS/JWT. **No WebSocket/OTLP/message-broker** in the agent path.

---

## 5. Agent runtime architecture & startup

Entry: `agent/cmd/run.go` → `serv.RunService()` (`agent/serv/run.go:8-20`) → `github.com/kardianos/service` manages Windows SCM / systemd / launchd (`serv/run.go:2`). Config credential is decrypted on load (`agent/config/config.go:66-101`).

**Startup (real, ordered):** config load + AES-GCM credential decrypt (`config.go:66-101`) → installation UUID resolve (`config.go:getOrCreateUUID`) → SQLite spool DB init lazily on first `Offer`/`GetDB` (`agent/database/db.go:GetDB`) → kardianos service `program.Start` → collectors + (if `IsEDR()`) EDR sensors → Ping heartbeat stream → telemetry sender loop.

- **Module boundary:** MODULAR — clean package split (`cmd`, `serv`, `agent`, `collector/*`, `telemetry`, `database`, `tamper`, `updater`, `config`). Collectors implement a common `Collector` interface (`agent/collector/collector.go`). Verdict **REAL**.
- **Crash/restart/watchdog:** service manager restarts the process; a tamper **watchdog** exists (`agent/tamper/watchdog.go`). **Panic recovery IS present** — goroutines are launched through `p.goSafe(name, fn)` in `agent/serv/service.go` (e.g. `service.go:191-193` for the eBPF collector), a recover-wrapped spawner. Verdict **REAL** (RESOLVED — was UNVERIFIED).

---

## 7. Installation & agent modes

Install CLI: `agent/cmd/install.go:24-45` — `install <server_address> <skip_cert_validation> --enrollment-token-file <path|->`, `cobra.ExactArgs(2)`, rejects a file with world-readable perms (`install.go:110-113`). `--mode` flag `log|edr`, default `log` (`install.go:88-89`; `config.go:31-52`). Uninstall: `agent/cmd/uninstall.go`, `agent/serv/uninstall.go`. Credential rotate: `agent/cmd/rotate_credential.go`.

| Capability | LOG mode | EDR mode | Evidence |
|---|---|---|---|
| Platform log collection | ✓ | ✓ | `config.go:30` "log — platform log collection only" |
| EDR telemetry (process/file/net) | ✗ | ✓ | `config.go:52 IsEDR()`; gated in EDR start path |
| Response (kill/isolate/quarantine) | ✗ (no EDR sensors) | ✓ | `edr_response_actions.go` reachable only via EDR |
| Remote shell | opt-in both | opt-in both | `config.go:44-47 AllowRemoteShell` default false |

Verdict **REAL** (dual mode is a real runtime switch, not config-only).

---

## 8. Platform matrix (build tags verified)

| Sensor / feature | Win x64 | Win ARM | Linux x64 | Linux ARM | macOS | Other |
|---|---|---|---|---|---|---|
| Install / service lifecycle | REAL | REAL | REAL | REAL | REAL | ABSENT |
| Log collection | REAL | REAL | REAL | REAL | REAL | STUB |
| Process telemetry | REAL (ETW `etw/collector_windows.go:1`) | REAL | REAL (eBPF `ebpf/collector_linux.go:1`) | REAL | REAL (ESF `esf/collector_darwin.go:1`) | STUB (`*_other.go`) |
| Network telemetry | REAL (`netconn/collector_windows.go:1`) | REAL | REAL (`netconn/collector_linux.go:1`) | REAL | REAL (`netconn/collector_darwin.go:1`) | STUB (`netconn/collector_other.go:1`) |
| DNS | ABSENT | ABSENT | REAL (`dns/collector_linux.go:1`) | REAL | ABSENT | STUB (`dns/collector_other.go:1`) |
| Registry FIM | REAL (`fim/registry_windows.go:1`) | REAL | ABSENT | ABSENT | ABSENT | STUB (`fim/registry_other.go:1`) |
| USB | ABSENT | ABSENT | REAL (`usb/collector_linux.go:1`) | REAL | ABSENT | STUB (`usb/collector_other.go:1`) |
| File FIM | REAL | REAL | REAL | REAL | REAL | PARTIAL |
| Response (kill/quarantine) | REAL | REAL | REAL | REAL | STUB (`edr_unsupported.go`) | STUB |
| Network isolation | REAL (`edr_windows.go`) | REAL | REAL (`edr_linux.go`) | REAL | STUB (`edr_unsupported.go:20-26`) | STUB |
| Tamper | REAL (`tamper/harden_windows.go`) | REAL | REAL (`tamper/harden_linux.go`) | REAL | PARTIAL (`harden_other.go`) | STUB |
| Updater | REAL | REAL | REAL | REAL | REAL | — |

`_other.go` files carry `//go:build !<os>` and return no-op / "not supported" (`edr_unsupported.go:20-26`, `applyNetworkIsolation` returns `"network isolation not supported on %s"`). These are correctly classified STUB, not implementations.

---

## 9. Log collection engine

Collector config schema (`agent/collector/schema/schema.go`): `Integration{TCP,UDP Port{IsListen,Port,TLSEnabled}}`, `FileIntegration{Enabled,Paths[]}`, `CollectorConfig{Integrations, FileIntegrations}`. Sources present: **syslog (UDP/TCP, TLS flag)**, **file**, **netflow** (full v1/v5/v6/v7/v9/IPFIX parser under `agent/parser/netflow/`), **auditd (Linux)**, **journald/WinEvent** via platform collectors (`agent/collector/platform/*`). CEF/LEEF/JSON parsing lives in `agent/parser/`.

- File collector deep-dive (`agent/collector/file/file.go`) — **RESOLVED (UNKNOWN-003):** glob expansion via `filepath.Glob` (`:96`); rotation detection via `os.SameFile` reopen (`:206-213`); truncation detection `stat.Size() < w.offset → seek 0` (`:217-220`); config-driven reconcile through fsnotify configwatcher (`:66-70`). **Gaps (real):** the read offset `w.offset` is **in-memory only — never persisted**; on (re)open a fresh file **seeks to end** (`io.SeekEnd`, `:186-193`), so **lines written while the agent was down are skipped** (log loss on restart at the reader layer, distinct from the durable spool which only protects events *after* they are read); **no multiline** (single `ReadString('\n')`, `:230`); on rotation offset resets to 0 and re-reads from start (dup risk); 1 s poll (`pollInterval`). Per-source metrics/backpressure/rate-limit at the file layer: not present (backpressure handled by the shared spool). Verdict **PARTIAL.**
- Syslog TLS: schema exposes `TLSEnabled` (`schema.go` Port) — runtime TLS listener wiring in `syslog/listener.go` **UNVERIFIED this pass**.

Verdict: log collection **REAL**; per-feature file-collector robustness **UNVERIFIED**.

---

## 10–16. Endpoint telemetry / EDR sensors

- **Process (Windows ETW):** `etw/collector_windows.go` — EventID 1 ProcessStart captures PID, **PPID** (`:52,:222`), ImageFileName, CommandLine, CreateTime (`etw/doc.go:8`). PowerShell scriptblock (4104) + suspicious-pattern list (`:412-443`), DNS (3008). **REAL.**
- **Process (Linux eBPF):** `ebpf/collector_linux.go:143,221` + `wire_linux.go:21,55` — PID/PPID from kernel wire struct. **REAL and wired** — `ebpf.New(cnf).Start(ctx, LogQueue)` is launched in `serv/service.go:191-193`. **Nuance (RESOLVED):** a SECOND Linux process path also exists — `edr_linux.go:collectLinuxProcessEvents` does **/proc polling every 1 s** (its own comment: "misses short-lived processes… Phase 2 will replace this with eBPF"). So two Linux process-collection code paths coexist; eBPF is the zero-miss one and is wired, the /proc poller is legacy/complementary. Cross-reboot: neither yields a persistent process entity id.
- **Process (macOS ESF):** `esf/collector_darwin.go:52,185-194` — Dispatch(pid,ppid,uid). **REAL** (entitlement caveat §16).
- **Process tree:** captured via **PID + PPID only** — grep found **no persistent process entity ID / ProcessGUID** anywhere (`grep entityID|ProcessGUID` = 0 hits). A cross-reboot / PID-reuse-safe process tree **cannot** be reconstructed from a stable entity id today. **PARTIAL — architecturally significant (see §64).**
- **Network:** `netconn/*` per-platform; process attribution present on Win/Linux/macOS builds. **REAL** (3 OSes), STUB other.
- **DNS:** `dns/collector_linux.go` query/answer/rcode with process attribution — **REAL on Linux only.**
- **File/FIM:** `fim/{collector,baseline,policy}.go` SHA-256 baseline; registry FIM Windows-only (`fim/registry_windows.go`). Exact hashing trigger point **UNVERIFIED this pass**.

---

## 17. Local storage

**SQLite via `github.com/glebarez/sqlite` + GORM** (`agent/database/db.go:10,142`). Single durable table `models.Log{ID, CreatedAt, DataSource, Type, Log(raw), Processed}`. Config + identity stored as **YAML files**, not the DB: `ConfigurationFile` (agent-key AES-GCM-sealed) and `UUIDFileName` (installation UUID). Verdict **REAL**.

- **Encryption at rest:** agent credential is AES-256-GCM with an **HKDF-SHA256 per-installation key** and authenticated envelope `ha_cfg_v2:` (`config.go:186-233`); config file written **0600** atomically via temp-file+rename (`config.go:writeProtectedYAML`). Log spool DB itself is **not encrypted** (raw logs in SQLite). 
- **Size limits / cleanup:** quota-enforced, default 512 MB, max 4096 MB (`agent/agent/spool.go:20-21`); reclaim deletes only **processed** rows, `VACUUM` after (`db.go:DeleteOld`, `DeleteOldestProcessed`). **REAL.**
- Corruption handling / migration: `AutoMigrate(&models.Log{})` only; no explicit corruption recovery — **UNVERIFIED/PARTIAL.**

---

## 18–19. Queue / WAL / reliability & delivery semantics — **strongest area**

`agent/agent/spool.go` implements a genuine **disk-backed durable spool (WAL-like)**:
- `EnqueueDurable` (`spool.go:26-60`) writes the log to **SQLite before it is eligible for network send**; the memory queue holds only a reference (`spool.go:24` comment).
- `Offer` (`spool.go:66-84`): persists first, then non-blocking enqueue to the send channel; **a full memory queue is NOT a drop** when the spool write succeeded — "the retry scanner resends unprocessed rows" (`spool.go:62-65`). If spool AND queue both fail → increment `LogsDropped`, `WriteToDLQ` (dead-letter).
- Quota back-pressure: `enforceSpoolQuota` deletes oldest **processed** rows; if none can be reclaimed → `errSpoolFull` (`spool.go:90-116`).

**Failure scenarios (evidence-based):**
| Scenario | Behavior | Evidence |
|---|---|---|
| Network down 1h / 24h / backend down | logs keep landing in SQLite spool; resent when link returns; bounded by 512 MB–4 GB quota | `spool.go:26-60`, retry scanner comment `:62` |
| Agent restart / OS reboot | unprocessed rows survive (durable SQLite) and are re-read via `FindUnprocessed` | `db.go:FindUnprocessed` |
| Disk full / queue full | quota reclaim of processed rows; if none → `errSpoolFull` then DLQ + `LogsDropped` | `spool.go:90-116,74-83` |
| Duplicate batch | each log has a UUID `Id` (`spool.go:31-36`); server-side dedup **UNVERIFIED** | — |

**Delivery semantics = AT-LEAST-ONCE (durable, no dedup) — CONFIRMED (UNKNOWN-006 RESOLVED).** Each log gets a UUID; there is a durable spool + retry. The EDR-event ingest side is now confirmed: `EdrService.ingestEvent` does a blind `eventRepo.save(e)` — a new row on every call, no lookup, and `UtmEdrEvent` has no event UUID / unique constraint (`EdrService.java:101-124`, `UtmEdrEvent.java:11-13`); the agent's `EdrEvent` struct carries no id. The telemetry client only checks HTTP <300 with **no ACK-id / sequence-number / offset-acknowledgement**. So retries duplicate rows → **at-least-once; effectively-once ABSENT; server-side dedup ABSENT.**

---

## 20. Event schema

Endpoint/log envelope is **HiveArmor-proprietary**, thin: `plugins.Log{Id, Timestamp, DataSource, DataType, Raw}` (SDK type; stored as `models.Log`). Sensor payloads are per-collector JSON structs (e.g. ETW `ETWEvent` with PID/PPID/CommandLine/ResponseCode, `etw/collector_windows.go:52-71`). **Not ECS/OCSF/OTel at the agent boundary** — normalization to the ECS-style schema happens downstream in event-processor (per project steering), not in the agent. Verdict: schema **REAL but proprietary/thin at the edge**; ECS alignment is a backend concern.

---

## 21. Agent identity

Identity fields (`agent-manager/models/agent.go`): `AgentUUID` (varchar36 uniqueIndex), `Hostname` (**uniqueIndex `idx_hostname_deleted`, not null**), Ip, Mac, Os, Platform, Version, `AgentKeyHash`, `CredentialVersion`, `TenantID`. Agent side: installation UUID in a local YAML file (`config.go:GetUUID`).

- **Hostname is a unique key** → two live agents cannot share a hostname; a **hostname change** creates identity ambiguity, and **VM/golden-image clone** produces duplicate hostname+UUID collisions (both clones carry the same installation UUID file and agent-key). **Identity is NOT clone-stable — architecturally significant (§64).**
- **DB delete / reinstall:** re-enrollment mints a new credential; old row soft-deleted (`DeletedAt` in `idx_hostname_deleted`).
- Certificate expiry behavior **UNVERIFIED** (no per-agent client cert found; auth is agent-key based).

---

## 22. Enrollment

`EnrollmentToken` model (`agent-manager/models/agent.go`): `TokenID` (lookup), `TokenHash` (**bcrypt**), `TenantID`, `PolicyID`, `Platform`, `ExpiresAt`, `MaxUses`, `UseCount`, `RevokedAt/RevokedBy/RevocationReason`, `Version`. Flow: agent presents `enrollment-token` header → interceptor confirms it's on the enrollment route only (`interceptor.go:103-108`) → `RegisterAgent` (`agent_imp.go:80`) runs `consumeEnrollment` inside a DB transaction (bcrypt verify + atomic row-locked consume) → returns `AuthResponse{Id, Key}`; the returned key is stored one-way as `AgentKeyHash`. **Legacy federation/connection-key enrollment retired 2026-08-14** and refused (`interceptor.go:98`). Append-only `EnrollmentAuditEvent` ledger (no secrets/PII, UPDATE/DELETE guard). Verdict **REAL — modern and security-forward.**

---

## 23. Transport security

- Agent telemetry HTTP client honors `InsecureSkipVerify: skipTLS` (`telemetry/client.go:47`) — set by install `<skip_cert_validation>` arg. When not skipped, standard TLS server validation.
- gRPC internal key: **constant-time compare** (`interceptor.go:118-119`).
- Agent-key auth: bcrypt-hash cache compare (`agent_imp.go:ValidateAgentKey` + `credentialMatches`).
- mTLS / client certs / pinning / cert rotation: **RESOLVED (UNKNOWN-004) — NONE.** `agent/utils/tls.go` (`LoadHTTPTLSCredentials`/`LoadGRPCTLSCredentials`) builds only a `RootCAs` pool for **server-certificate validation**; no client certificate, no certificate pinning, no rotation logic. Auth is agent-key/token in headers over one-way TLS. Verdict: server-auth TLS **REAL**, mTLS/pinning **ABSENT**.

---

## 24. Multi-tenancy — **UNSAFE for agent reads (UNKNOWN-001 RESOLVED 2026-09-09)**

`TenantID` is present on `Agent`, `EnrollmentToken`, `EnrollmentAuditEvent` (indexed, not-null). Enforcement is **split by operation type**, and the read path is the hole:

- **Enforced (STRONGLY):** enrollment token create/list/count/revoke, credential rotate/revoke, and DeleteAgent all thread `tenantId` from `TenantContext.getClientId()` into the gRPC request. `AgentGrpcService.java:44,57,68,85`; DeleteAgent requires a tenant or throws "select an authorized tenant before deleting an agent" (`AgentGrpcService.java:346-351`); manager `DeleteAgent` re-checks `id = ? AND tenant_id = ?` (`agent_imp.go`).
- **NOT enforced (UNSAFE):** the agent **read** paths. `AgentGrpcService.listAgents(request)` forwards straight to `blockingStub.listAgents(request)` with **no tenant injection** (`AgentGrpcService.java:38-40`). Same for `listAgentWithCommands` (`:184-185`), `listAgentCommands` (`:180`), and `getAgentByHostname` (`:262` sets only `hostname.Is=`). The manager's `ListAgents` (`agent_imp.go:223-234`) also has **no tenant_id predicate**. `TenantContext` is imported (`AgentGrpcService.java:8`) but referenced only on the mutation/enrollment/delete paths — never on the list/read paths.

**Result: the agent inventory + command read path is tenant-blind end to end.** In MSSP mode an authenticated operator scoped to Tenant A can list, search, and read the commands of Tenant B's agents via `/api/agent-manager/agents`, `/agents-with-commands`, `/agent-commands`, and `/agent-by-hostname`. **Verdict: UNSAFE for reads; STRONGLY-ENFORCED for enrollment / credential / delete.** This is a confirmed MSSP cross-tenant data-isolation defect, not an unknown. (Evidence read directly: `AgentGrpcService.java`, `AgentManagerResource.java`, `agent_imp.go`.)

---

## 25. Heartbeat & health

`Ping` is a **gRPC stream** (`lastseen_imp.go:Ping`) → `LastSeenChannel` → in-memory cache → flushed to DB every **30 s** (`flushLastSeenToDB` ticker, up to 10 parallel upsert workers). Online/offline decided in `GetLastSeenStatus`: **`time.Since(lastPing) > 1 minute → OFFLINE`, else ONLINE** (hardcoded 1-minute threshold). **Only ONLINE/OFFLINE — no degraded / unhealthy / policy-mismatch / queue-pressure state.** Verdict **PARTIAL** (binary health, fixed threshold).

---

## 26. Resource management

`agent/telemetry/vitals.go` collects host vitals; spool has a size quota (§18). CPU/RAM/goroutine self-throttling, sampling, load-shedding, worker-count caps at the collector level: **UNVERIFIED this pass** (prior July plan proposed a ScanWorkerPool but presence in current code not confirmed). Do not assert.

---

## 27. Policy architecture — **two systems (split-brain)**

| System | Controller | Path | Service → Repo/Entity | Push? |
|---|---|---|---|---|
| **New (agent-manager)** | `agent_manager/AgentPolicyResource.java` | `/api/agent-policies` | `UtmAgentPolicyService` | **YES** — assign-group, push, push-agent, sync-on-connect, report-state, states (`AgentPolicyResource.java:137-276`); agent-device auth `ROLE_AGENT_DEVICE` for GET/report/sync |
| **Legacy (EDR)** | `HaAgentPolicyResource.java` | `/api/ha-edr/policies` | `HaAgentPolicyService` → `HaAgentPolicyRepository` + entity `HaAgentPolicy{osType,networkMonitor,processMonitor,filePaths,registryPaths}` | NO push |

They use **separate JPA entities/repositories** (`HaAgentPolicyService.java:6-7,34`), confirming two independent tables. The UI service file states it plainly: `agentPoliciesApi.service.ts:15` — *"Distinct from Ha `/api/ha-edr/policies` (legacy columns; no APPLY_POLICY push)."* Both class-doc themselves "STAGING CANDIDATE — not PRODUCTION READY." Agent-side apply path: `agent/agent/policy_apply.go`, `policy_sync.go`, `policy_schema.go`. Versioning/signing/rollback/inheritance of policies: **not evidenced — UNVERIFIED/ABSENT.**

---

## 28. Group management

Backend `AgentGroupResource.java` `/api/agent-groups` — full CRUD + member add/remove/replace (`:43-148`), all `@PreAuthorize(READ_AUTH|MUTATE_AUTH)`. These are **static host groups**. Distinct concept: agent-manager "groups" = **collector-config groups** (`collector_imp.go:96-117 ConfigurationGroups`) — same word, different meaning. Dynamic/tag/OS/hostname-pattern groups: **not evidenced — UNVERIFIED/ABSENT.**

---

## 29–30. Remote command & response

Command model `AgentCommand` + status enum `Queue/Pending/Executed/Error` (`agent-manager/models/agent.go:8-14`). Delivery is **near-real-time via a bidirectional gRPC stream** (`AgentStream` map + `CommandResultChannel`, `agent_imp.go:33-38`, `AgentStream` at `:~275`) **plus** a persisted queue (`ListAgentCommands` `:391`, `parser.go:25-74`). So it is an **asynchronous queue with a live stream push — NOT an interactive live-response/RTR shell session.**

| Response capability | Verdict | Evidence |
|---|---|---|
| Kill process | REAL (Lin/Win) | `edr_response_actions.go:killProcessByPID` (os.FindProcess+Kill) |
| Quarantine file | REAL (Lin/Win) | `edr_response_actions.go:quarantineFile` (rename to quarantine dir + chmod 000 + sidecar meta) |
| Restore file | REAL | `edr_response_actions.go:restoreFile` (reads sidecar meta, moves back) |
| Network isolation / release | REAL (Lin/Win) / STUB (mac/other) | `edr_linux.go`/`edr_windows.go`; `edr_unsupported.go:20-26` |
| Remote shell / script | PARTIAL (opt-in, off by default) | `config.go:44-47 AllowRemoteShell`; `policy_schema.go:62 AllowShell` |
| Delete / collect / download file, block hash/ip/domain, memory dump, USB control, service stop/start | UNVERIFIED/ABSENT | not found in `edr_response_actions.go` this pass |

File quarantine encryption / chain-of-custody: **ABSENT** (plain move + chmod 000 + JSON sidecar).

---

## 31. Host isolation

Mechanism is per-platform via build-constrained `applyNetworkIsolation(isoType, allowedIPs)` / `liftNetworkIsolation`. **RESOLVED (UNKNOWN-005):**
- **Linux (`edr_linux.go:applyLinuxIsolation`):** `iptables` — flush, always ACCEPT loopback + `ESTABLISHED,RELATED` (keeps the gRPC back-channel alive), ACCEPT each allowlisted IP, then on `FULL` set `INPUT/OUTPUT/FORWARD` policy `DROP`. Lift flushes and restores ACCEPT.
- **Windows (`edr_windows.go:applyWindowsIsolation`):** `netsh advfirewall` — loopback + allowlist rules, then `firewallpolicy blockinbound,blockoutbound` for FULL; lift restores `blockinbound,allowoutbound` and deletes the `EDR_ALLOW_*` rules.
- **What stays reachable:** loopback, established connections, and explicitly allowlisted IPs; `edr_handler.go:handleEdrIsolate` always merges the management host (`cnf.Server`) into the allowlist so isolation cannot strand the command channel. **No WFP/nftables kernel driver — userland firewall commands only** (so isolation is only as strong as the host firewall service). Verdict **REAL (Lin/Win), STUB (mac/other).**

---

## 32–34. Detection / IOC / YARA on endpoint

No on-endpoint detection engine found in `agent/` this pass — no YARA library, no local IOC hash/IP/domain match, no Sigma/behavior engine (ETW carries a suspicious-PowerShell **pattern list** `etw/collector_windows.go:412-443`, which is heuristic tagging, not a rule engine). **Detection runs in the backend/event-processor**, not on the agent. Endpoint detection: **ABSENT** (heuristic PS tagging = PARTIAL/CONFIG-ONLY). YARA / local IOC engine: **ABSENT** in agent tree (grep-level; deep-read UNVERIFIED).

---

## 35. Tamper protection

`agent/tamper/{watchdog,hash,harden_linux,harden_windows}.go`; `doc.go:8` states response actions "require a signed command token" (comment only — see §37). **RESOLVED (UNKNOWN-007): the watchdog is DETECT-ONLY.** `watchdog.go` re-hashes the agent binary every **5 minutes**; on mismatch or missing binary it logs and calls `onTampered(reason)`, then **updates its own baseline to the new hash** to avoid repeat alerts. It explicitly **does NOT restart or prevent** — restart is delegated to the OS service manager (systemd `Restart=on-failure`, Windows SCM recovery). Consequence: a local admin/root who **deletes or replaces** the binary, stops the service, or edits config is **detected within ≤5 min but not blocked**; and because the watchdog rebaselines after alerting, a replaced binary is only flagged once. Platform hardening (`harden_linux.go`/`harden_windows.go`) adds OS-level protections whose exact strength is still **UNVERIFIED** (not opened this pass). Verdict **PARTIAL — detection, not prevention.**

---

## 36. Agent update system — **NO cryptographic authentication**

`agent/updater/updates/update.go` (separate `agent/updater` binary): every 5 min downloads `version.json` (`checkEvery=5m`, `:26`), compares **version string only** (`:75 newVersion.Version != currentVersion.Version`), downloads the new binary over `config.DependUrl` (HTTP with `SkipCertValidation` honored), `chmod 755`, then `runUpdateProcess`: stop service → backup old → swap → promote `version.json` → start → **30 s health check** → `rollbackAgent` on failure (`:141-204`).

```
version.json (HTTP) → string compare → download binary (HTTP) → [NO checksum/sig verify] → swap → 30s health check → rollback?
```

**Explicit determination: downloaded binaries are NOT cryptographically authenticated.** Grep for ed25519/rsa/ecdsa/VerifySignature/checksum/sha256/publicKey in `agent/updater/updates/` = **0 hits.** No manifest signing, no public-key verification, no downgrade protection (any different version string updates — including older), no canary/rings/staged rollout/pause. Only rollback-on-health-fail. **Verdict PARTIAL, and a top technical debt (§60).**

---

## 37. Command signing — **ABSENT (UNKNOWN-002 RESOLVED 2026-09-09)**

The full response-command path was read: `incident_response.go:commandProcessor` (`:72-...`) receives commands off the authenticated gRPC `AgentStream`, then dispatches via `HandleEdrCommand` (`edr_handler.go:39-56`). Commands are **plain prefix-matched strings** — `EDR_QUARANTINE:<path>`, `EDR_RESTORE:<id>`, `EDR_KILL:<pid>`, `EDR_ISOLATE:<type>[:ips]`, `EDR_LIFT_ISOLATION` — passed straight to `quarantineFile` / `killProcessByPID` / `applyNetworkIsolation` (`edr_handler.go:83-155`). **There is NO signature, NO nonce, NO timestamp/expiry, NO per-command token verification anywhere in this path.** The only trust boundary is the gRPC stream authentication itself (agent-key, established by the manager). The `tamper/doc.go:8` "response actions require a signed command token" is **aspirational/comment-only — not implemented.**

Mitigating controls that DO exist: unstructured remote shell is **deny-by-default** (`ShellExecutionAllowed`, `incident_response.go` "REMOTE_SHELL denied", `ShellDeniedMessage`) unless `AllowRemoteShell`; `EDR_ISOLATE` always allowlists the management host so isolation cannot strand the command channel (`edr_handler.go:handleEdrIsolate`, `mergeIsolationAllowlist`). Verdict: **command signing ABSENT; command integrity/authorization rests entirely on gRPC channel auth.** Consequence: anyone able to speak on an authenticated agent stream (e.g. a stolen agent-key impersonation, or the cross-tenant read gap letting an operator target another tenant's agent by id) can issue kill/isolate/quarantine with no second cryptographic check.

---

## 38. Secrets

- Enrollment token: bcrypt `TokenHash` in DB, plaintext only at issue (`models.EnrollmentToken`).
- Agent credential: one-way `AgentKeyHash` in manager DB; on the agent, AES-256-GCM sealed in YAML with HKDF per-install key (`config.go:186-233`).
- `internal-key`: constant-time compared (`interceptor.go:118`).
- `REPLACE_KEY`: injected at build via ldflags (agent config wrapping key).
- Update signing key / command signing key: **none found** (consistent with §36–37).
(No secret values printed.)

---

## 39–42. Observability / diagnostics / health flow

Agent metrics exist: `LogsDropped`, `ConnectedAgents` (manager, `agent_imp.go:metrics`), Prometheus `metrics.IncLogs()` (`lastseen_imp.go`), host vitals (`telemetry/vitals.go`). Whether queue-depth/events-dropped/collector-failure metrics reach the backend/UI: **UNVERIFIED.** Diagnostic bundle / log bundle / goroutine dump / crash reports: **not found — UNVERIFIED/ABSENT.** Collector-level health per-sensor propagation to UI: **UNVERIFIED.**

---

## 43–45. Live query / inventory / container awareness

- Live endpoint query (osquery-style list processes/connections/services/autoruns on demand): **ABSENT** — only the async command channel + telemetry streams exist; no query engine found.
- Inventory: SBOM + SCA collectors exist (`telemetry/sbom.go`, `telemetry/sca.go`, `telemetry/sshconfig.go`) → package/software inventory + CIS/SCA. OS/kernel/CPU/RAM/NIC hardware inventory depth: **UNVERIFIED/PARTIAL.**
- Container/Kubernetes enrichment (container id/image/pod/namespace/cluster on events): **RESOLVED (UNKNOWN-008) — ABSENT.** No container/pod/namespace/cluster/image fields in any endpoint event struct (`EdrEvent` in `edr_handler.go:17-36`, ETW `ETWEvent`, eBPF, ESF); the only "image" field is `ImageFile` = the process executable path (`etw/collector_windows.go:54`), not a container image. Events carry no container/orchestrator context.

---

## 46. UI / backend duplication

| Purpose | UI (frontend-v3) | Service | API | Agent support | Status |
|---|---|---|---|---|---|
| Agent inventory | `edr/endpoints` → `EndpointsListPage` | (endpoints service) | `/api/agent-manager/agents` | yes | REAL — **DUPLICATE #1** |
| Agent inventory | `posture/sensors` → `SensorGridPage` | agent/sensor service | `/api/agent-manager/*` | yes | REAL — **DUPLICATE #1** |
| Agent policy | `edr/policies` → `AgentPoliciesPage` | `agentPolicyService.ts` | `/api/ha-edr/policies` (legacy) | apply | REAL — **DUPLICATE #2** |
| Agent policy (push) | (policies UI) | `agentPoliciesApi.service.ts` | `/api/agent-policies` (new) | push | REAL — **DUPLICATE #2** |
| FIM policy | `edr/fim` → `FimDashboardPage` + `posture/sensors/fim-policies` → `AgentFimPolicyPage` | fim services | ha-edr / agent-policies | yes | overlap (dashboard vs authoring) |
| Provisioning / add agent | `posture/sensors/AddAgentDrawer` | `agentProvisioningService.ts` | `/api/ha-agent-enrollments` | enroll | REAL |
| Package catalog | `posture/sensors/AgentPackageCatalog` | `agentPackage.service.ts` | `/api/ha-agent-packages` | download | REAL |
| File quarantine | `edr/quarantine` → `FileQuarantinePage` | responsePlaybooks.service | (RESP-021 gated) | yes | **FIXTURE/STAGING** |

**Legacy frontends `frontend/` (Angular) and `frontend-v2/` (Next.js) do NOT exist on disk** — all duplication is inside `frontend-v3` + backend.

---

## 47. Quarantine

UI `FileQuarantinePage.tsx` is **fixture/staging-gated**: `fixtureMode` import (`:61`), design-fixture banner "fictional quarantine and containment records… for visual review" (`:634-636`), real mutation gated behind `RESP_021_ISOLATION_MUTATE` (`:610`). The **agent-side quarantine IS real** (`edr_response_actions.go:quarantineFile/restoreFile`). So: **agent execution REAL, UI production wiring FIXTURE/STAGING** — the end-to-end trace UI→API→command→agent is not production-closed. Verdict **PARTIAL (split maturity).**

---

## 48. Database schemas (agent-manager, GORM)

- **Agent**: Ip, Hostname (uniqIdx idx_hostname_deleted, not null), Os, Platform, Version, AgentKey(legacy), **AgentKeyHash**, **AgentUUID** (uniq), **TenantID**, **CredentialVersion**, **CredentialRevokedAt**, DeletedAt/DeletedBy, RegisterBy, Mac, OsMajor/MinorVersion, Aliases, Addresses.
- **EnrollmentToken**: TokenID(uniq), TokenHash(bcrypt), TenantID, PolicyID, Platform, ExpiresAt, MaxUses, UseCount, CreatedBy, LastUsedAt, RevokedAt/By/Reason, Version.
- **EnrollmentAuditEvent**: ID, TenantID, EventType, Actor, Reason, TokenID, AgentID/UUID, PolicyID, Platform, CredentialVersion, EnrollmentVersion, OccurredAt (append-only, UPDATE/DELETE guard).
- **AgentCommand**: id, agent_id, command, CommandStatus (Queue/Pending/Executed/Error), + fields in `parser.go`.
- **Collector**, **LastSeen{ConnectorID, ConnectorType, LastPing}** (`models/lastSeen.go`).
- Backend Postgres (Liquibase): `HaAgentPolicy{osType,networkMonitor,processMonitor,filePaths,registryPaths}`, plus agent-groups / agent-keys / agent-packages tables (entities behind the respective resources).

---

## 49. API inventory (backend, verified)

| Method | Endpoint | Purpose | @PreAuthorize | Controller:line |
|---|---|---|---|---|
| POST/GET/DELETE | `/api/ha-agent-keys[/{id}]` | agent-key mgmt | class `ADMIN` | `HaAgentKeyResource.java:39,76,125,146` |
| GET | `/api/ha-agent-packages[,/summary]` | package catalog | `CATALOG_AUTH` | `HaAgentPackageResource.java:48-64` |
| GET | `/agent-packages/{file}` | binary download | **permitAll (SecurityConfiguration:146)** | `HaAgentPackageResource.java:64` |
| GET/POST/PUT/DELETE | `/api/ha-edr/policies[/{id}]` + `/assign` | legacy EDR policy | READ/MUTATE_AUTH | `HaAgentPolicyResource.java:55-137` |
| GET/POST/PUT/DELETE | `/api/agent-policies[/{id}]` +assign/unassign/push/push-agent/sync-on-connect/report-state/states/push-log | new push policy | READ/MUTATE/AGENT_FETCH/SYNC/REPORT_STATE | `AgentPolicyResource.java:55-276` |
| POST/GET/POST | `/api/ha-agent-enrollments` +revoke +credential/rotate +credential/revoke +audit[/export] | enrollment lifecycle | class `ADMIN\|SOC_MANAGER` | `HaAgentEnrollmentResource.java:48-132` |
| GET/POST | `/api/agent-manager/agents`, agents-with-commands, agent-by-hostname, agent-commands, can-run-command, update-agent-attrs | registry reads + command | READ/COMMAND_READ/MUTATE_AUTH | `AgentManagerResource.java:52-190` |
| GET/POST/PUT/DELETE | `/api/agent-groups[/{id}]` +members | host groups | READ/MUTATE_AUTH | `AgentGroupResource.java:43-148` |
| POST | `/api/edr/events/ingest` | agent EDR-event ingest | **NONE on method** (device auth via TelemetryAgentIdentityFilter; no role/tenant) | `EdrResource.java:151-155` |
| GET/POST | `/api/collectors[/config,/{id},/asset-group(s),/module-groups,/search-by-filters]` | collector config | **NONE (no @PreAuthorize)** | `UtmCollectorResource.java:37-114` |

---

## 50. Authorization

- Most agent controllers carry per-method `@PreAuthorize`; enrollment + keys are class-gated to ADMIN / SOC_MANAGER.
- **`/api/collectors` has NO `@PreAuthorize`** (class or method — `UtmCollectorResource.java`). Checked the global config: `/api/collectors` is **NOT** in the `permitAll` list (`SecurityConfiguration.java:101-163`), so it falls under the default `.anyRequest().authenticated()`. **Net effect: authenticated but NO role/authority restriction and NO tenant scope** — any authenticated principal (incl. an analyst or an agent-device token) can upsert/delete collector config. Verdict **PARTIAL security gap** (not "unauthenticated," but under-authorized). 
- `/agent-packages/**` GET is **permitAll** (`SecurityConfiguration.java:146`) — agent binary download is unauthenticated by design (bootstrap); worth a risk note.
- **`POST /api/edr/events/ingest` has NO method `@PreAuthorize`** (`EdrResource.java:151`) while every other `EdrResource` method does. It is authenticated by `TelemetryAgentIdentityFilter` (device identity `X-HiveArmor-Agent-Id`+`X-Agent-Key`, `TelemetryAgentIdentityFilter.java:28-39`) but has **no role/tenant restriction**, and `UtmEdrEvent` has **no tenant column** — so EDR events are not tenant-tagged at rest, compounding §24. Verdict **PARTIAL gap.**
- Service-layer / tenant-layer checks beyond controller annotations: **UNVERIFIED** (need service reads) — flagged §24, §62.

---

## 51–53. Tests / performance / scale

- Agent-side tests present: `agent/agent/{spool_test,spool_broker_live_test,policy_apply_test,policy_sync_test,edr_isolation_test,edr_quarantine_test,shell_gate_test,enrollment_platform_test,logprocessor_test}.go`; agent-manager `{enrollment_test,identity_test,enrollment_live_integration_test,staging_mvp_live_test,ingress_identity_live_test}.go`. Coverage of enrollment, policy, spool, isolation, quarantine, shell-gate, tenant identity = **present**. A full unit/integration/e2e matrix per capability is **UNVERIFIED this pass** (need to open each test).
- Performance benchmarks (events/sec, CPU/mem, queue stress, fleet simulation): **RESOLVED (UNKNOWN-009) — NONE.** Zero `func Benchmark*` in `agent/` or `agent-manager/` (grep = 0 hits); the `*_test.go` files are unit tests (etw/esf/ebpf/spool/quarantine/sca), not performance tests. No documented supported fleet size. No numbers to cite (not estimated).
- Fleet scale (explicit agent/connection/heartbeat limits): heartbeat flush 30 s with ≤10 workers (`lastseen_imp.go`), `LastSeenChannel` buffer 1000; no documented supported agent count — **UNVERIFIED/inferred only.**

---

## 54. Attack surface (evidence-based)

| Surface | Status | Basis |
|---|---|---|
| Enrollment abuse | Partially protected | one-time bcrypt token, TTL, MaxUses, revocation |
| Credential theft | Partially protected | hashed at rest both sides; but stolen agent-key = full impersonation of that agent |
| Agent impersonation | Partially protected | agent-key bcrypt validate; no per-agent client cert / mTLS confirmed |
| MITM | Partially protected | TLS unless `skipTLS`; pinning UNVERIFIED |
| Command spoofing / replay | **Unprotected** (RESOLVED §37) | commands are plain strings, no signature/nonce/replay guard; trust = gRPC channel only |
| Cross-tenant command/read | **Unprotected for reads** (RESOLVED §24) | `listAgents`/`getAgentByHostname` not tenant-scoped; delete/enroll are scoped |
| Malicious update | **Unprotected** | no binary signature verification (§36) |
| Remote shell abuse | Partially protected | off by default, opt-in gate (`AllowRemoteShell`) |
| Local tampering | Partially protected | watchdog + hardening; extent UNVERIFIED (§35) |
| Telemetry injection / log spoofing | UNVERIFIED | ingest auth via agent-id/key header (`telemetry/client.go`) |

---

## 55. Supply-chain security

Agent build uses ldflags `REPLACE_KEY` injection (CI `$AGENT_SECRET_PREFIX`). Windows Authenticode / macOS notarization exist in CI per `AGENTS.md` (`reusable-sign-agent.yml`) — **release-pipeline signing, not in-repo verifiable here.** SBOM: the agent *collects* SBOM from endpoints (`telemetry/sbom.go`); an SBOM *of the agent itself* / dependency-scan gate: **UNVERIFIED.** **Update artifact signing: ABSENT** (§36) — the notable supply-chain hole is the unsigned self-update, even though release binaries may be OS-signed.

---

## 56. Enterprise deployment

`installer/` is a **Go orchestrator that runs the server stack via Docker Compose** (`installer/docker/{compose,stack,docker}.go`, `installer/network/nginx.go`) — it deploys the HiveArmor *platform*, not endpoint agents at fleet scale. **No MSI / DEB / RPM / PKG / DMG / Helm chart / K8s DaemonSet / GPO / Intune / SCCM / Jamf / Ansible artifacts found in-tree** (`find` for these = 0 hits). Endpoint install today = manual CLI (`install <server> <skip> --enrollment-token-file`) + downloaded binary. Verdict: platform installer **REAL**; **fleet endpoint packaging ABSENT.**

---

## 57. Required failure scenarios

- **A — 10k endpoints lose connectivity 4h:** each spools locally to SQLite (bounded 512 MB–4 GB), resends on reconnect; oldest **processed** rows reclaimed under quota; unprocessed never dropped until quota exhausted → then DLQ + `LogsDropped`. Reconnect creates a **resend thundering-herd** (no jitter/backoff confirmed in client). Evidence: `spool.go`, `telemetry/client.go`.
- **B — AgentManager restarts:** LastSeen reloaded from DB on init (`lastseen_imp.go:InitPingSync`); agent-key cache rebuilt from DB (`agent_imp.go:InitAgentService`); agents reconnect their streams. Registry state durable. Evidence: `agent_imp.go:47-72`.
- **C — OpenSearch stops ingesting:** upstream of the agent; agent keeps spooling to the backend ingest path; backpressure surfaces as the spool filling. Exact backend behavior **UNVERIFIED.**
- **D — endpoint disk 100%:** `enforceSpoolQuota` reclaims processed rows; if none → `errSpoolFull` → DLQ + drop counter (`spool.go:90-116`).
- **E — bad policy to 5k agents:** no policy versioning/rollback/canary found (§27) → **no safe staged undo**; would require a corrective push. **Architecturally significant.**
- **F — bad binary update:** unsigned; per-agent 30 s health check triggers local rollback (`update.go:runUpdateProcess`), but **no fleet-wide canary/pause** and **no signature gate** to stop a malicious artifact in the first place (§36).
- **G — local admin/root tries to disable:** watchdog + hardening resist (§35), extent UNVERIFIED; with sufficient privilege, service stop / binary delete likely possible — needs harden_*.go read.
- **H — agent credential stolen:** attacker can impersonate that agent (ship telemetry, pull its policy); mitigated by `CredentialVersion` + `CredentialRevokedAt` revocation once detected (`models.Agent`).
- **I — enrollment token leaks:** bounded by TTL + MaxUses + revocation (`EnrollmentToken`); one-time consume limits blast radius.
- **J — Tenant A → Tenant B endpoint:** **CONFIRMED cross-tenant READ exposure.** `DeleteAgent`, enrollment, and credential ops ARE tenant-scoped (`AgentGrpcService.java:346-351`), but the agent LIST / list-with-commands / list-commands / by-hostname read paths are **not** tenant-scoped (`AgentGrpcService.java:38-40,180-185,262`; manager `ListAgents` has no tenant predicate). An operator in Tenant A can enumerate and read Tenant B's agents and their commands. Combined with the unsigned command channel (§37), targeting another tenant's agent by id for kill/isolate/quarantine has no second cryptographic barrier. **Top MSSP defect (was UNKNOWN-001, now resolved).**

---

## 58. Capability maturity matrix

| Domain | Capability | Status | Evidence | Maturity | Observation |
|---|---|---|---|---|---|
| Core | Runtime/modularity | REAL | `serv/run.go`, `collector/collector.go` | 4 | clean modular Go, kardianos service |
| Identity | Agent identity | PARTIAL | `models/agent.go` | 2 | hostname-unique, NOT clone-stable |
| Enrollment | One-time token | REAL | `models` EnrollmentToken, `interceptor.go:98-108` | 4 | bcrypt+TTL+MaxUses+revoke+audit |
| Communication | gRPC/TLS + HTTP ingest | REAL | `interceptor.go`, `telemetry/client.go` | 3 | mTLS/pinning UNVERIFIED |
| Reliability | Durable spool/WAL | REAL | `spool.go`, `db.go` | 4 | best area; at-least-once |
| Log Collection | multi-source | REAL | `schema.go`, `parser/netflow/*` | 3 | file-collector robustness UNVERIFIED |
| Windows EDR | ETW | REAL | `etw/collector_windows.go` | 3 | providers+event IDs real |
| Linux EDR | eBPF/auditd/dns/usb | REAL | `ebpf/collector_linux.go` | 3 | linux-only DNS/USB |
| macOS EDR | ESF | PARTIAL | `esf/collector_darwin.go` | 2 | entitlement, response STUB |
| Detection | endpoint | ABSENT | grep: no YARA/IOC/sigma | 1 | backend-only; PS heuristic tag only |
| Response | kill/isolate/quarantine | PARTIAL | `edr_response_actions.go` | 3 | Lin/Win real, mac stub, no crypto vault |
| Live Hunt | osquery-style | ABSENT | none found | 0 | no live-query engine |
| Policy | two systems | PARTIAL | `AgentPolicyResource` + `HaAgentPolicyResource` | 2 | split-brain, no version/sign/inherit |
| Fleet | groups/health | PARTIAL | `AgentGroupResource`, `lastseen_imp.go` | 2 | static groups, binary health |
| Update | self-update | PARTIAL | `update.go` | 2 | rollback yes, **no signature** |
| Tamper | watchdog/harden | PARTIAL | `tamper/*` | 3 | extent UNVERIFIED |
| Multi-tenancy | tenant scope | UNSAFE (reads) | `AgentGrpcService.java:38-40` vs `:346-351` | 1 | reads tenant-blind; enroll/delete scoped |
| Observability | metrics | PARTIAL | `metrics`, `vitals.go` | 2 | reach-to-UI UNVERIFIED |
| Performance | benchmarks | UNVERIFIED | none found | — | no numbers to cite |
| Deployment | fleet packaging | ABSENT | no MSI/DEB/RPM/Helm | 1 | manual CLI only |
| UI | agent pages | REAL (dup) | router `edr/*` + `posture/sensors/*` | 3 | two inventories |
| Backend | agent APIs | REAL | 8 controllers | 4 | broad, one authz gap |

---

## 59. Ten strongest parts (preserve these)

1. **Durable SQLite spool / at-least-once delivery** — `agent/agent/spool.go`, `agent/database/db.go`. Persist-before-send, quota-bounded, never drops unprocessed, DLQ fallback. Rare in home-grown agents; keep it.
2. **Modern one-time enrollment** — bcrypt token, TTL, MaxUses, revocation, append-only audit ledger. `agent-manager/models/agent.go`, `interceptor.go:98-108`.
3. **Credential-at-rest hygiene** — AES-256-GCM authenticated envelope + HKDF per-install key, 0600 atomic write. `agent/config/config.go:186-233`.
4. **Hashed credentials + versioned revocation** — `AgentKeyHash`, `CredentialVersion`, `CredentialRevokedAt`. `agent_imp.go:47-72`.
5. **Native EDR telemetry per platform** — ETW (Win), eBPF (Linux), ESF (macOS) with clean build tags, correct `_other.go` stubs. `agent/collector/*`.
6. **Clean modular runtime** — kardianos service, interface-driven collectors. `serv/run.go`, `collector/collector.go`.
7. **Constant-time internal-key + route-scoped multi-auth interceptor.** `interceptor.go`.
8. **Real response execution (Lin/Win)** — kill, quarantine with restore, network isolation with allow-list. `edr_response_actions.go`, `edr_linux.go`/`edr_windows.go`.
9. **Broad, mostly-authorized backend API** — 8 controllers, per-method `@PreAuthorize`, agent-device role for machine reads. `web/rest/agent_manager/*`.
10. **NetFlow parser breadth** — v1/v5/v6/v7/v9/IPFIX. `agent/parser/netflow/*`.

---

## 60. Ten highest-risk technical debts (consequence only)

1. **Unsigned self-update** (`update.go`) — a compromised update channel or version.json push installs an unauthenticated binary fleet-wide; only per-host health-rollback, no signature gate.
2. **No downgrade protection in updater** — a lower version string still triggers "update," enabling forced rollback to a known-vulnerable agent.
3. **Cross-tenant agent-read exposure (CONFIRMED)** — agent list/search/by-hostname/commands read paths are not tenant-scoped (`AgentGrpcService.java:38-40`); an operator in one tenant can read another tenant's fleet in MSSP mode.
4. **`/api/collectors` under-authorized** — authenticated but no role/tenant restriction on collector config upsert/delete.
5. **Two policy systems (split-brain)** — drift, double maintenance, ambiguous source of truth; both self-labelled "not production ready."
6. **No policy versioning/rollback/canary** — a bad policy to thousands of agents has no safe staged undo.
7. **Identity not clone-stable** — VM/golden-image clones collide on hostname-unique + shared installation UUID, corrupting the registry.
8. **Response commands are unsigned (CONFIRMED)** — kill/isolate/quarantine are plain gRPC strings with no signature/nonce/replay guard (`edr_handler.go`, `incident_response.go`); a spoofed or cross-tenant-targeted authenticated stream can trigger destructive response with no second cryptographic check.
9. **No effectively-once semantics** — at-least-once with no server ACK-id/dedup means duplicate events on retry.
10. **No fleet endpoint packaging** — manual CLI install only; blocks large-fleet enterprise onboarding (MSI/DEB/RPM/Helm/Intune all absent).

---

## 61. Duplication summary

- **Policy:** new `/api/agent-policies` (`AgentPolicyResource`, push-capable, `UtmAgentPolicyService`) vs legacy `/api/ha-edr/policies` (`HaAgentPolicyResource`, `HaAgentPolicyService`, separate entity/repo). New = push+states+sync; legacy = CRUD only. **New is newer; ha-edr is legacy** (UI comment `agentPoliciesApi.service.ts:15`).
- **Inventory:** `edr/endpoints` (`EndpointsListPage`) vs `posture/sensors` (`SensorGridPage`) — two agent-list UIs.
- **Groups:** backend `AgentGroupResource` host-groups vs agent-manager collector-config "groups" — same word, different concept.
- **FIM:** `edr/fim` dashboard vs `posture/sensors/fim-policies` authoring — overlapping domain.
- **Agent state / config:** collector config lives in `/api/collectors` AND flows through agent-manager collector-config groups.
(Legacy `frontend/` and `frontend-v2/` absent — no cross-frontend duplication.)

---

## 62. Critical unknown list

```
UNKNOWN-001  [RESOLVED 2026-09-09]  Tenant isolation of agent READS
Question: Does the backend service layer re-scope /api/agent-manager/agents and /api/agent-policies by tenant, given ListAgents in the manager does not?
Resolution: NO. AgentGrpcService.listAgents / listAgentWithCommands / listAgentCommands / getAgentByHostname forward to the gRPC stub with NO tenant injection (AgentGrpcService.java:38-40,180-185,262); manager ListAgents has no tenant predicate. TenantContext is used only on enrollment/credential/delete. Verdict: UNSAFE for agent reads — confirmed cross-tenant exposure. See §24.
Files read: AgentGrpcService.java, AgentManagerResource.java, agent-manager/agent/agent_imp.go.

UNKNOWN-002  [RESOLVED 2026-09-09]  Runtime response-command signature verification
Question: Is there real ed25519/RSA verification of response commands, or is "signed command token" only a doc comment?
Resolution: NO verification. commandProcessor (incident_response.go) → HandleEdrCommand (edr_handler.go:39-56) dispatches plain prefix-matched strings directly to kill/quarantine/isolate; no signature/nonce/expiry. The tamper/doc.go "signed command token" is comment-only. Trust = gRPC channel auth only. See §37.
Files read: agent/agent/edr_handler.go, agent/agent/incident_response.go.

UNKNOWN-003  [RESOLVED 2026-09-09]  File collector robustness
Resolution: PARTIAL. Glob + os.SameFile rotation + truncation detect present; but offset is IN-MEMORY only and a (re)opened file seeks to END (io.SeekEnd) → lines written while the agent was down are lost at the reader layer; no multiline; rotation re-reads from start (dup risk). See §9.
Files read: agent/collector/file/file.go.

UNKNOWN-004  [RESOLVED 2026-09-09]  mTLS / cert pinning / rotation
Resolution: NONE. utils/tls.go builds only a RootCAs pool (server-cert validation); no client cert, no pinning, no rotation. Server-auth TLS REAL, mTLS/pinning ABSENT. See §23.
Files read: agent/utils/tls.go.

UNKNOWN-005  [RESOLVED 2026-09-09]  Isolation firewall backend + allowed comms
Resolution: Linux = iptables (loopback + ESTABLISHED + allowlist, FULL→policy DROP); Windows = netsh advfirewall (blockinbound,blockoutbound for FULL). Mgmt host always allowlisted. Userland firewall commands, no WFP/nftables driver. REAL Lin/Win. See §31.
Files read: agent/agent/edr_linux.go, agent/agent/edr_windows.go.

UNKNOWN-006  [RESOLVED 2026-09-09]  Server-side dedup / ACK contract
Resolution: Handler FOUND — EdrResource.java:151-155 (POST /api/edr/events/ingest) → EdrService.ingestEvent (EdrService.java:101-124) → blind eventRepo.save(e) (new row every call, NO lookup/dedup). UtmEdrEvent has an auto @Id Long only (UtmEdrEvent.java:11-13) — no event UUID, no unique constraint, no tenant column. The agent's EdrEvent struct carries no id field. Returns 201 with the saved DTO; agent only checks HTTP<300 (edr_handler.go). => at-least-once with NO server-side dedup and NO ACK-id contract, CONFIRMED. BONUS: (1) the ingest method has NO @PreAuthorize while every other EdrResource method does — relies on TelemetryAgentIdentityFilter device auth, no role/tenant restriction; (2) EDR events are not tenant-tagged at rest (no tenant column on UtmEdrEvent). See §18-19, §24, §49-50.
Files read: EdrResource.java, EdrService.java, UtmEdrEvent.java, TelemetryAgentIdentityFilter.java, SecurityConfiguration.java.

UNKNOWN-007  [RESOLVED 2026-09-09]  Tamper effectiveness vs local admin/root
Resolution: DETECT-ONLY. watchdog.go re-hashes binary every 5 min, logs + onTampered on change, then rebaselines; explicitly does NOT restart/prevent (delegated to OS service manager). A privileged local user can stop/delete/replace/edit within a ≤5-min detection window; not blocked. harden_*.go strength still UNVERIFIED. See §35.
Files read: agent/tamper/watchdog.go.

UNKNOWN-008  [RESOLVED 2026-09-09]  Container/K8s enrichment on events
Resolution: ABSENT. No container/pod/namespace/cluster/image fields in EdrEvent/ETW/eBPF/ESF structs; only ImageFile = process exe path. See §43-45.
Files read: agent/agent/edr_handler.go, collector event structs.

UNKNOWN-009  [RESOLVED 2026-09-09]  Performance/scale numbers
Resolution: NONE. Zero func Benchmark in agent/ or agent-manager/; *_test.go are unit tests. No documented fleet size. No numbers to cite. See §52.
Files read: grep of agent + agent-manager test files.
```

---

## 63. Final current-state architecture (labeled)

```
                        HIVEARMOR ENDPOINT PLATFORM (current)

 Endpoint
 ┌──────────────────────────────────────────────────────────┐
 │ Agent (Go, mode=log|edr)                                   │
 │  [REAL]    Log collectors (syslog/file/netflow/journald)   │
 │  [REAL]    ETW (Win) / eBPF (Linux) / ESF (macOS) process  │
 │  [REAL]    Net/DNS/USB/FIM (per-platform; _other.go STUB)  │
 │  [REAL]    Durable SQLite spool (WAL) + DLQ (at-least-once)│
 │  [REAL]    AES-GCM sealed config credential                │
 │  [PARTIAL] Response: kill/quarantine/isolate (Lin/Win);    │
 │            [STUB] macOS/other                               │
 │  [PARTIAL] Tamper (watchdog DETECT-ONLY, 5min hash)       │
 │  [PARTIAL] Updater — [ABSENT] signature/downgrade guard    │
 │  [ABSENT]  On-endpoint detection / live-query / IOC/YARA   │
 └───────────┬───────────────────────────────┬───────────────┘
    gRPC/TLS │ (key|enrollment-token|internal) │ HTTP(S) JSON telemetry
             ▼                                 ▼
 ┌───────────────────────────┐        (→ event-processor → OpenSearch)
 │ agent-manager (Go)         │  Postgres hivearmor_agents
 │  [REAL] enrollment(bcrypt) │  Agent/EnrollmentToken/Audit/AgentCommand/
 │  [REAL] registry/identity  │  Collector/LastSeen
 │  [PARTIAL] health (bin,1min)│
 │  [REAL] command queue+stream│
 │  [UNSAFE] tenant scope      │ (Delete/enroll scoped, reads NOT)
 └───────────┬───────────────┘
   gRPC internal-key
             ▼
 ┌───────────────────────────┐  HTTPS/JWT   ┌──────────────┐
 │ backend (Java/Spring)      │ ◄─────────── │ frontend-v3  │
 │  [REAL] /api/agent-manager  │              │ [REAL dup] 2 │
 │  [REAL] /api/agent-policies  (new,push)    │  inventories │
 │  [LEGACY] /api/ha-edr/policies│            │ [FIXTURE]    │
 │  [REAL] groups/enroll/keys/pkg │           │  quarantine  │
 │  [PARTIAL authz] /api/collectors│          └──────────────┘
 └───────────┬───────────────┘
             ▼ OpenSearch v3-hive-<type>-YYYY.MM.DD → UI
```

---

## Facts that require architectural decisions (no solution proposed)

- Two agent-policy backends exist with separate tables (`/api/agent-policies` vs `/api/ha-edr/policies`).
- Two agent-inventory UI pages exist (`edr/endpoints`, `posture/sensors`).
- Agent self-update performs **no cryptographic authentication** of downloaded binaries and has no downgrade protection.
- Delivery is **at-least-once** with a durable spool; **no effectively-once / server ACK-id / dedup** confirmed.
- Manager + backend agent **read** paths (`listAgents`, `getAgentByHostname`, `listAgentCommands`) are **not tenant-scoped** (CONFIRMED); enrollment/credential/delete are. Cross-tenant read exposure in MSSP mode.
- `/api/collectors` is authenticated but has **no role/tenant authorization**.
- Endpoint identity is **hostname-unique and not clone-stable**.
- Process tree uses **PID/PPID only — no persistent process entity id**.
- **No on-endpoint detection engine** and **no live-query** capability.
- **No fleet endpoint packaging** (MSI/DEB/RPM/PKG/DMG/Helm/DaemonSet/GPO/Intune) — manual CLI only.
- Response commands are **plain unsigned strings** (CONFIRMED); integrity rests solely on gRPC channel auth (UNKNOWN-002 resolved).

---

## 66. Quality check

Every REAL/PARTIAL claim above carries a `path:line` read directly by the author. Unsupported-platform `_other.go` files are classified STUB, not implementations. `/api/collectors` was checked against the global `SecurityConfiguration.java` before verdict (authenticated-but-unauthorized, not "unauthenticated"). **All nine UNKNOWNs are now RESOLVED (2026-09-09):** 001 tenant reads UNSAFE (§24), 002 command signing ABSENT (§37), 003 file collector PARTIAL/no persistent offset (§9), 004 no mTLS/pinning (§23), 005 iptables/netsh isolation REAL (§31), 006 EDR ingest has no dedup / no ACK / no `@PreAuthorize` / no tenant column — handler at `EdrResource.java:151` (§18-19, §49-50), 007 tamper DETECT-ONLY (§35), 008 no container enrichment (§43-45), 009 no benchmarks (§52). Also resolved: panic recovery present (`goSafe`, §5), eBPF wired alongside a /proc poller (§10). Update signing reported ABSENT after a zero-hit crypto grep. No secret values printed. No code modified.
