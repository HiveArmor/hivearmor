# S04-T06 — Upgrade user-auditor from Java 11 → Java 17

**Sprint:** 4 (Active Directory + Compliance)  
**Severity:** MEDIUM — Technical debt, Spring Boot 2.7 EOL  
**Issue ID:** DEBT (from audit)  
**Dependencies:** S04-T01 (AD page must work before upgrading the service it depends on)  
**Estimated time:** 4 hours

---

## Context

The `user-auditor` microservice runs Java 11 and Spring Boot 2.7, both of which are EOL. The main backend is on Java 17 and Spring Boot 3.3. The `javax.*` → `jakarta.*` migration is the key breaking change in Spring Boot 3.

**Service location:** `user-auditor/`

---

## What to Read First

1. `user-auditor/pom.xml` — current Java version, Spring Boot version, all dependencies
2. `user-auditor/src/main/java/` — scan for `import javax.*` statements
3. `user-auditor/Dockerfile` — current base image
4. `local-dev/docker-compose.yml` — user-auditor service definition
5. The main backend's `pom.xml` — as a reference for the target dependency versions

---

## Implementation Steps

### Step 1: Update `user-auditor/pom.xml`

```xml
<!-- Java version -->
<properties>
    <java.version>17</java.version>
    <spring-boot.version>3.3.1</spring-boot.version>  <!-- match main backend -->
</properties>

<!-- Spring Boot parent -->
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.1</version>
</parent>
```

### Step 2: Migrate `javax.*` to `jakarta.*`

Run this to find all files needing migration:
```bash
grep -rl "import javax\." user-auditor/src/main/java/ --include="*.java"
```

For each file, replace:
```java
// BEFORE:
import javax.persistence.*;
import javax.validation.*;
import javax.servlet.*;
import javax.transaction.*;

// AFTER:
import jakarta.persistence.*;
import jakarta.validation.*;
import jakarta.servlet.*;
import jakarta.transaction.*;
```

### Step 3: Update deprecated Spring Security API

Spring Boot 3 removed `WebSecurityConfigurerAdapter`. If `user-auditor` uses it:

```java
// BEFORE:
@Configuration
public class SecurityConfig extends WebSecurityConfigurerAdapter {
    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http.authorizeRequests().anyRequest().authenticated();
    }
}

// AFTER:
@Configuration
public class SecurityConfig {
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(auth -> auth.anyRequest().authenticated());
        return http.build();
    }
}
```

### Step 4: Update the Dockerfile base image

In `user-auditor/Dockerfile`:
```dockerfile
# BEFORE:
FROM eclipse-temurin:11-jre-alpine

# AFTER:
FROM eclipse-temurin:17-jre-alpine
```

### Step 5: Build and run tests

```bash
cd user-auditor
./mvnw clean compile -q
./mvnw test
./mvnw package -DskipTests  # build the JAR
```

Fix any remaining compilation errors. Common issues:
- `org.hibernate.annotations.Type` changes in Hibernate 6
- Any `spring-data-jpa` API changes
- Any `@SpringBootTest` annotation changes

### Step 6: Integration test

After building, test the service works with the main backend:

```bash
# Start the upgraded user-auditor
./mvnw spring-boot:run &

# Test that the main backend can still proxy to it:
JWT=... # main backend JWT
curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/utm-auditor-users?page=0&size=5" | jq '.'
# Must return user data, not an error
```

### Step 7: Write a smoke test

Create: `user-auditor/src/test/java/com/nilachakra/userauditor/UpgradeSmokest.java`

```java
@SpringBootTest
class UpgradeSmokeTest {

    @Autowired ApplicationContext context;

    @Test
    void applicationContextLoads() {
        // Passes if Spring Boot starts without errors
        assertThat(context).isNotNull();
    }

    @Test
    void javaVersionIs17OrHigher() {
        int version = Runtime.version().feature();
        assertThat(version).isGreaterThanOrEqualTo(17);
    }
}
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/user-auditor

# Compile (must have zero errors):
./mvnw compile

# Run all tests:
./mvnw test

# Build Docker image:
docker build -t armorsight-user-auditor:17 .

# Verify Java 17 in image:
docker run --rm armorsight-user-auditor:17 java -version
# Expected: openjdk version "17.x.x"

# Run in docker-compose and verify AD page still works:
cd ../local-dev
docker-compose up user-auditor -d --no-deps
curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/utm-auditor-users?page=0&size=3" | jq '.'
```

---

## Acceptance Criteria

- [ ] `user-auditor/pom.xml` uses Java 17 and Spring Boot 3.3.x
- [ ] Zero `import javax.*` statements remain (all migrated to `jakarta.*`)
- [ ] `./mvnw compile` succeeds with zero errors
- [ ] `./mvnw test` passes
- [ ] Dockerfile uses `eclipse-temurin:17-jre-alpine`
- [ ] AD page (`/active-directory`) still loads correctly after the upgrade
- [ ] Smoke test passes
