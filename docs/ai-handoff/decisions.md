# Decision log

Append-only. Use full timestamp and timezone.

## 2026-08-13 18:21:42 IST (UTC+05:30) — Layered model-neutral handoff

Decision: maintain a small mandatory handoff core plus domain-specific research notes. Do not create a single ever-growing prompt.

Reason: Bedrock sessions will not inherit prior Codex task history or web research. Layering preserves continuity without forcing every task to consume unrelated context.

## 2026-08-13 18:21:42 IST (UTC+05:30) — Frontend/backend vertical slices

Decision: finish one route as a vertical slice—frontend, contract reconciliation, backend minimum, raw-input integration evidence and production gates—before moving to the next route.

Reason: finishing every UI before backend implementation creates attractive but unverifiable workflows and increases contract drift. Building backend-first without an analyst workflow can produce technically valid but unusable projections.

## 2026-08-13 18:21:42 IST (UTC+05:30) — Vulnerability priority is contextual, not CVSS-only

Decision: the current UI may display CVSS, severity and KEV because the backend provides them, but it must not label a CVSS-ordered row as an authoritative enterprise risk score. Future priority combines exploitation evidence, exposure/reachability, asset/business criticality, active threat context, fix/mitigation state and data confidence.

Reason: official CISA, FIRST, NIST and Microsoft guidance treats severity and exploitation probability as inputs to a broader response decision.

## 2026-08-13 18:42:00 IST (UTC+05:30) — Safe empty vulnerability state

Decision: a zero-row response from the current vulnerability API is phrased as “no findings were returned,” not “no vulnerabilities” or “fleet secure.”

Reason: the inspected Java service collapses datastore query exceptions to empty values and exposes no source coverage or partial-failure metadata. The UI cannot prove the difference until `VUL-001` is implemented.

## 2026-08-14 10:53:08 IST (UTC+05:30) — CIS score is a technical rate, not compliance

Decision: label the current aggregate as a technical pass rate and calculate it from aggregate pass/fail/error counts. Exclude not-applicable checks, expose collection errors separately, and never average endpoint percentages or claim compliance/attestation from the value.

Reason: the current summaries represent different endpoint/pack check counts and lack benchmark version, eligibility, applicability, coverage, provenance and attestation context. An unweighted mean can materially misstate fleet configuration posture.

## 2026-08-14 10:53:08 IST (UTC+05:30) — No ungoverned SCA remediation controls

Decision: the CIS result drawer may display backend-provided remediation guidance and investigation pivots, but rescan, exception and configuration-change actions remain visibly unavailable until `CIS-006` is implemented.

Reason: configuration changes can disrupt production. Safe execution requires target/version binding, operational-impact preview, approval policy, maintenance window, recovery/rollback, idempotency, audit and a fresh verification assessment.

## 2026-08-14 11:26:51 IST (UTC+05:30) — Pause frontend expansion for the production-minimum backend

Decision: pause `/compliance` and later frontend slices. The active program is a production-shaped, single-node SIEM pilot delivered in cross-service phases from secure enrollment through real-agent alert acceptance, installation, recovery and ship gates.

Reason: the repository already contains broad UI coverage and two raw-injection detection proofs, but the audited deployment and real-agent path still has hard-coded tenant assignment, shared enrollment credentials, plaintext key distribution, incomplete durability boundaries, TLS verification bypasses and inconsistent frontend-v2/v3 packaging. Adding more UI would increase visible scope without making the system safely installable.

## 2026-08-14 11:26:51 IST (UTC+05:30) — Pilot is single-node and production-shaped, not highly available

Decision: the first installable release targets one supported Linux test server, 1–100 Windows/Linux endpoints and a published measured capacity envelope. It uses version-pinned production configurations, security controls, durability, backup/restore and operational evidence, while explicitly deferring multi-node HA and cross-region disaster recovery.

Reason: a constrained, honest pilot can prove the complete evidence path and operational controls. A single-node Redpanda/OpenSearch deployment cannot truthfully provide the failure tolerance of a replicated production cluster.

## 2026-08-14 11:26:51 IST (UTC+05:30) — Tenant and source identity are assigned by authentication

Decision: ingress must derive tenant, connector and source scope from verified connector identity. Producer-supplied tenant values are validation inputs only and cannot select or broaden scope. Missing or conflicting identity fails closed; there is no default production tenant.

Reason: the current inputs plugin assigns an absent tenant to a checked-in fixed UUID. This makes real-agent multitenancy untrustworthy and is a release blocker rather than a future enhancement.

## 2026-08-14 11:26:51 IST (UTC+05:30) — Kafka commit follows the complete required processing outcome

Decision: the canonical consumer commits only after the normalized event, all required generated alerts and their source lineage are durably recoverable. Optional enrichments are separately retryable and explicitly partial. Deterministic IDs plus a processing ledger/outbox handle re-delivery and crashes.

Reason: the current code can queue and synchronously write the same event, swallow alert-writer errors and commit before detached finding/compliance work completes. Event durability alone is insufficient when the product promise is raw telemetry through detection to alert.

## 2026-08-14 11:57:50 IST (UTC+05:30) — Versioned envelope wraps the existing canonical log payload

Decision: Kafka producers publish `ha.raw-event.v1` as a stable envelope around the existing `plugins.Log` payload. The envelope owns schema version, immutable event and tenant identity, source, observation/receipt timestamps, trace linkage and producer version. The broker key is `tenantId:dataSource`, required acknowledgement is `acks=all`, and topic auto-creation is disabled.

Reason: wrapping preserves parser and detector compatibility while making transport identity and evolution explicit. It avoids an unsafe big-bang rewrite of the shared protobuf model and gives the consumer enough information to reject header/body, tenant, event, source and timestamp mismatches.

## 2026-08-14 11:57:50 IST (UTC+05:30) — Legacy unwrapped Kafka records have a measured sunset

Decision: unwrapped `plugins.Log` Kafka records are deprecated as of this timestamp, accepted only when they validate and carry no false v1 schema declaration, and counted by the consumer. Target sunset is 2027-02-14; removal requires zero observed legacy traffic for the published compatibility window plus outage/replay acceptance.

Reason: fail-closed schema downgrade handling prevents a producer from declaring v1 while bypassing envelope checks, while measured compatibility allows an orderly migration of existing producers without silently dropping queued data.

## 2026-08-14 14:01:07 IST (UTC+05:30) — Enrollment uses a lookup ID plus a slow hash-only verifier

Decision: a one-time enrollment token contains a non-secret UUID lookup component and 256 bits of random secret. Agent-manager stores only a bcrypt verifier. Because the complete versioned token is longer than bcrypt's 72-byte input limit, it is first hashed with SHA-256 using the domain separator `hivearmor:enrollment:v1:`; the digest is URL-safe Base64 encoded to 43 bytes and passed to bcrypt at cost 12. Consumption remains transactional and row locked.

Reason: truncating the token or reducing entropy would weaken the credential; hashing the complete high-entropy value preserves all input bits while bcrypt retains slow offline verification. Text encoding keeps the verifier portable across bcrypt implementations that may mishandle binary null bytes. The explicit domain/version separator prevents cross-protocol verifier confusion and permits a controlled future migration.

## 2026-08-14 14:01:07 IST (UTC+05:30) — Shared connection-key agent enrollment is disabled by default

Decision: `RegisterAgent` accepts the new `enrollment-token` metadata only. Reusable shared connection-key agent enrollment is deprecated as of this timestamp and disabled unless an operator deliberately sets `ALLOW_LEGACY_AGENT_ENROLLMENT=true`. Collector registration is not changed by this phase. Installer bootstrap accepts the enrollment secret only through a protected regular file or stdin, never as a positional process argument.

Reason: a shared secret in shell history cannot bind tenant, policy, platform, expiry or usage and cannot be revoked per device. A dated opt-in migration path avoids a silent fleet break while ensuring new installations fail closed onto the safer contract.

## 2026-08-14 14:01:07 IST (UTC+05:30) — Device credentials are hash-only, with bounded legacy read compatibility

Decision: newly enrolled and rotated device credentials are returned once, stored only as bcrypt hashes and redacted from diagnostic rendering. Revocation clears hash, legacy value and cache entry. Existing plaintext rows remain readable only for migration compatibility; no new path writes plaintext credentials.

Reason: agent-manager needs to verify a presented credential but does not need to recover it. A one-way verifier limits database disclosure impact, while a temporary read-only compatibility path allows existing devices to migrate without reintroducing plaintext writes.

## 2026-08-14 14:26:49 IST (UTC+05:30) — Enrollment authority enforces a 24-hour issuance ceiling

Decision: agent-manager, not only the browser-facing REST validator, canonicalizes platform names, allowlists supported operating systems, bounds policy/actor values and rejects enrollment expiry beyond 24 hours. `macos` is accepted as an input alias and persisted as the Go runtime identity `darwin`.

Reason: internal gRPC is a security boundary and cannot rely on the REST facade for validation. Short-lived bootstrap authority limits exposure if a one-time value is mishandled, while a 24-hour window remains practical for staged pilot deployment.

## 2026-08-14 14:26:49 IST (UTC+05:30) — Agent-manager image builds do not mutate dependency metadata

Decision: container builds copy `go.mod` and `go.sum` before application source, download that locked graph in a BuildKit module cache and run `go build` without `go mod tidy`. The dependency download uses HTTP/1.1 to avoid the observed Go proxy HTTP/2 stream resets.

Reason: source-only edits should not redownload the complete graph, and release builds must not change module selections as a side effect. The previous layout made clean enrollment builds both non-reproducible and unnecessarily dependent on a fragile network step.

## 2026-08-18 12:30:06 IST (UTC+05:30) — Enrollment audit is transaction-coupled and append-only at the database boundary

Decision: successful token create/consume/revoke and credential rotate/revoke operations append one allowlisted audit event inside the same PostgreSQL transaction as the authoritative state change. The table has no application update/delete API, and a database trigger rejects both operations. Audit reads are tenant-derived, role-restricted, bounded, deterministically ordered and limited to safe identifiers, actor/reason, policy/platform, non-secret versions and occurrence time.

Reason: application logs and mutable enrollment rows cannot prove who changed credential state or whether the history was later rewritten. Coupling state and event commits prevents a successful credential transition without its corresponding record. Database enforcement protects the invariant from accidental ORM or operator mutation. Excluding token/device secrets, verifiers, endpoint network identity and hostname prevents the audit trail from becoming a secondary credential or endpoint-inventory disclosure channel.

## 2026-08-18 12:30:06 IST (UTC+05:30) — Credential lifecycle changes require an explicit reason

Decision: agent credential rotate and revoke requests require a non-blank reason bounded to 512 characters at both the Spring REST and agent-manager gRPC/service boundaries. The actor is derived from authenticated user/internal service context; tenant remains server-authoritative.

Reason: a durable credential mutation without business/security rationale is incomplete evidence for incident response, lost-device handling and administrative review. The browser must not choose the actor or tenant, and missing reasons fail closed before a credential state change.

## 2026-08-18 13:11:42 IST (UTC+05:30) — Local compatibility credentials use an authenticated versioned envelope

Decision: while the pilot still uses a compatibility API credential, the endpoint writes it only in a versioned AES-256-GCM envelope with a random nonce and HKDF-SHA256 key derivation bound to the installation UUID. The file is owner-only and atomically replaced. The legacy AES-CBC format is read only for migration. Rotation accepts the issued secret through a protected file/stdin, validates it against the manager before save and never places it in command arguments. This envelope is explicitly defense in depth and does not satisfy the future platform-keystore/device-certificate requirement.

Reason: the previous deterministic unauthenticated ciphertext could not detect tampering and the shared YAML helper used broader file permissions. Authenticated encryption plus atomic owner-only replacement closes those immediate compatibility risks without pretending that a build-injected wrapping value is hardware-backed secret storage. Preserving read-only migration avoids silently orphaning existing endpoints.

## 2026-08-18 13:11:42 IST (UTC+05:30) — Production agent signing fails closed and packages carry verifiable provenance

Decision: production Windows/macOS signing jobs fail if their signing authority is unavailable. Only an explicit non-production invocation may publish unsigned binaries. Supported Linux/Windows packages include internal checksums and install/recovery guidance; the deployment workflow publishes external checksums and build provenance for the package set.

Reason: labeling an unsigned fallback as a signed artifact creates a false trust signal at the exact boundary operators rely on. Checksums detect transfer corruption and provenance links artifacts to the build identity, while actual signature verification and real-OS installation remain mandatory release acceptance rather than inferred from archive creation.

## 2026-08-18 13:37:18 IST (UTC+05:30) — Security filters emit committed RFC problem responses without error redispatch

Decision: tenant-context rejection at the servlet-filter boundary writes and commits the RFC problem body directly for 400, 401, 403 and 404 outcomes. Enrollment controller advice preserves scoped `ResponseStatusException` status and detail. Custom problem extension accessors remain available to Java callers but are ignored as bean properties so Jackson emits each extension only through the RFC properties map.

Reason: `sendError` can enter an `ERROR` dispatch through `/error`, where authentication filters may overwrite the original tenant outcome. That changes security semantics and creates misleading clients. Direct committed responses retain the authoritative status, while single serialization of correlation and field-error members prevents ambiguous machine-readable contracts.

## 2026-08-18 15:30:51 IST (UTC+05:30) — Real-host Phase 1 acceptance is standardized with checked-in harnesses

Decision: keep `PILOT-01` on the current code path and add checked-in packaged-host acceptance assets instead of inventing a new manual checklist per operator run. The Linux and Windows host gate uses the exact current enrollment REST contract, packaged binaries and safe JSON reports from `agent/release/`.

Reason: the remaining blocker is no longer core enrollment logic but repeatable evidence from actual Windows SCM and Linux systemd hosts. A checked-in harness reduces drift between runs, preserves the tenant/role/audit expectations in source control and makes the final handoff explicit about what is automated versus still externally executed.

## 2026-08-18 16:16:32 IST (UTC+05:30) — User-authorized continuation starts PILOT-02 while PILOT-01 host gates remain open

Decision: keep `PILOT-01` incomplete on actual Windows SCM/Linux systemd packaged-host evidence and make `PILOT-02` the only `IN PROGRESS` implementation phase. The ledger records `PILOT-01` as `BLOCKED` on that operator-attached host evidence rather than `CODE COMPLETE`.

Reason: the user asked to continue implementing remaining features. Waiting for an external packaged host would stall identity-derived ingress, which is an independent code slice and a documented release blocker. Packaged-host acceptance remains mandatory before calling enrollment production-ready.

## 2026-08-18 16:16:32 IST (UTC+05:30) — Ingress identity is verified, not listed

Decision: inputs authenticate connectors by presenting the secret to agent-manager `VerifyConnectorIdentity`. The manager returns tenant, opaque UUID and version and never the secret. Authorization refresh uses `ListConnectorAuthorization` pages of at most 100 secret-free rows. Inventory `ListAgents`/`ListCollector` page size is clamped to 100 and collector keys are no longer projected. Inputs may cache identity plus a SHA-256 digest of the presented secret in memory; they do not store or log the secret.

Reason: hash-only device credentials made the old equality cache empty for new agents, while a 100,000-row list was an unbounded authority dump. Verify-on-miss restores authentication without reintroducing a fleet-wide secret projection.

## 2026-08-18 16:16:32 IST (UTC+05:30) — Producer tenant and default-tenant assignment fail closed

Decision: tenant and connector identity on raw events come from verified agent identity. A producer `tenantId` that differs is rejected. Missing identity, revoked credentials, collectors without tenant binding, connection-key HTTP, GitHub HMAC and OTLP currently fail closed. The previous inputs default tenant UUID is removed. Kafka keys for new v1 records are `tenantId:connectorId`.

Reason: a hard-coded tenant and producer-supplied tenant made multi-tenant ingest untrustworthy. Fail-closed ingest is preferable to silently attributing unauthenticated telemetry to a shared tenant. Collector and cloud-plugin tenant binding remain explicit follow-on gaps rather than hidden defaults.

## 2026-08-18 16:59:20 IST (UTC+05:30) — Close PILOT-01 and PILOT-02 as code complete and implement PILOT-03

Decision: on explicit operator instruction, close `PILOT-01` and `PILOT-02` as `CODE COMPLETE` without packaged-host or live-ingest `LIVE VERIFIED` claims, then implement `PILOT-03`. Remaining Windows SCM/Linux systemd and packaged-host role/cross-tenant evidence move to `PILOT-09`. Remaining live identity/forged-tenant/size/rate replay stays on `SIEM-003`. `PILOT-03` is `CODE COMPLETE` for durable endpoint spool, Kafka-only production delivery, quarantine of malformed records and a 4 MiB broker cap. Live restart/outage proof, `hivearmor-collector`/`as400` spooling, encrypted spool contents and a retry budget remain open.

Reason: this Mac cannot execute the Linux systemd or Windows SCM packaged-host harnesses, and the running local-dev images were not rebuilt for identity ingest. Continuing to wait on those gates would stall the durability work the pilot still needs. Closing at `CODE COMPLETE` keeps the remaining live gates visible instead of relabeling them as done.

## 2026-08-18 16:59:20 IST (UTC+05:30) — Memory queue is a reference, not the durability boundary

Decision: endpoint collectors write each log to SQLite before a non-blocking enqueue. Quota reclaim deletes processed rows only. A full memory queue after a successful spool write is not a drop. When Kafka is configured, broker failure returns an error after exponential backoff; the engine socket is not a production fallback. Malformed Kafka records are published to `hivearmor.raw.events.quarantine` with a redacted reason and the original offset commits only after that write succeeds.

Reason: dropping before spool, deleting unprocessed rows to free 20 MB, committing poison records and bypassing the broker on Kafka failure all violate the no-acknowledged-loss promise. Quarantine plus uncommitted write failures keep malformed and unreplicated data recoverable.

## 2026-08-18 19:55:01 IST (UTC+05:30) — Quarantine writer owns the topic name

Decision: `buildQuarantineMessage` must not set `Topic` when `newQuarantineWriter` already has `Topic`. Live parse failures were stuck with lag 1 and `kafka.(*Writer): Topic must not be specified for both Writer and Message`.

Reason: kafka-go treats a dual topic as a write error, so the original offset stays uncommitted and poison records never reach `hivearmor.raw.events.quarantine`.

## 2026-08-18 19:55:01 IST (UTC+05:30) — Live identity ingest is PILOT-02 verified; PILOT-03 quarantine is evidenced but not a full outage close

Decision: promote `PILOT-02` to `LIVE VERIFIED` for enrolled ProcessLog identity, forged-tenant/oversize/rate/revoke and secret-free worker logs against rebuilt local-dev images. Keep `PILOT-03` at `CODE COMPLETE` even after quarantine and restart-retention passed, because broker outage, agent-process spool and collector drop paths were not executed.

Reason: the operator asked for live tests, not a production-ready label. OpenSearch counted the accepted event id, but tenant-1 alerts were empty and NL search depends on soc-ai, so the browser is not identity-ingest evidence.

## 2026-08-18 20:40:00 IST (UTC+05:30) — Kafka commits only after required alerts; staging search is keyword/timeline

Decision: event-processor `Analyze` performs no durable writes. Kafka offset and engine-socket ack happen only after `PersistRequired` succeeds for the event and every required alert. Optional offense/compliance/sequence run after persist. Staging keyword search uses `GET /api/ha-search/timeline` against `v3-hive-log-*` and `v3-hive-alert-*`; NL/soc-ai stays optional. `/v1/inject` is off when `HA_PROFILE=staging|production`.

Reason: the previous consumer could commit after a sync event write even when `WriteAlert` swallowed errors, which produced indexed logs and zero alerts. NL search 500s when soc-ai is absent, so staging MVP cannot depend on it.

## 2026-08-19 20:44:15 IST (UTC+05:30) — Restore drills must not replace live data stores

Decision: prove ACC-12 on staging by restoring PostgreSQL into `hivearmor_restore_drill` and OpenSearch into `restore-drill-*`, then delete those copies. Keep snapshots on the existing data volume and schedule dumps with systemd. Do not invent SLO numbers or claim an off-host / new-VM restore.

Reason: a destructive restore of live `hivearmor` or a fabricated Grafana board would fake SIEM-009.

## 2026-08-19 20:35:00 IST (UTC+05:30) — Enrollment audit is exported, never pruned

Decision: keep `enrollment_audit_events` append-only. `GET /api/ha-agent-enrollments/audit/export` pages the existing safe list RPC into NDJSON (max 10,000). `ENROLLMENT_AUDIT.retentionDays` is operator copy-hold guidance. Archive/prune targets on that policy return 400. Table copies are `pg_dump`, not source DELETE.

Reason: SIEM-009 asked for audit retention/export without faking WORM storage or a cluster restore.

## 2026-08-19 20:10:00 IST (UTC+05:30) — Hunt evidence attaches only from the live search snapshot

Decision: keep HNT-007 execute bound to `searchId` + preview token. Staging proved missing searchId is 400, unknown snapshot is 404, and a snapshot event can be written as `hive_evidence_item.source_ref` on incident 135.

Reason: the remaining production gap was live verification, not a new promotion contract. Approval gates stay unimplemented rather than faked.

## 2026-08-19 20:00:00 IST (UTC+05:30) — Enrollment list is Admin/SOC Manager; Analyst and non-member tenant fail closed

Decision: keep `GET /api/ha-agent-enrollments` as Admin and SOC Manager only. Analyst is 403. A SOC Manager who is a member of tenant 1 and selects an existing tenant they are not bound to (staging 3812) is 403 `tenant-scope-denied`. ROLE_ADMIN may still select any existing tenant.

Reason: PILOT-01 packaged-host remaining evidence was the HTTP role matrix, not a new contract. Windows SCM is still a separate host gate.

## 2026-08-19 21:15:00 IST (UTC+05:30) — Official CIS text is not shipped; EPSS is FIRST-only; telemetry prefers device identity

Decision: catalog official CIS as `LICENSE_REQUIRED_NOT_SHIPPED` with no recommendation text. Persist EPSS only from FIRST.org. Authenticate SCA/SBOM ingest with agent-manager device identity; keep staging `ALLOW_LEGACY_TELEMETRY_INTERNAL_KEY` until a non-revoked enrolled agent posts signed ingest. Unique SCA keys include tenant, pack id and pack version.

Reason: CIS Benchmark content is licensed. Invented EPSS would be a false score. Sharing `INTERNAL_KEY` with endpoints is not a fleet credential.

## 2026-08-19 18:45:08 IST (UTC+05:30) — Enrollment platform is OS type, not distro

Decision: `RegisterAgent` sends `linux|windows|darwin` derived from OS type (with GOOS fallback). Token policy `platform=linux` must not be compared to go-sysinfo distro names such as `ubuntu`.

Reason: staging packaged install failed with `PermissionDenied: enrollment token is invalid` after the token row was found, because `OS.Platform` was `ubuntu`.

## 2026-08-19 18:28:18 IST (UTC+05:30) — Observed telemetry posts from systemd EnvironmentFile, not the unit

Decision: load `HA_INTERNAL_KEY` / `HA_TENANT_ID` from `/etc/hivearmor/agent.env` (0600) via a systemd drop-in. Do not embed the key in `ExecStart`, the unit, or install arguments. Until enrollment is complete, `telemetry-loop` may run as `hivearmor-telemetry.service` with the same file. Sharing `INTERNAL_KEY` with endpoints remains staging-only.

Reason: kardianos/service only optional-loads `/etc/sysconfig/HiveArmorAgent`, which Ubuntu does not use. A drop-in plus owner-only env file is the smallest change that makes SCA/SBOM post from a real service manager without leaking the key in `systemctl cat`.

## 2026-08-18 20:40:00 IST (UTC+05:30) — Staging Compose is a new profile, not an edit of local-dev as the production path

Decision: keep `local-dev/docker-compose.yml` as the lab. Ship `deploy/staging/` with host-published 443/50051/9000 only, manager-only Kafka (`KAFKA_WORKERS=1`), worker `KAFKA_ENABLED=false`, and a `frontend-v3` nginx image. Call passing unit/compose evidence `STAGING CANDIDATE`, not `PRODUCTION READY`, until a clean VM install is recorded.

Reason: local-dev still publishes data ports and lab secrets. A dedicated profile is the PILOT-07 topology without claiming a VM that was not provided.

## 2026-08-21 16:37:00 IST (UTC+05:30) — Every remaining page uses an OEM research gate and evidence-honest vertical slices

Decision: execute `remaining-page-program.md` one route family at a time. Before implementation, compare at least three relevant official primary sources, including two product/OEM workflows where available, and preserve the conclusions in a domain research note. Use the strongest workflow patterns without copying vendor branding or inventing unsupported data. A visually complete page is not a backend or production-readiness claim.

For Compliance Assurance specifically, treat `/api/ha-posture/score` and `/frameworks` as aggregate technical signals only. Do not call a score certification or compliance, auto-select a framework, render an empty fictional control ledger, or use undocumented legacy evidence/report endpoints. Progressive control/evidence/action/report functionality waits for `CMP-001`–`CMP-009`.

Reason: Microsoft Purview, AWS Audit Manager and ServiceNow GRC converge on scoped assessments, controls, evidence lineage, actions and governed reporting. The checked-in backend currently provides only aggregate fields and global repositories, so an honest inventory plus explicit capability boundary is safer and more useful than simulated completeness.

## 2026-08-21 17:06:45 IST (UTC+05:30) — Dashboards are governed operational definitions, not independent chart entities

Decision: use one frontend dashboard definition for discovery, runtime and Studio. Managed content is clone-only; global tenant/time/variables are explicit; every panel reports source, state and freshness; drilldowns are governed pivots. Production may normalize legacy dashboard metadata for discovery, but it does not execute or mutate through unsecured, unbounded entity routes. Full behavior and saving remain fixture-only until `DSH-001`–`DSH-010` exist.

Reason: Splunk, Elastic, Sentinel Workbooks and Grafana converge on shared context, governed drilldowns, managed content, permissions and version history. The checked-in backend splits dashboard, layout and visualization execution without tenant/version/query-budget guarantees, so visually pretending those guarantees would be unsafe.

## 2026-08-21 17:37:57 IST (UTC+05:30) — Reports are governed communication artifacts, not generic metadata rows

Decision: use one lifecycle across generated reports, schedules and templates, with route-specific type entry points for SITREP, incident and after-action views. Treat the checked-in report CRUD and compliance-backed schedule JSON as compatibility discovery only. Production generation, preview, approval, signed download, distribution and retention fail closed until `REP-001`–`REP-010` provide tenant/snapshot/field-permission, evidence-citation, redaction, execution-identity and immutable-audit guarantees.

Reason: Splunk separates definition, owner permissions, schedule, execution and delivery; Microsoft separates workbook/template access from referenced-resource access; ServiceNow treats post-incident review as a time-stamped workflow record; and NIST integrates lessons learned across incident response. A nullable report URL and a recipient list cannot safely represent these guarantees.

## 2026-08-21 18:46:15 IST (UTC+05:30) — Pipeline operations use one measured source-to-index model and fail-closed replay

Decision: consolidate pipeline signals, source inventory and parser administration into Flow, Sources, Parsers, Failures and Capacity views. Label every operational value as directly measured, configured or unavailable; do not derive health from one cluster value or invent thresholds. Preserve the live-verified raw envelope, spool, quarantine and soak evidence. In production, source onboarding and replay remain preview-only until durable tenant-bound, secret-safe, versioned and audited contracts exist under `ING-001`–`ING-010`.

Reason: Splunk, Elastic, Sentinel and OpenSearch converge on topology plus throughput/latency/freshness/failure provenance, while the checked-in APIs provide only pieces of that model. A unified evidence-honest workspace gives operators a coherent mental model without pretending aggregate cluster health, stored parser counters or an in-memory source POST are production controls.

## 2026-08-22 20:54:37 IST (UTC+05:30) — Connections, credentials, delivery and access are separate governed objects

Decision: consolidate the four legacy admin screens into one operations workbench, but keep configured connections, delivery destinations, routing policy, credential aliases and service API keys as distinct models. Production may read legacy integration metadata, admin notification rules and the hash-only API-key inventory. It must not call the unguarded raw notification-channel/config entity surfaces or present the notification-rule mock test as delivered. Connector/delivery setup remains a reviewable preview until `INO-001`–`INO-010` provide versioned tenant scope, write-only secrets, bounded egress, real receipts, durable retry/dead-letter and audit.

Reason: Sentinel, Elastic, Splunk and ServiceNow converge on catalog-versus-instance separation, guided validation, reusable credential references and observable lifecycle. The checked-in notification dispatch can make arbitrary external calls from raw stored JSON without the authorization, redaction and SSRF boundary required for safe enterprise administration.

## 2026-08-22 21:39:31 IST (UTC+05:30) — Identity lifecycle is governed by effective authority, not user CRUD

Decision: consolidate directory, tenant, access-review, federation and identity-audit visibility into one control plane while keeping platform-global, MSSP-delegated and tenant-local authority distinct. Production may read the protected user, tenant, OIDC and SCIM projections and the protected `/users/authorities` compatibility catalogue. It must not call the unprotected legacy `/authority` CRUD or simulate invitations, access decisions, session revocation, break-glass activation or immutable audit. Those operations remain fail closed until `IAM-001`–`IAM-010` provide tenant-derived scope, effective capabilities, optimistic version, idempotency, separation of duties and audit.

Reason: Microsoft Entra, Azure Lighthouse, Okta and Splunk converge on lifecycle, effective scope, federation/provisioning provenance and periodic review. The checked-in backend has useful but fragmented resources; a visually complete lifecycle over direct CRUD would overstate authorization and governance guarantees.

## 2026-08-23 11:26:10 IST (UTC+05:30) — Integrate the safety checkpoint through an auditable merge

Decision: preserve the Governance control-plane commit and the `staging/siem-mvp` safety checkpoint as separate merge parents on local `main`. Retain all product code, hunt backend changes, tests, staging validation helpers and durable handoff/contract records. Exclude machine-local `.claude` settings, generated Playwright logs/snapshots and browser-review PNGs from the integrated product tree. Keep the staging branch as a recoverable reference and do not push without a separate explicit request.

Reason: a non-fast-forward merge preserves provenance for work assembled across Cursor and Codex sessions, while excluding workstation artifacts keeps the product commit reproducible. The staging branch remains available for comparison without leaving `main` dependent on an uncommitted worktree.
