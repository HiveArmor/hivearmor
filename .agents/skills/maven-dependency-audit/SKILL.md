---
name: maven-dependency-audit
description: Maven dependency audit — find outdated deps, version conflicts, CVEs via OWASP plugin, unused dependencies. Triggered by "check dependencies", "audit deps", "outdated libraries", "security vulnerabilities in deps".
---

# Maven Dependency Audit Skill

Audit HiveArmor backend dependencies for security, freshness, and conflicts.

## Step 1 — Find Outdated Dependencies

```bash
cd backend

# List available updates
mvn -s settings.xml versions:display-dependency-updates 2>&1 | \
  grep -E "^\[INFO\].*->|available"

# List available plugin updates
mvn -s settings.xml versions:display-plugin-updates 2>&1 | \
  grep -E "^\[INFO\].*->"
```

### Update Strategy

| Change type | Action |
|---|---|
| **Patch** (1.2.3 → 1.2.4) | Update freely — bug fixes and security patches only |
| **Minor** (1.2.x → 1.3.0) | Update with basic test run — API-compatible by SemVer |
| **Major** (1.x → 2.0) | Dedicated migration — read changelog, check breaking changes |
| **Spring Boot major** | Full migration plan — see `java-migration` skill |

---

## Step 2 — Dependency Tree & Conflicts

```bash
# Full dependency tree
mvn -s settings.xml dependency:tree 2>&1 | less

# Find version conflicts (look for "omitted for conflict")
mvn -s settings.xml dependency:tree 2>&1 | grep "omitted for conflict"

# Find where a specific artifact comes from
mvn -s settings.xml dependency:tree -Dincludes=com.fasterxml.jackson.core:jackson-databind

# Check for unused declared / used undeclared
mvn -s settings.xml dependency:analyze 2>&1 | grep -A5 "Unused\|Undeclared"
```

### Fix Version Conflicts

```xml
<!-- In pom.xml — use dependencyManagement to pin transitive versions -->
<dependencyManagement>
    <dependencies>
        <!-- Force specific version across all transitive deps -->
        <dependency>
            <groupId>com.fasterxml.jackson.core</groupId>
            <artifactId>jackson-databind</artifactId>
            <version>2.17.2</version>
        </dependency>
    </dependencies>
</dependencyManagement>
```

### Remove Unwanted Transitive Deps

```xml
<dependency>
    <groupId>some.library</groupId>
    <artifactId>with-unwanted-transitive</artifactId>
    <exclusions>
        <exclusion>
            <groupId>log4j</groupId>
            <artifactId>log4j</artifactId>
        </exclusion>
    </exclusions>
</dependency>
```

---

## Step 3 — Security Scan (OWASP)

```bash
# Add to pom.xml build/plugins if not present:
# <plugin>
#   <groupId>org.owasp</groupId>
#   <artifactId>dependency-check-maven</artifactId>
#   <version>10.0.4</version>
# </plugin>

# Run security scan
mvn -s settings.xml org.owasp:dependency-check-maven:check \
  -DfailBuildOnCVSS=7 \
  -DsuppressionFile=.owasp-suppressions.xml 2>&1 | \
  grep -E "CVE-|CVSS|CRITICAL|HIGH"

# Output report location
# target/dependency-check-report.html
```

### CVSS Severity Action

| CVSS Score | Severity | Action |
|---|---|---|
| 9.0–10.0 | Critical | Fix immediately, block release |
| 7.0–8.9 | High | Fix before next release |
| 4.0–6.9 | Medium | Fix within 2 sprints |
| 0.1–3.9 | Low | Fix at convenience |

### Suppression File (for false positives)

```xml
<!-- .owasp-suppressions.xml -->
<suppressions>
    <suppress>
        <notes>False positive — this CVE affects a different module</notes>
        <cve>CVE-2024-XXXXX</cve>
        <packageUrl regex="true">^pkg:maven/com\.example/not-affected.*$</packageUrl>
    </suppress>
</suppressions>
```

---

## Step 4 — Audit Report Template

```markdown
## Dependency Audit — [date]

### Critical CVEs (fix before release)
| Dependency | Version | CVE | CVSS | Fix version |
|---|---|---|---|---|
| jackson-databind | 2.14.0 | CVE-2024-XXXX | 9.8 | 2.17.2 |

### Outdated — Major version gaps
| Dependency | Current | Latest | Notes |
|---|---|---|---|
| spring-boot | 3.2.0 | 3.3.5 | Minor update — safe |

### Version Conflicts
| Artifact | Resolved | Requested by |
|---|---|---|
| guava | 32.0 | both 31.0 and 33.0 requested |

### Unused Dependencies (review for removal)
| Artifact | Notes |
|---|---|
| commons-lang3 | No usages found — safe to remove |

### Recommendations
1. [Priority] Fix CVE-XXXX in jackson-databind → update to 2.17.2
2. [Medium] Update Spring Boot from 3.2.0 → 3.3.5
3. [Low] Remove unused commons-lang3
```

---

## CI Integration (GitHub Actions)

```yaml
# In deployment-pipeline.yml
- name: OWASP Dependency Check
  run: |
    cd backend
    mvn -s settings.xml org.owasp:dependency-check-maven:check \
      -DfailBuildOnCVSS=7 \
      -DsuppressionFile=.owasp-suppressions.xml \
      -B --no-transfer-progress
  env:
    MAVEN_TK: ${{ secrets.MAVEN_TK }}
```

---

## Key HiveArmor Dependencies to Monitor

```bash
# Spring Boot — security patches are frequent
mvn -s settings.xml versions:display-dependency-updates -Dincludes=org.springframework.boot:

# Jackson — high-frequency CVE target
mvn -s settings.xml versions:display-dependency-updates -Dincludes=com.fasterxml.jackson:

# Netty (used by gRPC) — remote code execution CVEs appear regularly
mvn -s settings.xml versions:display-dependency-updates -Dincludes=io.netty:

# Liquibase — schema migration tool, update carefully
mvn -s settings.xml versions:display-dependency-updates -Dincludes=org.liquibase:
```
