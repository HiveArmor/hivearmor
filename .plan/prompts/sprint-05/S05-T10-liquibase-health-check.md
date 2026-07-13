# S05-T10: Liquibase Migration Health Check for Index Pattern Correctness

**Sprint:** 5 (Reliability + Performance)
**Severity:** Medium
**Issue ID:** FLOW-10
**Dependencies:** None
**Estimated time:** 2–3 hours

---

## Context

Liquibase changeset `20241227001` (in `20241227001_updating-system-index-pattern.xml`) migrates all system index patterns from bare names (`log-*`, `alert-*`, etc.) to `v11-` prefixed names (`v11-log-*`, `v11-alert-*`, etc.) in the `utm_index_pattern` table. If this migration was not applied — for example, on a fresh install that ran an older changelog, or after a Liquibase lock was force-cleared before the migration ran — the backend will silently query OpenSearch using the old index patterns and return zero results with no error. Analysts will see empty dashboards with no indication of the underlying cause.

There is a known Liquibase complication: the changeset ID `20241227001` is duplicated between two files (`20241227001_updating-system-index-pattern.xml` and `20241227002_updating-menu-index-pattern.xml` both declare `id="20241227001"`). This means Liquibase may record the first file as applied and silently skip the second, or fail with a checksum error, depending on the execution order and database state.

The startup chain (`ApplicationStartProcessor.java`) already performs database connectivity and Elasticsearch connectivity checks before the Spring context loads. This is the correct place to add a migration health check that asserts the `v11-` prefix migration was applied, so the system fails fast with a clear error message rather than starting up silently broken.

---

## What to Read First

1. `/Users/encryptshell/GIT/UTMStack-11/backend/src/main/resources/config/liquibase/changelog/20241227001_updating-system-index-pattern.xml` — the migration that prefixes system index patterns with `v11-`.
2. `/Users/encryptshell/GIT/UTMStack-11/backend/src/main/resources/config/liquibase/changelog/20241227002_updating-menu-index-pattern.xml` — note this file's `changeSet id` is also `"20241227001"` — the duplicate ID bug.
3. `/Users/encryptshell/GIT/UTMStack-11/backend/src/main/java/com/nilachakra/ApplicationStartProcessor.java` — the `EnvironmentPostProcessor` that runs startup checks. Understand its structure and the `databaseConnectionCheck()` call that provides a raw `java.sql.Connection`.
4. `/Users/encryptshell/GIT/UTMStack-11/backend/src/main/java/com/nilachakra/checks/LiquibaseLockedCheck.java` — existing Liquibase check; use as a pattern for the new check.
5. `/Users/encryptshell/GIT/UTMStack-11/backend/src/main/java/com/nilachakra/checks/DatabaseConnectionCheck.java` — to understand the return type passed to the new check.
6. `/Users/encryptshell/GIT/UTMStack-11/backend/src/main/resources/config/application-prod.yml` — datasource config (relevant for understanding available connection details).

---

## Implementation Steps

### Step 1 — Fix the duplicate changeset ID

The root cause of potential migration skips must be fixed first.

**File:** `backend/src/main/resources/config/liquibase/changelog/20241227002_updating-menu-index-pattern.xml`

Change the `id` attribute from `"20241227001"` to `"20241227002"` (matching its filename):

```xml
<!-- Before: -->
<changeSet id="20241227001" author="Manuel">

<!-- After: -->
<changeSet id="20241227002" author="Manuel">
```

**Warning:** If this changelog has already been applied in any environment, changing the `id` will cause Liquibase to see the renamed changeset as new and attempt to re-run it. Check the `databasechangelog` table before deploying:

```sql
SELECT id, filename, exectype FROM databasechangelog
WHERE filename LIKE '%20241227%';
```

If both `20241227001` rows exist, rename only the second and update the `databasechangelog` row accordingly (or add `runOnChange: false` with a precondition).

### Step 2 — Create MigrationIndexPatternCheck.java

Create a new check class alongside the existing checks:

**File:** `backend/src/main/java/com/nilachakra/checks/MigrationIndexPatternCheck.java`

```java
package com.nilachakra.checks;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

/**
 * Verifies that Liquibase migration 20241227001 has been applied by
 * asserting that all system index patterns carry the "v11-" prefix.
 *
 * If any system pattern is found WITHOUT the prefix (e.g. "log-syslog-*"),
 * the system will return zero results from OpenSearch without error —
 * a silent data failure. Fail fast here instead.
 */
public class MigrationIndexPatternCheck {

    private static final Logger log = LoggerFactory.getLogger(MigrationIndexPatternCheck.class);

    /**
     * @param connection an open database connection (not closed by this method)
     * @throws IllegalStateException if the v11- migration has not been applied
     */
    public static void check(Connection connection) {
        log.info("Checking Liquibase migration 20241227001 (v11- index pattern prefix)...");

        // Count system patterns that do NOT start with "v11-"
        String sql = "SELECT COUNT(*) FROM utm_index_pattern " +
                     "WHERE pattern_system = true AND pattern NOT LIKE 'v11-%'";

        try (PreparedStatement ps = connection.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            if (rs.next()) {
                int unprefixedCount = rs.getInt(1);
                if (unprefixedCount > 0) {
                    String msg = String.format(
                        "Migration check FAILED: %d system index pattern(s) are missing the 'v11-' prefix. " +
                        "Liquibase migration 20241227001 (20241227001_updating-system-index-pattern.xml) " +
                        "may not have been applied. " +
                        "Run: SELECT pattern FROM utm_index_pattern WHERE pattern_system=true AND pattern NOT LIKE 'v11-%%'; " +
                        "to see the affected rows. Apply the migration manually or re-run Liquibase before starting the backend.",
                        unprefixedCount
                    );
                    log.error(msg);
                    throw new IllegalStateException(msg);
                }
            }
        } catch (SQLException e) {
            // utm_index_pattern table might not exist on a brand-new DB before
            // Liquibase runs. Allow startup to proceed — Liquibase will create it.
            if (isTableNotFoundError(e)) {
                log.warn("utm_index_pattern table not found — assuming fresh install, skipping migration check.");
                return;
            }
            throw new IllegalStateException("Failed to execute migration check query: " + e.getMessage(), e);
        }

        log.info("Migration check passed: all system index patterns carry the 'v11-' prefix.");
    }

    private static boolean isTableNotFoundError(SQLException e) {
        // PostgreSQL error code 42P01 = undefined_table
        return "42P01".equals(e.getSQLState());
    }
}
```

### Step 3 — Wire the check into ApplicationStartProcessor

**File:** `backend/src/main/java/com/nilachakra/ApplicationStartProcessor.java`

Add the migration check call after `liquibaseLockedCheck` and before the Elasticsearch check:

```java
@Override
public void postProcessEnvironment(ConfigurableEnvironment environment,
                                   SpringApplication application) {
    environmentVariablesCheck();
    Connection con = databaseConnectionCheck();
    liquibaseLockedCheck(con);
    MigrationIndexPatternCheck.check(con);  // <-- add this line
    elasticsearchConnectionCheck();
}
```

The check uses the same raw `java.sql.Connection` already obtained by `databaseConnectionCheck()`. Any `IllegalStateException` thrown by `check()` will propagate up through `postProcessEnvironment`, causing `ApplicationStartProcessor` to call `System.exit(1)` (or whatever error handling is already in place).

### Step 4 — Add a migration status endpoint (operational visibility)

Expose the check through the existing `/api/healthcheck` endpoint so operators can query it without restarting:

**File:** `backend/src/main/java/com/nilachakra/service/UtmStackService.java` (or wherever `executeChecks` is defined).

Add a method:

```java
public Map<String, Object> getMigrationStatus(DataSource dataSource) {
    Map<String, Object> result = new LinkedHashMap<>();
    try (Connection con = dataSource.getConnection();
         PreparedStatement ps = con.prepareStatement(
             "SELECT pattern FROM utm_index_pattern " +
             "WHERE pattern_system = true AND pattern NOT LIKE 'v11-%'");
         ResultSet rs = ps.executeQuery()) {
        List<String> unprefixed = new ArrayList<>();
        while (rs.next()) {
            unprefixed.add(rs.getString("pattern"));
        }
        result.put("migration_20241227001_applied", unprefixed.isEmpty());
        if (!unprefixed.isEmpty()) {
            result.put("unprefixed_patterns", unprefixed);
            result.put("remediation",
                "Apply Liquibase migration 20241227001_updating-system-index-pattern.xml");
        }
    } catch (SQLException e) {
        result.put("error", e.getMessage());
    }
    return result;
}
```

Include the output in the `/api/healthcheck` response.

---

## Test Commands

```bash
# Build
cd /Users/encryptshell/GIT/UTMStack-11/backend
./mvnw compile

# Unit tests
./mvnw test -Dtest=MigrationIndexPatternCheckTest

# Full suite
./mvnw test

# Integration test: simulate missing migration
# 1. Start local-dev PostgreSQL
# 2. INSERT a system pattern without the prefix:
#    INSERT INTO utm_index_pattern (id, pattern, pattern_system) VALUES (9999, 'log-test-*', true);
# 3. Start the backend — it must exit with a clear error message.
# 4. Clean up: DELETE FROM utm_index_pattern WHERE id=9999;
# 5. Start the backend — it must start successfully.
```

Write this unit test in `backend/src/test/java/com/nilachakra/checks/MigrationIndexPatternCheckTest.java`:

```java
@ExtendWith(MockitoExtension.class)
class MigrationIndexPatternCheckTest {

    @Test
    void check_passesWhenAllPatternsHaveV11Prefix() throws SQLException {
        Connection con = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);

        when(con.prepareStatement(anyString())).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true);
        when(rs.getInt(1)).thenReturn(0); // zero unprefixed patterns

        assertDoesNotThrow(() -> MigrationIndexPatternCheck.check(con));
    }

    @Test
    void check_throwsWhenUnprefixedPatternsExist() throws SQLException {
        Connection con = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);

        when(con.prepareStatement(anyString())).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true);
        when(rs.getInt(1)).thenReturn(3); // 3 unprefixed patterns

        IllegalStateException ex = assertThrows(IllegalStateException.class,
            () -> MigrationIndexPatternCheck.check(con));
        assertThat(ex.getMessage()).contains("20241227001");
        assertThat(ex.getMessage()).contains("v11-");
    }

    @Test
    void check_allowsStartupWhenTableDoesNotExist() throws SQLException {
        Connection con = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        SQLException tableNotFound = new SQLException("table not found", "42P01");

        when(con.prepareStatement(anyString())).thenReturn(ps);
        when(ps.executeQuery()).thenThrow(tableNotFound);

        // Must not throw — fresh install scenario
        assertDoesNotThrow(() -> MigrationIndexPatternCheck.check(con));
    }
}
```

---

## Acceptance Criteria

- [ ] The duplicate `changeSet id="20241227001"` in `20241227002_updating-menu-index-pattern.xml` is changed to `"20241227002"`.
- [ ] `MigrationIndexPatternCheck.check(Connection)` throws `IllegalStateException` with a message referencing migration `20241227001` and the `v11-` prefix when any system pattern is missing the prefix.
- [ ] `MigrationIndexPatternCheck.check(Connection)` does not throw when all system patterns carry `v11-`.
- [ ] The check is invoked in `ApplicationStartProcessor.postProcessEnvironment` before Elasticsearch connectivity is tested.
- [ ] The backend process exits with a non-zero code and logs a clear error message when started against a database where the migration was not applied.
- [ ] The check is silently skipped (no exception) when the `utm_index_pattern` table does not exist (fresh install / pre-Liquibase state).
- [ ] `/api/healthcheck` response includes migration status.
- [ ] All unit tests pass (`./mvnw test` green).
