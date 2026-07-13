# 12 — Risk Register

## Risk Rating Key

| Severity | Likelihood | Definition |
|---|---|---|
| Critical | High | Actively exploitable or causes service failure today |
| High | Medium | Likely to cause significant issues within 6 months |
| Medium | Low | Should be addressed in current development cycle |
| Low | — | Technical debt, address when convenient |

---

## Security Risks

| ID | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| SEC-01 | Angular 7.2.0 (EOL 2019) — no security patches; known CVEs unaddressed | High | High | Upgrade to Angular 17+ |
| SEC-02 | Node 14.16.1 EOL (April 2023) — unpatched CVEs in dependency chain including `node-sass` | High | High | Upgrade frontend build toolchain |
| SEC-03 | Password passed as URL query parameter in `GET /api/check-credentials?password=...` — logged in server access logs | High | High | Move to POST with JSON body |
| SEC-04 | Web-PDF Selenium accepts user-controlled URL — potential SSRF | High | Medium | Validate URL is internal; allowlist permitted URL patterns |
| SEC-05 | Backend→AgentManager gRPC uses `InsecureTrustManagerFactory` — no cert validation | Medium | Low | Use proper TLS cert verification |
| SEC-06 | SOC AI HTTP client uses trust-all TLS (`X509TrustManager` overriding all checks) | Medium | Low | Use proper TLS cert verification |
| SEC-07 | CORS `allowed-origins: '*'` in prod config — overly permissive | Medium | Medium | Restrict to known frontend origin |
| SEC-08 | JWT signing key ephemeral (rotates on restart) — no token revocation | Medium | Medium | Consider persistent key with revocation list |
| SEC-09 | REPLACE_KEY embedded in Go binaries via ldflags — extractable via binary analysis | Medium | Low | Consider hardware-bound secrets or remote attestation |
| SEC-10 | No API rate limiting beyond fail2ban on login endpoint | Medium | Medium | Implement API gateway rate limiting |
| SEC-11 | SMTP credentials stored as plaintext in `utm_configuration_parameter` | Low | Low | Encrypt sensitive configuration values at rest |
| SEC-12 | TFA codes in Caffeine in-memory cache — no encryption at rest | Low | Low | Acceptable if memory access is controlled |
| SEC-13 | `DEBUG_INFO_ENABLED: true` in both dev and prod environments | Low | Low | Set to `false` in production builds |
| SEC-14 | Spring Boot 2.7 EOL (Nov 2023) for user-auditor and web-pdf | High | High | Upgrade to Spring Boot 3.x |

---

## Dependency Risks

| ID | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| DEP-01 | Angular 7.2.0 — 6+ years behind current; no vendor support | Critical | Active | Full framework upgrade required |
| DEP-02 | Hibernate 5.4.32 pinned in Spring Boot 3.1 (should be Hibernate 6.x) — forced downgrade may cause subtle query issues | High | Medium | Upgrade Hibernate; may require JPA query changes |
| DEP-03 | TSLint 5.11.0 deprecated — replaced by ESLint in Angular 12+ | Medium | Active | Migrate to ESLint when upgrading Angular |
| DEP-04 | Protractor 7.0.0 deprecated for E2E testing | Low | Active | Migrate to Cypress or Playwright |
| DEP-05 | Karma deprecated in Angular 16+ | Low | Active | Migrate to Jest when upgrading Angular |
| DEP-06 | `node-sass@4` prevents Node upgrade — blocks all security updates for Node runtime | Critical | Active | Migrate to Dart Sass (`sass` npm package) |
| DEP-07 | Spring Boot 2.7 (user-auditor, web-pdf) — EOL | High | Active | Upgrade to Spring Boot 3.x |
| DEP-08 | jQuery in Angular app — unnecessary; adds attack surface | Low | Low | Remove jQuery; use Angular/native APIs |
| DEP-09 | `jib-maven-plugin` configured for Java 11 image despite Java 17 requirement | High | Active | Fix jib base image to `eclipse-temurin:17` |
| DEP-10 | `echarts@4.4.0` — 4+ years behind; ECharts 5 has significant API improvements | Medium | Low | Upgrade when doing Angular upgrade |

---

## Operational Risks

| ID | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| OPS-01 | No automated backup/restore procedure for PostgreSQL | High | High | Implement scheduled `pg_dump` + restore test |
| OPS-02 | No automated OpenSearch snapshot policy | High | High | Configure ISM snapshot policy |
| OPS-03 | Geolocation CSVs not in repo — build fails if GCS bucket unavailable | High | Medium | Cache CSVs or include fallback |
| OPS-04 | No `.env.example` or documented environment variable reference | Medium | Active | Create `.env.example` template |
| OPS-05 | No health check on web-pdf service | Medium | Medium | Add health endpoint check |
| OPS-06 | Docker Swarm — limited tooling vs Kubernetes; harder to operate at scale | Medium | Low | Evaluate migration to Kubernetes for 500+ source deployments |
| OPS-07 | No distributed tracing (no Jaeger/Zipkin/OTLP) | Medium | Low | Add OpenTelemetry instrumentation |
| OPS-08 | Single-node OpenSearch default — no horizontal scaling or replication | High | Active for large deployments | Configure multi-node cluster for large deployments |
| OPS-09 | Liquibase runs on startup — no zero-downtime migration | Medium | Medium | Implement pre-start migration job |
| OPS-10 | Agent binary names have legacy aliases — backwards compatibility concern | Low | Active | Document and plan deprecation timeline |

---

## Architecture Risks

| ID | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| ARCH-01 | No API versioning — breaking changes require coordinated deployment | High | Active | Implement `/api/v1/` versioning or versioned DTOs |
| ARCH-02 | Frontend and backend tightly coupled — no API contract testing | High | Medium | Add Pact or OpenAPI contract tests |
| ARCH-03 | `compliance-orchestrator` plugin built but never deployed | Medium | Active | Add to Dockerfile or remove from repo |
| ARCH-04 | Report and vulnerability scanner modules disabled but code still in codebase | Low | Active | Remove dead code or re-enable with proper testing |
| ARCH-05 | Mixed Java versions (17 + 11) across services — maintenance burden | Medium | Active | Upgrade user-auditor and web-pdf to Java 17 |
| ARCH-06 | No test infrastructure — zero automated regression coverage | Critical | Active | Build test foundations before major changes |
| ARCH-07 | JWT key rotates on restart — all sessions invalidated on every deployment | Medium | Active | Use persistent key with proper secret management |
| ARCH-08 | AgentManager in-memory stream maps — not horizontally scalable | Medium | Low | Implement distributed session store if scaling required |
| ARCH-09 | Config plugin polls PostgreSQL every 30s for rule changes — potential latency in rule updates | Low | Low | Acceptable; add alerting if poll lag becomes critical |
| ARCH-10 | build.sh contains placeholder secrets — developer risk of deploying broken binary | Medium | Medium | Validate secret injection before build; CI enforces correct values |

---

## Business Continuity Risks

| ID | Risk | Severity |
|---|---|---|
| BC-01 | v10 EOL December 5, 2026 — customers still on v10 face loss of support | High |
| BC-02 | No offline update capability — installer requires internet for image pulls | Medium |
| BC-03 | Single installer binary — no rollback path if upgrade fails mid-apply | High |
| BC-04 | Secrets in `/root/utmstack.yml` — if lost, services cannot restart correctly | Critical |
