# 05 — Required Code Changes

> Concrete file changes, patterns to update, and deprecated APIs for each migration step. No changes should be made until the corresponding migration phase is approved.

---

## Phase 1: node-sass → sass (dart-sass)

### Files to change
```
frontend/package.json
frontend/angular.json          (if any sass-specific config references node-sass binary)
```

### Code changes
```json
// package.json — remove and add
"node-sass": "^4.0.0"            // REMOVE
"sass": "^1.77.0"                // ADD
```

### Build verification
```bash
cd frontend
npm uninstall node-sass
npm install sass@^1.77.0
NODE_OPTIONS=--max_old_space_size=8192 npm run build
```

### SCSS compatibility notes
- Existing `@import` in `_tokens.scss` and component `.scss` files will still compile in dart-sass (deprecated but not removed in sass@1.x)
- Deprecation warnings will appear for `@import` — do not fix them during this phase; they are cosmetic only
- `node-sass`-specific filter functions (if any) must be replaced with dart-sass equivalents

---

## Phase 2: Node.js 14 → 20 LTS

### Files to change
```
.github/workflows/reusable-node.yml      (node-version: '20')
local-dev/docker-compose.yml             (no direct reference; build system change)
AGENTS.md                                (update prerequisite documentation)
```

### Code changes
```yaml
# reusable-node.yml
- uses: actions/setup-node@v4
  with:
    node-version: '20'          # was 14.16.1 or equivalent
```

### npm compatibility check
Run after switching Node: `npm install` and verify all packages install cleanly. Expect warnings for old packages but no blocking errors (sass@1 is the key blocker now resolved in Phase 1).

---

## Phase 3: TSLint → ESLint

### Files to change
```
frontend/package.json          (remove tslint, codelyzer; add ESLint packages)
frontend/tslint.json           (delete)
frontend/.eslintrc.json        (create)
frontend/.eslintignore         (create)
frontend/angular.json          (update lint builder)
```

### New packages (add to devDependencies)
```json
"@angular-eslint/builder": "^17.x",
"@angular-eslint/eslint-plugin": "^17.x",
"@angular-eslint/eslint-plugin-template": "^17.x",
"@angular-eslint/schematics": "^17.x",
"@typescript-eslint/eslint-plugin": "^7.x",
"@typescript-eslint/parser": "^7.x",
"eslint": "^8.x"
```

### Remove packages
```
tslint, codelyzer
```

### angular.json change
```json
// angular.json — replace tslint builder with eslint builder
"lint": {
  "builder": "@angular-eslint/builder:lint",
  "options": {
    "lintFilePatterns": ["src/**/*.ts", "src/**/*.html"]
  }
}
```

---

## Phase 4: Java 17 + Spring Boot 3.3 (user-auditor, web-pdf)

### user-auditor: all Java files
```java
// BEFORE (javax namespace)
import javax.persistence.*;
import javax.validation.constraints.*;

// AFTER (jakarta namespace)  
import jakarta.persistence.*;
import jakarta.validation.constraints.*;
```

### user-auditor/pom.xml
```xml
<!-- Change parent version -->
<version>3.3.2</version>   <!-- was 2.7.14 -->

<!-- Change Java version -->
<java.version>17</java.version>   <!-- was 11 -->
```

### web-pdf/pom.xml
```xml
<!-- Same Spring Boot version change -->
<!-- Same Java version change -->

<!-- Selenium upgrade -->
<groupId>org.seleniumhq.selenium</groupId>
<artifactId>selenium-java</artifactId>
<version>4.20.0</version>   <!-- was 4.5.0 -->
```

### web-pdf: update javax imports in all Java source files (same pattern as user-auditor)

### Affected Java source directories
```
user-auditor/src/main/java/**/*.java     (all files with javax.* imports)
web-pdf/src/main/java/**/*.java          (all files with javax.* imports)
```

---

## Phase 5: Angular 7 → 17 (incremental steps)

### Step 5a: Angular 7 → 12

Run Angular CLI migration schematics:
```bash
npx @angular/cli@12 update @angular/core@12 @angular/cli@12
```

**Code patterns to update:**
```typescript
// Lazy loading — BEFORE (string syntax, deprecated in v12)
{ loadChildren: './feature/feature.module#FeatureModule' }

// AFTER (function syntax — migration schematic handles this)
{ loadChildren: () => import('./feature/feature.module').then(m => m.FeatureModule) }
```

### Step 5b: Angular 12 → 16

```bash
npx @angular/cli@16 update @angular/core@16 @angular/cli@16
```

**TypeScript strict mode:**
```typescript
// Typed forms (introduced in v14 — optional initially)
// formControl: FormControl<string>  instead of FormControl
```

### Step 5c: Angular 16 → 17

```bash
npx @angular/cli@17 update @angular/core@17 @angular/cli@17
```

### RxJS 6 → 7 changes (required for Angular 17)
```typescript
// BEFORE
import { Observable } from 'rxjs';
this.service.getData().toPromise().then(...)

// AFTER  
import { firstValueFrom } from 'rxjs';
firstValueFrom(this.service.getData()).then(...)
```

```typescript
// BEFORE
import { from } from 'rxjs/internal/observable/from';

// AFTER — pipe-only imports, no internal paths
import { from } from 'rxjs';
```

### ng-bootstrap upgrade (4 → 14)
```typescript
// Modal: service injection pattern changes
// NgbModal.open() options change — check ng-bootstrap 14 changelog
// Tooltip/popover container attribute may need updates
```

### Files likely to need manual changes
```
frontend/src/app/app-routing.module.ts          (lazy loading syntax)
frontend/src/app/core/auth/user-route-access-service.ts    (guard pattern)
frontend/src/app/blocks/interceptor/auth.interceptor.ts    (HttpInterceptor interface)
frontend/src/app/shared/components/**/*.ts       (ViewChild static flags)
frontend/src/app/**/*.module.ts                  (remove deprecated entryComponents)
```

---

## Phase 6: Spring Boot 3.1.5 → 3.3.x (backend)

### SecurityConfiguration.java — FULL REWRITE REQUIRED

```java
// BEFORE — DEPRECATED/REMOVED in Spring Boot 3.x
@Configuration
public class SecurityConfiguration extends WebSecurityConfigurerAdapter {
    @Override
    public void configure(HttpSecurity http) throws Exception { ... }
}

// AFTER — SecurityFilterChain bean pattern
@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true, securedEnabled = true)
public class SecurityConfiguration {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(session -> session.sessionCreationPolicy(STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/authenticate").permitAll()
                // ... all existing rules migrated
            )
            .saml2Login(saml -> saml
                .successHandler(saml2LoginSuccessHandler)
                .failureHandler(saml2LoginFailureHandler)
            );
        return http.build();
    }

    @Bean
    public WebSecurityCustomizer webSecurityCustomizer() {
        return web -> web.ignoring()
            .requestMatchers(HttpMethod.OPTIONS, "/**")
            .requestMatchers("/swagger-ui/**");
    }
}
```

### @EnableGlobalMethodSecurity replacement
```java
// BEFORE
@EnableGlobalMethodSecurity(prePostEnabled = true, securedEnabled = true)

// AFTER
@EnableMethodSecurity(prePostEnabled = true, securedEnabled = true)
```

### javax → jakarta (backend)
```java
// Same javax.* → jakarta.* migration as user-auditor
// Affects: @PostConstruct, @PreDestroy, @RequestMapping (via Servlet API), JPA annotations
```

### backend/pom.xml
```xml
<spring-boot.version>3.3.2</spring-boot.version>
```

### Springdoc: artifact rename
```xml
<!-- BEFORE -->
<groupId>org.springdoc</groupId>
<artifactId>springdoc-openapi-ui</artifactId>
<version>1.6.15</version>

<!-- AFTER -->
<groupId>org.springdoc</groupId>
<artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
<version>2.5.0</version>
```

### Config annotation changes in application.yml
```yaml
# Spring Boot 3.x removes spring.jpa.database-platform FixedPostgreSQL10Dialect
# Replace with standard PostgreSQL dialect
spring:
  jpa:
    database-platform: org.hibernate.dialect.PostgreSQLDialect
```

---

## Phase 7: Hibernate 5.4.32 → 6.4.x

### pom.xml
```xml
<!-- REMOVE this pin — let Spring Boot 3.1 manage Hibernate 6 -->
<hibernate.version>5.4.32.Final</hibernate.version>  <!-- DELETE THIS LINE -->
```

### JPQL patterns requiring update
```java
// BEFORE — Hibernate 5 allowed implicit FROM
Query q = em.createQuery("from UtmAlert where status = :s");

// AFTER — Hibernate 6 requires explicit SELECT
Query q = em.createQuery("select a from UtmAlert a where a.status = :s");
```

### Remove elasticsearch-rest-high-level-client
```xml
<!-- REMOVE from pom.xml -->
<dependency>
    <groupId>org.elasticsearch.client</groupId>
    <artifactId>elasticsearch-rest-high-level-client</artifactId>
    <version>7.12.1</version>
</dependency>
```

Search for remaining usages:
```bash
grep -r "org.elasticsearch.client" backend/src/main/java/
```

---

## Phase 8: Go Module Updates (minor)

No breaking code changes expected for minor version bumps. Update go.mod files:
```bash
# In each Go module directory
go get github.com/google/uuid@latest
go get google.golang.org/grpc@v1.67.0
go mod tidy
```

---

## Phase 9: ECharts 4 → 5 + ngx-echarts

### package.json
```json
"echarts": "^5.5.0",
"echarts-gl": "^2.0.9",
"echarts-wordcloud": "^2.1.0",
"ngx-echarts": "^18.0.0"
```

### Chart option changes (examples)
```typescript
// ECharts 5: visualMap uses 'continuous' instead of 'continuous' (same name, but property changes)
// Tooltip formatter: return type changes from string to string|HTMLElement

// Series type 'bar3D' (echarts-gl) may have API changes — check each component
```

---

## Phase 10: Bootstrap 4 → 5

### package.json
```json
"bootstrap": "^5.3.3",
"@ng-bootstrap/ng-bootstrap": "^16.x"
// REMOVE: "jquery", "jquery-ui", "tether", "popper.js"
```

### HTML class renames (bulk find/replace)
```
ml-*    → ms-*
mr-*    → me-*
pl-*    → ps-*
pr-*    → pe-*
form-group    → mb-3  (or remove)
data-toggle   → data-bs-toggle
data-dismiss  → data-bs-dismiss
data-target   → data-bs-target
```

### angular.json scripts: remove jQuery
```json
// REMOVE from scripts array:
"node_modules/jquery/dist/jquery.min.js",
"node_modules/tether/dist/js/tether.min.js",
"node_modules/popper.js/dist/popper.js",
"node_modules/bootstrap/dist/js/bootstrap.min.js"
```

---

## Summary: Files Most Likely to Change

| File | Phases | Reason |
|---|---|---|
| `backend/src/main/java/com/park/utmstack/config/SecurityConfiguration.java` | 6 | WebSecurityConfigurerAdapter removal |
| `backend/pom.xml` | 6, 7 | Spring Boot + Hibernate version changes |
| `frontend/package.json` | 1, 2, 3, 5, 9, 10 | All package changes |
| `frontend/angular.json` | 3, 5, 10 | Lint builder, scripts |
| `frontend/src/app/app-routing.module.ts` | 5 | Lazy loading syntax |
| `frontend/src/app/core/auth/user-route-access-service.ts` | 5 | Guard pattern |
| `frontend/src/app/blocks/interceptor/auth.interceptor.ts` | 5 | Interceptor API |
| All `*.module.ts` files | 5 | `entryComponents` removal |
| `user-auditor/pom.xml` | 4 | Spring Boot + Java version |
| `web-pdf/pom.xml` | 4 | Spring Boot + Java version |
| All `user-auditor/src/**/*.java` | 4 | javax→jakarta |
| All `web-pdf/src/**/*.java` | 4 | javax→jakarta |
| All `backend/src/main/java/**/*.java` | 6 | javax→jakarta |
| `.github/workflows/reusable-node.yml` | 2 | Node version |
