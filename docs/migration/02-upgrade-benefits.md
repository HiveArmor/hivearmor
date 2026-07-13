# 02 — Upgrade Benefits

---

## node-sass → sass (dart-sass)

**Security:** Eliminates a build-chain dependency that is effectively unmaintained and has unpatched CVEs in its native C++ binding chain. Dart-sass is the canonical, actively maintained Sass implementation.

**Performance:** Dart-sass is significantly faster than node-sass (pure Dart VM vs native binding via node-gyp).

**Developer experience:** Removes the requirement for native compilation — `sass` installs in seconds with no build tooling. Removes the hardest constraint binding the entire frontend to Node 14.

**Maintenance:** Dart-sass supports modern Sass features (`@use`, `@forward`, CSS nesting). node-sass will never support them.

**Enterprise SIEM relevance:** Unblocks the Node 14 → 20 upgrade which eliminates hundreds of transitively vulnerable packages from the build supply chain.

---

## Node.js 14 → 20 LTS

**Security:** Node 14 EOL since April 2023. npm packages that ship with Node 14 (npm 6.x) have multiple known CVEs. Moving to Node 20 eliminates the entire EOL runtime risk.

**Performance:** Node 20 has significant V8 engine improvements — faster JS execution, lower memory usage, improved startup time.

**Developer experience:** Node 20 includes better native ESM support, improved `--watch` mode, better test runner, native `fetch` API.

**Ecosystem:** Nearly all modern npm tooling requires Node 16+. Node 20 opens up the full modern Angular/TypeScript ecosystem.

**Enterprise SIEM relevance:** SOC 2 and ISO 27001 compliance frameworks penalize use of EOL runtime components in production build pipelines.

---

## Angular 7 → 17

**Security:** Angular 7 has had no security patches since 2019. The 7→17 path includes fixes for XSS vectors, dependency injection scope leaks, and template expression evaluation vulnerabilities.

**Performance:** Angular Ivy renderer (mandatory since v12) is dramatically faster for initial render and change detection. Bundle sizes shrink 20–40% due to better tree-shaking. Lazy loading improvements reduce route-change latency.

**Developer experience:** Modern Angular CLI, standalone components (v14+), typed forms (v14+), control flow syntax (`@if`, `@for` — v17), signals (v16+), and Angular Language Service IDE integration.

**Scalability:** Ivy enables better code splitting and dynamic component loading — critical for a modular SIEM UI with 20+ feature modules.

**Maintainability:** String-based lazy loading (`loadChildren: './module#Class'`) is replaced by the modern function-based syntax. Migration schematics handle most of this automatically.

**Enterprise SIEM relevance:** A modern Angular supports better accessibility compliance (WCAG 2.1), better internationalization, and integration with enterprise design systems.

---

## Spring Boot 3.1.5 → 3.3.x (backend)

**Security:** Spring Boot 3.2/3.3 includes patches for CVEs in several managed dependencies including Spring Security, Netty, and Jackson.

**Performance:** Virtual threads (Project Loom) support in Boot 3.2+ — `spring.threads.virtual.enabled=true` can significantly improve throughput for I/O-bound SIEM API endpoints without any code changes.

**Developer experience:** Improved auto-configuration, better native image support, improved Actuator endpoints, Bean Validation improvements.

**Observability:** Native OpenTelemetry auto-instrumentation support in 3.2+ — enables distributed tracing without a separate agent.

**Enterprise SIEM relevance:** Virtual threads directly benefit alert query endpoints, log search, and compliance report generation — all I/O-heavy operations.

---

## Spring Boot 2.7.14 → 3.3.x (user-auditor, web-pdf)

**Security:** Critical — Spring Boot 2.7 EOL Nov 2023. Multiple CVEs in Spring Security 5.x (used by Boot 2.7) are patched in Spring Security 6.x (Boot 3.x). CVE-2024-22257 (Spring Security authorization bypass) requires Boot 3.x.

**Standardization:** Aligns user-auditor and web-pdf with the main backend's Spring Boot version, eliminating the maintenance burden of running two major Spring Boot versions.

**Java 17 unblocking:** Boot 3.x requires Java 17+, which eliminates the mixed Java 11/17 setup and its associated classpath risks.

**Enterprise SIEM relevance:** User session auditing is a core compliance feature. Running it on an EOL framework is an audit liability.

---

## Hibernate 5.4.32 → 6.4.x

**Correctness:** The current setup is using Hibernate 5 with Spring Boot 3.1 which ships Hibernate 6. This mismatch has caused silent ORM behavior differences and limits use of newer JPA 3.1 features.

**Performance:** Hibernate 6 has significantly improved SQL generation — avoids unnecessary JOINs, better batch processing, improved criteria API execution plans.

**Security:** Hibernate 6 includes fixes for HQL injection edge cases and better handling of parameterized queries.

**Maintenance:** Hibernate 5 is EOL. Security patches will only appear in 6.x+.

**Enterprise SIEM relevance:** The correlation rules, alert storage, and incident management data models are all JPA-managed. Correct ORM behavior is critical for data integrity.

---

## TypeScript 3.2 → 5.4

**Security:** TypeScript's type system catches more potential null/undefined vulnerabilities at compile time. Strict mode + newer TypeScript eliminates entire categories of runtime errors.

**Developer experience:** Template literal types, satisfies operator, const type parameters, improved type inference, better IDE autocomplete.

**Performance:** Faster incremental compilation reduces feedback loop time.

**Maintainability:** Modern TypeScript catches more real bugs before runtime — critical for SIEM alert processing and incident workflows where data integrity matters.

---

## RxJS 6.3.3 → 7.8

**Performance:** Better tree-shaking eliminates unused operators from the bundle. `firstValueFrom`/`lastValueFrom` replace `toPromise()` (deprecated in v7). Improved memory management for long-lived observables.

**Developer experience:** Cleaner subscription management, improved error handling, better TypeScript types for operators.

**Security:** Deprecated `toPromise()` patterns that can cause unhandled promise rejections are replaced by explicit async/await patterns.

---

## Bootstrap 4.3.1 → 5.3.x

**Security:** Bootstrap 4 EOL. Multiple XSS vulnerabilities in Bootstrap 4 tooltip/popover JavaScript components have been patched in v5.

**Performance:** Bootstrap 5 removes jQuery dependency — saves ~30KB gzipped. Uses native CSS custom properties for theming.

**Developer experience:** No jQuery means simpler component integration. CSS Grid and Flexbox utilities are more comprehensive. RTL support built-in.

**Branding:** Bootstrap 5 CSS custom properties enable runtime theming without a build step — critical for the planned branding abstraction.

---

## ESLint (replacing TSLint)

**Security:** TSLint stopped receiving security updates in 2019. ESLint + `@typescript-eslint` + `angular-eslint` is the community-standard replacement.

**Developer experience:** ESLint integrates with all modern IDEs. More rules, auto-fix capability, plugin ecosystem.

**Enterprise SIEM relevance:** Consistent code quality tooling reduces the likelihood of subtle bugs in complex SIEM logic (alert deduplication, SOAR execution, compliance queries).

---

## ECharts 4.4 → 5.5

**Performance:** ECharts 5 has significantly better rendering performance for large datasets — critical for SIEM dashboards displaying thousands of events.

**Features:** Improved geographic visualizations, better animation system, new chart types (Sunburst improvements, Flow graph), better accessibility (ARIA attributes).

**Security:** Security fixes for SVG/canvas rendering edge cases.

**Enterprise SIEM relevance:** Dashboard performance directly impacts analyst productivity during incident response.

---

## Remove elasticsearch-rest-high-level-client 7.12.1

**Security:** EOL client; vulnerability patches will not be released. The application already has `opensearch-connector` as the replacement.

**Maintenance:** Eliminates 3+ transitive dependencies and reduces bundle size.

**Correctness:** Having both clients in the classpath creates confusion about which client is active for any given query.

---

## Virtual Threads (Spring Boot 3.2+ feature, no code change)

**Performance:** Enabling `spring.threads.virtual.enabled=true` allows the Spring MVC thread pool to use Project Loom virtual threads. For I/O-bound SIEM workloads (OpenSearch queries, gRPC calls, compliance report generation), this can increase throughput 3–5x under load.

**Enterprise SIEM relevance:** Directly improves concurrent alert query performance, multi-user log search sessions, and compliance report scheduling under load.

---

## Summary Benefits by SIEM Category

| Category | Primary benefiting upgrades |
|---|---|
| **Security posture** | Node 20, Angular 17, Spring Boot 3.3, Java 17, Bootstrap 5 |
| **Analyst productivity** | Angular 17 (faster UI), ECharts 5 (faster charts), Virtual threads |
| **Scalability** | Virtual threads (Boot 3.2), Hibernate 6 (better queries), Angular Ivy |
| **Reliability** | Hibernate 6 correctness, RxJS 7 subscription management |
| **Compliance/auditability** | Spring Boot 3.3 (user-auditor), Java 17, ESLint |
| **Developer velocity** | Angular 17 DX, TypeScript 5, Node 20, ESLint |
| **Maintainability** | Angular 17, ESLint, Java 17 unified version, Bootstrap 5 no-jQuery |
| **Observability** | Spring Boot 3.2+ OpenTelemetry auto-instrumentation |
| **Branding** | Bootstrap 5 CSS custom properties, Angular Ivy tree-shaking |
