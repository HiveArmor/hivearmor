# 00 — Current Technology Stack Inventory

> **Status:** Baseline snapshot as of June 28, 2026. Do not modify until each migration step is explicitly approved.

---

## 1. Frontend

| Component | Technology | Version | File |
|---|---|---|---|
| Framework | Angular | **7.2.0** | `frontend/package.json` |
| Language | TypeScript | **3.2.2** | `frontend/tsconfig.json` |
| Runtime (build) | Node.js | **14.16.1** | `reusable-node.yml` |
| Package manager | npm | 6.x (bundled with Node 14) | — |
| CSS pre-processor | node-sass | **4.x** | `frontend/package.json` |
| UI framework | Bootstrap | **4.3.1** | `frontend/package.json` |
| Bootstrap NG | ng-bootstrap | **4.1.0** | `frontend/package.json` |
| Charts | ECharts | **4.4.0** | `frontend/package.json` |
| Charts binding | ngx-echarts | **4.1.1** | `frontend/package.json` |
| Charts 3D/GL | echarts-gl | **1.1.1** | `frontend/package.json` |
| Maps | Leaflet | **1.6.0** | `frontend/package.json` |
| Code editor | Monaco Editor | **0.20.0** | `frontend/package.json` |
| Reactive ext. | RxJS | **6.3.3** | `frontend/package.json` |
| State management | RxJS BehaviorSubject (no NgRx) | — | app-level services |
| HTTP client | Angular HttpClient | 7.2.0 | — |
| WebSocket | STOMP + SockJS | sockjs-client 1.4.0 | `frontend/package.json` |
| Storage | ngx-webstorage | **2.0.1** | `frontend/package.json` |
| i18n | @ngx-translate/core | **11.0.1** | `frontend/package.json` |
| Drag/drop | ngx-drag-drop | 2.0.0 | `frontend/package.json` |
| Date lib | moment.js | **2.30.1** | `frontend/package.json` |
| Linter | TSLint | **5.11.0** (DEPRECATED) | `frontend/tslint.json` |
| E2E test | Protractor | **7.0.0** (DEPRECATED) | `frontend/package.json` |
| Unit test runner | Karma + Jasmine | 6.4.1 / 2.99.1 | `frontend/package.json` |
| Build tool | Angular CLI | **7.3.6** | `frontend/package.json` |
| Bundle target | ES5 | — | `frontend/tsconfig.json` |
| Bundle budget warn | 10 MB | — | `frontend/angular.json` |
| Bundle budget error | 15 MB | — | `frontend/angular.json` |

---

## 2. Backend (Main API)

| Component | Technology | Version | File |
|---|---|---|---|
| Language | Java | **17** | `backend/pom.xml` |
| Framework | Spring Boot | **3.1.5** | `backend/pom.xml` |
| Scaffolding | JHipster | **7.3.1** | `backend/pom.xml` |
| Packaging | WAR | — | `backend/pom.xml` |
| ORM | Hibernate | **5.4.32.Final** (PINNED — mismatch with Boot 3.1 expected 6.x) | `backend/pom.xml` |
| Connection pool | HikariCP | managed by Boot | `backend/pom.xml` |
| DB migrations | Liquibase | **4.24.0** (200+ changesets) | `backend/pom.xml` |
| Security framework | Spring Security | managed by Boot 3.1 | `backend/pom.xml` |
| JWT | jjwt-api/impl/jackson | managed by JHipster | `backend/pom.xml` |
| SAML2 SSO | spring-security-saml2 | managed by Boot | `backend/pom.xml` |
| 2FA / TOTP | totp-spring-boot-starter | **1.7.1** | `backend/pom.xml` |
| Password hashing | BCryptPasswordEncoder | Spring Security | — |
| gRPC | io.grpc | **1.65.1** | `backend/pom.xml` |
| Protobuf | protobuf-java | **4.29.3** | `backend/pom.xml` |
| Search/analytics | opensearch-connector (custom) | **1.0.5** | `backend/pom.xml` |
| Search client (legacy) | elasticsearch-rest-high-level-client | **7.12.1** (EOL) | `backend/pom.xml` |
| HTTP client | OkHttp3 | **4.11.0** | `backend/pom.xml` |
| Caching | Caffeine | **3.0.5** | `backend/pom.xml` |
| PDF gen | iText7 + Flying Saucer | 7.2.0 / 9.1.22 | `backend/pom.xml` |
| API docs | springdoc-openapi-ui | **1.6.15** | `backend/pom.xml` |
| Error handling | Zalando problem-spring-web | managed by JHipster | `backend/pom.xml` |
| Bean mapping | MapStruct | **1.4.2.Final** | `backend/pom.xml` |
| Boilerplate | Lombok | **1.18.34** | `backend/pom.xml` |
| File type detection | Apache Tika | **3.3.0** | `backend/pom.xml` |
| QR codes | Google ZXing | **3.4.1** | `backend/pom.xml` |
| Build tool | Maven | **3.3.9+** | `backend/pom.xml` |
| Container base | eclipse-temurin:17 | latest | `backend/Dockerfile` |
| Jib base image | eclipse-temurin:**11**-jre-focal | **WRONG — should be 17** | `backend/pom.xml` |

---

## 3. User Auditor Service

| Component | Technology | Version | File |
|---|---|---|---|
| Language | Java | **11** (EOL) | `user-auditor/pom.xml` |
| Framework | Spring Boot | **2.7.14** (EOL Nov 2023) | `user-auditor/pom.xml` |
| Database driver | PostgreSQL | **42.7.11** | `user-auditor/pom.xml` |
| Migrations | Liquibase | managed by Boot 2.7 | `user-auditor/pom.xml` |
| Search connector | opensearch-connector | **1.0.0** | `user-auditor/pom.xml` |
| Boilerplate | Lombok | **1.18.30** | `user-auditor/pom.xml` |

---

## 4. Web-PDF Service

| Component | Technology | Version | File |
|---|---|---|---|
| Language | Java | **11** (EOL) | `web-pdf/pom.xml` |
| Framework | Spring Boot | **2.7.14** (EOL Nov 2023) | `web-pdf/pom.xml` |
| Browser automation | Selenium | **4.5.0** (outdated; latest 4.27+) | `web-pdf/pom.xml` |
| Boilerplate | Lombok | managed by Boot 2.7 | `web-pdf/pom.xml` |

---

## 5. Go Services

| Service | Go version | Key dependencies |
|---|---|---|
| `agent/` | **1.25.5** | grpc 1.81.1, protobuf 1.36.11, gorm 1.31.1, sqlite 1.11.0, cobra 1.10.2, goflow2 1.3.7, go-libaudit 2.6.2 |
| `agent-manager/` | **1.25.5** | grpc 1.81.1, gin 1.12.0, gorm 1.31.1, gorm/postgres 1.6.0, go-sdk 1.1.26 |
| `utmstack-collector/` | **1.25.5** | grpc 1.81.1, docker 28.5.2, sqlite 1.11.0, go-sdk 1.1.26 |
| `as400/` | **1.25.5** | grpc 1.81.1, sqlite, go-sdk |
| `plugins/*/` | **1.25.5** | go-sdk 1.1.26, grpc 1.81.1, gjson/sjson |
| `shared/` | **1.25.1** | utilities only |
| `installer/` | **1.25.1** | docker 28.5.2, gopsutil 3.24.5, license-manager-sdk 0.1.0 |

**Cross-compilation targets:** Linux amd64/arm64, Windows amd64/arm64, macOS arm64.

---

## 6. Databases

| Database | Version | Owner | Schema manager |
|---|---|---|---|
| PostgreSQL `utmstack` | latest (GHCR custom image) | backend | Liquibase 4.24.0 (200+ changesets) |
| PostgreSQL `agentmanager` | latest | agent-manager | GORM auto-migrate |
| PostgreSQL `userauditor` | latest | user-auditor | Liquibase (Boot 2.7 managed) |
| OpenSearch | latest (GHCR custom image) | eventprocessor, backend | Dynamic mapping + ISM |
| SQLite (endpoint) | embedded | agent binary | In-process migrations |
| SQLite (collector) | embedded | collector binary | In-process migrations |

---

## 7. Authentication & Authorization

| Mechanism | Implementation | Notes |
|---|---|---|
| JWT | jjwt (Spring Security) | Ephemeral signing key — rotates on restart |
| SAML2 SSO | spring-security-saml2 | Saml2LoginSuccessHandler issues JWT |
| 2FA / TOTP | totp-spring-boot-starter 1.7.1 | Caffeine in-memory cache for codes |
| External API keys | custom ApiKeyFilter | Stored as hash in `utm_api_keys` |
| Internal service auth | InternalApiKeyFilter | `Utm-Internal-Key` header, env var `INTERNAL_KEY` |
| Agent auth | gRPC TLS 1.3 + REPLACE_KEY | Embedded at build time via ldflags |
| Password hash | BCryptPasswordEncoder | Standard strength |
| RBAC | `ROLE_ADMIN`, `ROLE_USER`, `PRE_VERIFICATION_USER` | 2-tier + transient TFA role |
| Rate limiting | Fail2ban-style login tracking | No global API rate limiting |
| Frontend guard | `UserRouteAccessService` | `canActivate`, checks identity from `AccountService` |

---

## 8. Messaging & Async

| Mechanism | Technology | Notes |
|---|---|---|
| Agent ↔ Server | gRPC bidirectional streaming (TLS 1.3) | No message broker |
| Backend ↔ EventProcessor | HTTP (OkHttp) | `X-Internal-Key` header |
| Frontend real-time | STOMP/WebSocket over SockJS | Spring WebSocket |
| Background jobs | Spring `@Scheduled` (fixed-delay) | 5–6 active schedulers |
| No broker | — | No Kafka, RabbitMQ, or NATS |

---

## 9. Build & CI/CD

| Component | Technology | Notes |
|---|---|---|
| Frontend build | Angular CLI 7.3.6, Node 14.16.1 | 8 GB heap required |
| Backend build | Maven 3.3.9+, Java 17 | `settings.xml` requires `MAVEN_TK` |
| Go build | Go 1.25.5 / 1.25.1 | ldflags required for agent, collector, as400 |
| Container build | Docker (GitHub Actions runners) | docker/build-push-action@v6 |
| Container registry | GHCR | `ghcr.io/utmstack/utmstack/*` |
| CI/CD platform | GitHub Actions | Reusable workflows pattern |
| PR gate | Go deps + AI review + human approver | `pr-checks.yml` |
| Code signing | jsign (Windows GCP KMS), codesign (macOS) | `reusable-sign-agent.yml` |
| Deployment | Docker Swarm (`docker stack deploy`) | Customer Manager API manages updates |
| Changelog gen | ThreatWinds AI API | `generate-changelog.yml` |
| Branch strategy | `release/v11*` → dev; GitHub Release → prod | — |

---

## 10. Observability

| Component | Technology | Notes |
|---|---|---|
| Metrics | Prometheus (Spring Actuator) | `/management/prometheus` |
| JVM metrics | JHipster metrics | `/management/jhimetrics` |
| Health checks | Spring Actuator | `/management/health`, `/api/healthcheck` |
| Logging | SLF4J + Logback (backend) | Structured in prod |
| Logging (Go) | threatwinds/logger 1.2.3 | Structured |
| Distributed tracing | None | No Jaeger/Zipkin/OTLP |
| APM | None | No Datadog/New Relic/Dynatrace |

---

## 11. Security Dependencies (Notable)

| Dependency | Purpose | Risk Level |
|---|---|---|
| `node-sass@4` | Frontend CSS compilation | **CRITICAL** — blocks Node upgrade, CVEs in build chain |
| `Angular 7.2.0` | Frontend framework | **CRITICAL** — EOL 2019, no security patches |
| `Spring Boot 2.7.14` | user-auditor + web-pdf | **HIGH** — EOL Nov 2023 |
| `Java 11` (user-auditor, web-pdf) | Runtime | **HIGH** — mixed with Java 17 backend |
| `elasticsearch-rest-high-level-client 7.12.1` | Legacy ES client | **MEDIUM** — EOL, replaced by opensearch-connector |
| `Hibernate 5.4.32` | ORM (pinned wrong version) | **MEDIUM** — mismatch with Spring Boot 3.1 |
| `Selenium 4.5.0` | PDF generation | **LOW** — outdated but not critical path |
| `CORS allowed-origins: '*'` | Backend prod config | **MEDIUM** — overly permissive |
| `TSLint 5.11.0` | Frontend linter | **LOW** — deprecated, no security updates |
| `Protractor 7.0.0` | E2E test | **LOW** — deprecated, no security updates |
| Trust-all TLS (SocAI, gRPC→AgentManager) | Inter-service | **MEDIUM** — no cert verification |
