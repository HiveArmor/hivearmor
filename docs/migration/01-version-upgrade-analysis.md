# 01 — Version Upgrade Analysis

> Target versions based on latest stable releases as of June 2026. Each entry includes current version, target version, change type, breaking changes flag, security fixes, and upgrade classification.

---

## Frontend

### Node.js

| Field | Value |
|---|---|
| Current | 14.16.1 |
| Latest stable | 22.x LTS |
| Recommended target | **20.x LTS** (as migration stepping stone) |
| Change type | Major (14 → 20) |
| Breaking changes | Yes — node-sass@4 breaks on Node 16+; must migrate to dart-sass first |
| Security fixes | **YES — Node 14 EOL April 2023; hundreds of CVEs unpatched** |
| Classification | **CRITICAL** |
| Blocker | Must migrate `node-sass` → `sass` (dart-sass) before upgrading Node |
| Prerequisite for | Angular upgrade, all dependency security updates |

---

### node-sass → sass (dart-sass)

| Field | Value |
|---|---|
| Current | node-sass@4.x |
| Target | sass@1.x (dart-sass — npm package `sass`) |
| Change type | Package replacement (not version bump) |
| Breaking changes | Minor — `@import` deprecated in favor of `@use`/`@forward`; most SCSS still compiles |
| Security fixes | Yes — node-sass is effectively unmaintained |
| Classification | **CRITICAL** (prerequisite for Node upgrade) |
| Notes | Existing `@import` in `_tokens.scss` and others will still work; no immediate refactor required |

---

### Angular

| Field | Value |
|---|---|
| Current | 7.2.0 |
| Latest stable | 19.x |
| Recommended target | **17.x** (LTS; stable standalone component model) |
| Change type | **Major** (7 → 17 requires incremental path: 7→12→16→17) |
| Breaking changes | **Yes — extensive.** Lazy loading syntax changes (7→12), Ivy renderer mandatory (10), ngcc removed (14+), standalone components (14+) |
| Security fixes | **YES — Angular 7 EOL 2019; no security patches for 5+ years** |
| Classification | **CRITICAL** |
| Migration path | 7→12 → 12→15 → 15→17 (each step has ng update migration schematics) |
| Estimated effort | Large (3–6 sprints) |

---

### TypeScript

| Field | Value |
|---|---|
| Current | 3.2.2 |
| Recommended target | **5.4.x** (required by Angular 17) |
| Change type | Major |
| Breaking changes | Yes — several breaking changes across 4→5; strict mode improvements |
| Security fixes | Minor — primarily developer tooling |
| Classification | **HIGH** (tied to Angular upgrade) |

---

### RxJS

| Field | Value |
|---|---|
| Current | 6.3.3 |
| Target | **7.8.x** |
| Change type | Major (6→7) |
| Breaking changes | Yes — `pipe()`-only operators, removed deprecated operators |
| Security fixes | Minor |
| Classification | **HIGH** (required for Angular 17) |

---

### Bootstrap

| Field | Value |
|---|---|
| Current | 4.3.1 |
| Target | **5.3.x** |
| Change type | Major |
| Breaking changes | Yes — jQuery removed, utility API changes, class name changes |
| Security fixes | Yes |
| Classification | **HIGH** |
| Notes | Bootstrap 4 EOL. jQuery removal is the biggest change. |

---

### TSLint → ESLint

| Field | Value |
|---|---|
| Current | TSLint 5.11.0 |
| Target | ESLint + @typescript-eslint/parser + angular-eslint |
| Change type | Tool replacement |
| Breaking changes | Minimal — rule names differ but behavior equivalent |
| Security fixes | Yes — TSLint is deprecated and unmaintained |
| Classification | **MEDIUM** (can be done before Angular upgrade) |

---

### Protractor → Playwright (or Cypress)

| Field | Value |
|---|---|
| Current | Protractor 7.0.0 |
| Target | Playwright 1.x |
| Change type | Tool replacement |
| Breaking changes | Yes — E2E test rewrites required |
| Security fixes | Yes — Protractor deprecated |
| Classification | **LOW** (no production impact; test-only) |

---

### ECharts

| Field | Value |
|---|---|
| Current | 4.4.0 |
| Target | **5.5.x** |
| Change type | Major |
| Breaking changes | Yes — option API changes; echarts-gl has major API changes in v5 |
| Security fixes | Yes |
| Classification | **MEDIUM** |
| Risk note | All chart visualizations affected |

---

### Leaflet

| Field | Value |
|---|---|
| Current | 1.6.0 |
| Target | **1.9.x** |
| Change type | Minor |
| Breaking changes | None significant |
| Security fixes | Yes |
| Classification | **LOW** |

---

### Moment.js

| Field | Value |
|---|---|
| Current | 2.30.1 |
| Target | Replace with **date-fns** or **Day.js** (moment is in maintenance mode) |
| Change type | Package replacement |
| Breaking changes | Yes — API is different; requires search/replace across components |
| Security fixes | Moderate |
| Classification | **LOW** (functional, just maintenance mode) |

---

## Backend (Main API)

### Spring Boot

| Field | Value |
|---|---|
| Current | 3.1.5 |
| Latest stable | 3.4.x |
| Recommended target | **3.3.x** (stable LTS-aligned) |
| Change type | Minor |
| Breaking changes | Minor — some auto-configuration changes |
| Security fixes | **YES — 3.1.x EOL; CVE patches in 3.2+** |
| Classification | **HIGH** |

---

### Hibernate

| Field | Value |
|---|---|
| Current | 5.4.32.Final (PINNED — wrong for Spring Boot 3.1) |
| Target | **6.4.x** (what Spring Boot 3.1 expects) |
| Change type | **Major** |
| Breaking changes | **YES — significant.** HQL syntax changes, `@Entity` graph changes, query API rework |
| Security fixes | Yes |
| Classification | **HIGH — must be done carefully with full query audit** |

---

### Liquibase

| Field | Value |
|---|---|
| Current | 4.24.0 |
| Target | **4.27.x** |
| Change type | Minor |
| Breaking changes | Minimal |
| Security fixes | Yes |
| Classification | **LOW** |

---

### gRPC (backend)

| Field | Value |
|---|---|
| Current | io.grpc 1.65.1 |
| Target | **1.67.x** |
| Change type | Minor |
| Breaking changes | None |
| Security fixes | Minor |
| Classification | **LOW** |

---

### Elasticsearch REST High Level Client

| Field | Value |
|---|---|
| Current | 7.12.1 (EOL) |
| Target | Remove — already replaced by `opensearch-connector` |
| Change type | Removal |
| Breaking changes | Yes — any code still using it must migrate |
| Security fixes | N/A (remove) |
| Classification | **MEDIUM** |

---

### MapStruct

| Field | Value |
|---|---|
| Current | 1.4.2.Final |
| Target | **1.6.x** |
| Change type | Minor |
| Breaking changes | Minimal |
| Security fixes | Minor |
| Classification | **LOW** |

---

### Springdoc OpenAPI

| Field | Value |
|---|---|
| Current | springdoc-openapi-ui 1.6.15 |
| Target | **springdoc-openapi-starter-webmvc-ui 2.x** (for Spring Boot 3.x) |
| Change type | Major (artifact rename + API changes) |
| Breaking changes | Yes — artifact ID changes, config annotation changes |
| Security fixes | Yes |
| Classification | **MEDIUM** |

---

### OkHttp3

| Field | Value |
|---|---|
| Current | 4.11.0 |
| Target | **4.12.x** |
| Change type | Patch/minor |
| Breaking changes | None |
| Security fixes | Yes |
| Classification | **LOW** |

---

## User Auditor + Web PDF

### Spring Boot (user-auditor, web-pdf)

| Field | Value |
|---|---|
| Current | 2.7.14 |
| Target | **3.3.x** |
| Change type | **Major** |
| Breaking changes | **YES — Java 11 → 17 required; Jakarta namespace migration; Spring Security 6 API changes** |
| Security fixes | **YES — Spring Boot 2.7 EOL Nov 2023** |
| Classification | **CRITICAL** |

---

### Java (user-auditor, web-pdf)

| Field | Value |
|---|---|
| Current | 11 |
| Target | **17** |
| Change type | Major |
| Breaking changes | Some — primarily reflection access, module system |
| Security fixes | **YES — Java 11 EOL September 2023** |
| Classification | **CRITICAL** |

---

### Selenium (web-pdf)

| Field | Value |
|---|---|
| Current | 4.5.0 |
| Target | **4.20.x** |
| Change type | Minor |
| Breaking changes | Minimal — some API deprecations removed |
| Security fixes | Yes |
| Classification | **LOW** |

---

## Go Services (cross-cutting)

### Go toolchain

| Field | Value |
|---|---|
| Current | 1.25.5 (agent, agent-manager, plugins, collector) / 1.25.1 (shared, installer) |
| Target | Keep at 1.25.x (current); ensure consistent across all modules |
| Change type | Patch within toolchain |
| Breaking changes | None expected |
| Security fixes | Minor |
| Classification | **LOW** (Go 1.25.x is current) |

---

### docker/docker SDK (collector, installer)

| Field | Value |
|---|---|
| Current | docker v28.5.2+incompatible |
| Target | docker v28.5.x (keep patched) |
| Change type | Patch |
| Breaking changes | None |
| Security fixes | Yes |
| Classification | **LOW** |

---

## Infrastructure / Deployment

### Docker Swarm → Kubernetes

| Field | Value |
|---|---|
| Current | Docker Swarm |
| Target | Kubernetes (optional but recommended for scale) |
| Change type | Architecture change |
| Breaking changes | **YES — entire deployment configuration must be rewritten** |
| Security fixes | Significant — K8s has better RBAC, network policies, secret management |
| Classification | **LOW priority now — HIGH effort; requires dedicated project** |

---

## Summary: Priority Table

| Package | Current | Target | Priority | Risk |
|---|---|---|---|---|
| node-sass → sass | 4.x | sass@1.x | 🔴 CRITICAL | Medium |
| Node.js | 14.16.1 | 20.x LTS | 🔴 CRITICAL | High |
| Angular | 7.2.0 | 17.x | 🔴 CRITICAL | High |
| Spring Boot (user-auditor, web-pdf) | 2.7.14 | 3.3.x | 🔴 CRITICAL | High |
| Java (user-auditor, web-pdf) | 11 | 17 | 🔴 CRITICAL | High |
| TypeScript | 3.2.2 | 5.4.x | 🟠 HIGH | Medium |
| RxJS | 6.3.3 | 7.8.x | 🟠 HIGH | Medium |
| Hibernate | 5.4.32 | 6.4.x | 🟠 HIGH | High |
| Spring Boot (backend) | 3.1.5 | 3.3.x | 🟠 HIGH | Medium |
| Bootstrap | 4.3.1 | 5.3.x | 🟠 HIGH | Medium |
| TSLint → ESLint | 5.11.0 | angular-eslint | 🟡 MEDIUM | Low |
| ECharts | 4.4.0 | 5.5.x | 🟡 MEDIUM | Medium |
| Springdoc OpenAPI | 1.6.15 | 2.x | 🟡 MEDIUM | Low |
| ES REST High Level Client (remove) | 7.12.1 | remove | 🟡 MEDIUM | Low |
| Selenium (web-pdf) | 4.5.0 | 4.20.x | 🟢 LOW | Low |
| Leaflet | 1.6.0 | 1.9.x | 🟢 LOW | Low |
| Liquibase | 4.24.0 | 4.27.x | 🟢 LOW | Low |
| MapStruct | 1.4.2 | 1.6.x | 🟢 LOW | Low |
| gRPC (backend) | 1.65.1 | 1.67.x | 🟢 LOW | Low |
| Moment.js → date-fns | 2.30.1 | replace | 🟢 LOW | Low |
| Protractor → Playwright | 7.0.0 | replace | 🟢 LOW | None |
