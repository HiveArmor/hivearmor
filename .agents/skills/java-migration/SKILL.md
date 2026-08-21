---
name: java-migration
description: Java version migration — upgrade path 8→11→17→21→25, breaking changes by version, Spring Boot 3.x javax→jakarta, OpenRewrite automation. Triggered by "upgrade to Java 21", "migrate from Java 8", "Java migration".
---

# Java Migration Skill

Upgrade Java version safely with minimal disruption.

## Migration Path

Always follow LTS-to-LTS upgrades:
```
Java 8 → Java 11 → Java 17 → Java 21 → Java 25 (LTS)
```

HiveArmor backend: Spring Boot 3.3 requires **Java 17 minimum**, supports 17/21/25.

---

## Breaking Changes by Version

### Java 8 → 11
- `javax.xml.bind` (JAXB), `javax.xml.ws` (JAX-WS), `javax.annotation` → removed from JDK
  - Fix: add explicit Maven dependencies
- Module system (JPMS) — `--illegal-access=deny` by default
  - Fix: add `--add-opens` flags or modularize

### Java 11 → 17
- Strong encapsulation enforced — reflection into private JDK fields blocked
  - Fix: `--add-opens java.base/java.lang=ALL-UNNAMED` where needed
- Sealed classes finalized

### Java 17 → 21
- `finalize()` deprecated for removal — avoid relying on finalizers
- UTF-8 is now the default charset — explicit charset args no longer needed
- Records, sealed classes, pattern matching all stable

### Java 21 → 25
- Security Manager removed (`-Djava.security.manager` no longer works)
- `sun.misc.Unsafe` memory access methods removed (use VarHandle instead)
- 32-bit x86 platforms dropped
- Virtual threads stable + synchronization pinning resolved

---

## Migration Workflow

### Step 1 — Assess Current State
```bash
cd backend

# Check current Java version
java -version
mvn -s settings.xml --version

# Find deprecated API usage
mvn -s settings.xml compile -Xlint:deprecation 2>&1 | grep "warning\|deprecated"

# Find reflection/unsafe usage that may break
grep -rn "setAccessible(true)\|getDeclaredField\|sun\.misc\.Unsafe\|finalize()" \
  src/main/java/ | grep -v test
```

### Step 2 — Update Build Configuration
```xml
<!-- pom.xml -->
<properties>
    <java.version>21</java.version>
    <maven.compiler.source>21</maven.compiler.source>
    <maven.compiler.target>21</maven.compiler.target>
</properties>

<!-- OR use spring-boot-starter-parent which sets these via properties -->
```

### Step 3 — Spring Boot 3.x — javax → jakarta Migration
```bash
# Find all javax.* imports (must become jakarta.*)
grep -rn "import javax\." src/main/java/ | grep -v "javax.sql\|javax.crypto\|javax.net\|javax.security"
# javax.sql, javax.crypto, javax.net.ssl, javax.security.* stay as javax (JDK-owned)
# Everything else moves to jakarta.*
```

```java
// ❌ Spring Boot 2.x
import javax.persistence.Entity;
import javax.validation.constraints.NotNull;
import javax.servlet.http.HttpServletRequest;

// ✅ Spring Boot 3.x
import jakarta.persistence.Entity;
import jakarta.validation.constraints.NotNull;
import jakarta.servlet.http.HttpServletRequest;
```

### Step 4 — OpenRewrite Automation
```bash
# Add to pom.xml plugins section, then run:
mvn -s settings.xml -U org.openrewrite.maven:rewrite-maven-plugin:run \
  -Drewrite.activeRecipes=org.openrewrite.java.migrate.UpgradeToJava21
  
# For javax → jakarta migration (Spring Boot 3.x)
mvn -s settings.xml -U org.openrewrite.maven:rewrite-maven-plugin:run \
  -Drewrite.activeRecipes=org.openrewrite.java.spring.boot3.UpgradeSpringBoot_3_3
```

### Step 5 — Run Tests
```bash
mvn -s settings.xml test 2>&1 | grep -E "FAIL|ERROR|Tests run"
```

### Step 6 — Fix Runtime Warnings
```bash
# Run the app, look for illegal access warnings
mvn -s settings.xml spring-boot:run 2>&1 | grep -i "WARNING\|illegal\|reflect"
```

---

## Modern Java Patterns to Adopt on Migration

### Records (Java 16+) — immutable DTOs
```java
// ❌ Verbose POJO DTO
public class AlertDTO {
    private Long id;
    private Severity severity;
    // getters, setters, equals, hashCode, toString...
}

// ✅ Record — all of the above in one line
public record AlertDTO(Long id, Severity severity, String source) {}
```

### Sealed Classes (Java 17+) — exhaustive type hierarchies
```java
public sealed interface AlertEvent
    permits AlertCreated, AlertStatusChanged, AlertSuppressed {}

// Switch expression is exhaustive — no default needed
String description = switch (event) {
    case AlertCreated e    -> "Created: " + e.alertId();
    case AlertStatusChanged e -> "Status → " + e.newStatus();
    case AlertSuppressed e    -> "Suppressed by rule: " + e.ruleId();
};
```

### Text Blocks (Java 15+) — multi-line strings
```java
// For OpenSearch query templates
String query = """
    {
      "query": {
        "bool": {
          "filter": [
            { "term": { "severity.keyword": "%s" } }
          ]
        }
      }
    }
    """.formatted(severity);
```

### Virtual Threads (Java 21+) — for I/O-bound operations
```java
// Spring Boot 3.2+ — enable virtual threads globally
# application.yml
spring:
  threads:
    virtual:
      enabled: true
```

---

## Compatibility Matrix (HiveArmor)

| Component | Min Java | Max Java | Notes |
|---|---|---|---|
| Spring Boot 3.3 | 17 | 25 | Oracle free support until Sep 2033 (Java 25) |
| Mockito 5+ | 11 | 25 | |
| JUnit 5.10+ | 11 | 25 | |
| Liquibase 4.x | 11 | 21 | |
| Hibernate 6.x | 17 | 21 | Part of Spring Boot 3.x |
