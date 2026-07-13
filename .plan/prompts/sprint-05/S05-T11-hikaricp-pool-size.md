# S05-T11: Configure HikariCP Pool Size and Add Pool Monitoring

**Sprint:** 5 (Reliability + Performance)
**Severity:** Medium
**Issue ID:** DEBT-09
**Dependencies:** None
**Estimated time:** 1–2 hours

---

## Context

The backend's HikariCP connection pool is configured with only two settings: `poolName: Hikari` and `auto-commit: false`. No `maximumPoolSize` is set, so HikariCP falls back to its default of **10 connections**. Under normal operation this is fine. Under burst load — such as a mass-alert event that triggers dozens of concurrent API requests — the pool exhausts and subsequent requests block in the HikariCP wait queue. If the queue wait exceeds `connectionTimeout` (HikariCP default: 30 seconds), requests fail with `SQLTransientConnectionException: Connection is not available, request timed out after 30000ms`.

The fix is: set `maximumPoolSize=20`, add companion pool-health properties (`minimumIdle`, `connectionTimeout`, `maxLifetime`, `keepaliveTime`), and expose pool metrics via the existing Spring Actuator/Micrometer setup so operators can observe pool utilisation in real time.

The current config files:
- `application-prod.yml` — only sets `poolName` and `auto-commit`.
- `application-dev.yml` — same.
- `application.yml` — no datasource block at all.

---

## What to Read First

1. `/Users/encryptshell/GIT/UTMStack-11/backend/src/main/resources/config/application-prod.yml` — full content. The datasource block is sparse; you will add HikariCP properties here.
2. `/Users/encryptshell/GIT/UTMStack-11/backend/src/main/resources/config/application-dev.yml` — same datasource block; add matching (but smaller) pool settings here.
3. `/Users/encryptshell/GIT/UTMStack-11/backend/src/main/resources/config/application.yml` — Spring Actuator, JPA, and task-executor config. The Actuator is already exposed (`management.*` properties); confirm `hikaricp` metrics are enabled.
4. `/Users/encryptshell/GIT/UTMStack-11/backend/pom.xml` — confirm `micrometer-core` (or `spring-boot-starter-actuator`) is a dependency. HikariCP auto-registers metrics with Micrometer when it is on the classpath.

---

## Implementation Steps

### Step 1 — Add HikariCP settings to application-prod.yml

**File:** `backend/src/main/resources/config/application-prod.yml`

Replace the existing `hikari:` block:

```yaml
spring:
    datasource:
        type: com.zaxxer.hikari.HikariDataSource
        url: jdbc:postgresql://${DB_HOST}:${DB_PORT}/${DB_NAME}
        username: ${DB_USER}
        password: ${DB_PASS}
        hikari:
            poolName: ArmorSight-HikariCP
            auto-commit: false
            maximumPoolSize: 20
            minimumIdle: 5
            connectionTimeout: 30000       # ms — fail fast if no connection available in 30s
            idleTimeout: 600000            # ms — remove idle connections after 10min
            maxLifetime: 1800000           # ms — recycle connections after 30min (prevents stale connections)
            keepaliveTime: 60000           # ms — send keepalive to prevent firewall/proxy timeouts
            connectionTestQuery: SELECT 1  # validate connection before use (for PostgreSQL JDBC compat)
```

**Rationale for maximumPoolSize=20:**
- Each backend thread that touches the DB holds one connection.
- Spring's task executor (`spring.task.execution.pool.max-size: 1000` in application.yml) means the thread ceiling is high.
- Postgres max_connections is typically 100 by default; the backend should not consume more than 20% of that.
- 20 is a safe increase from 10. If profiling shows further contention, the value should be tuned based on observed pool wait metrics, not increased blindly.

### Step 2 — Add matching (smaller) settings to application-dev.yml

Development environments run the same schema with fewer concurrent users. Keep the pool smaller to avoid exhausting Postgres:

**File:** `backend/src/main/resources/config/application-dev.yml`

```yaml
    datasource:
        hikari:
            poolName: ArmorSight-HikariCP-dev
            auto-commit: false
            maximumPoolSize: 10       # smaller for dev
            minimumIdle: 2
            connectionTimeout: 30000
            idleTimeout: 600000
            maxLifetime: 1800000
            keepaliveTime: 60000
```

### Step 3 — Enable HikariCP metrics in Actuator

HikariCP automatically registers its metrics with Micrometer when both are on the classpath. Confirm the Actuator metrics endpoint is exposed in `application.yml`:

```yaml
management:
    endpoints:
        web:
            exposure:
                include: health,info,metrics,prometheus   # add "metrics" if not already present
```

The metric names exposed by HikariCP are:
- `hikaricp.connections` — total connections in pool
- `hikaricp.connections.active` — connections currently in use
- `hikaricp.connections.idle` — idle connections
- `hikaricp.connections.pending` — threads waiting for a connection
- `hikaricp.connections.acquire` — time taken to acquire a connection (histogram)
- `hikaricp.connections.creation` — time taken to create a new connection (histogram)

These metrics are automatically tagged with `pool=ArmorSight-HikariCP`.

Verify after startup:
```bash
curl http://localhost:8080/management/metrics/hikaricp.connections.active
```

### Step 4 — Add a pool-saturation health indicator (optional but recommended)

Add a custom `HealthIndicator` that reports `DOWN` when the pool is near saturation, so `/management/health` surfaces the problem:

**File:** `backend/src/main/java/com/nilachakra/config/HikariPoolHealthIndicator.java`

```java
package com.nilachakra.config;

import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.HikariPoolMXBean;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

@Component
public class HikariPoolHealthIndicator implements HealthIndicator {

    private final HikariDataSource dataSource;

    public HikariPoolHealthIndicator(DataSource dataSource) {
        this.dataSource = (HikariDataSource) dataSource;
    }

    @Override
    public Health health() {
        HikariPoolMXBean pool = dataSource.getHikariPoolMXBean();
        if (pool == null) {
            return Health.unknown().withDetail("reason", "pool MXBean not available").build();
        }
        int active  = pool.getActiveConnections();
        int idle    = pool.getIdleConnections();
        int pending = pool.getThreadsAwaitingConnection();
        int total   = pool.getTotalConnections();
        int max     = dataSource.getMaximumPoolSize();

        Health.Builder builder = (pending > 0 || active >= max)
            ? Health.down()
            : Health.up();

        return builder
            .withDetail("pool",     dataSource.getPoolName())
            .withDetail("active",   active)
            .withDetail("idle",     idle)
            .withDetail("pending",  pending)
            .withDetail("total",    total)
            .withDetail("maximum",  max)
            .build();
    }
}
```

---

## Test Commands

```bash
# Build
cd /Users/encryptshell/GIT/UTMStack-11/backend
./mvnw compile

# Unit test the health indicator
./mvnw test -Dtest=HikariPoolHealthIndicatorTest

# Full test suite
./mvnw test

# Integration: start with dev profile and verify metrics endpoint
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev &
sleep 20
curl -s http://localhost:8080/management/metrics/hikaricp.connections | jq .
curl -s http://localhost:8080/management/health | jq '.components.hikariPool'
```

Write this unit test in `backend/src/test/java/com/nilachakra/config/HikariPoolHealthIndicatorTest.java`:

```java
@ExtendWith(MockitoExtension.class)
class HikariPoolHealthIndicatorTest {

    @Mock HikariDataSource dataSource;
    @Mock HikariPoolMXBean pool;

    private HikariPoolHealthIndicator indicator;

    @BeforeEach
    void setUp() {
        when(dataSource.getHikariPoolMXBean()).thenReturn(pool);
        when(dataSource.getPoolName()).thenReturn("test-pool");
        when(dataSource.getMaximumPoolSize()).thenReturn(20);
        indicator = new HikariPoolHealthIndicator(dataSource);
    }

    @Test
    void healthIsUpWhenPoolHasCapacity() {
        when(pool.getActiveConnections()).thenReturn(5);
        when(pool.getIdleConnections()).thenReturn(15);
        when(pool.getThreadsAwaitingConnection()).thenReturn(0);
        when(pool.getTotalConnections()).thenReturn(20);

        Health health = indicator.health();
        assertThat(health.getStatus()).isEqualTo(Status.UP);
    }

    @Test
    void healthIsDownWhenThreadsAreWaiting() {
        when(pool.getActiveConnections()).thenReturn(20);
        when(pool.getIdleConnections()).thenReturn(0);
        when(pool.getThreadsAwaitingConnection()).thenReturn(3);
        when(pool.getTotalConnections()).thenReturn(20);

        Health health = indicator.health();
        assertThat(health.getStatus()).isEqualTo(Status.DOWN);
        assertThat(health.getDetails()).containsKey("pending");
        assertThat(health.getDetails().get("pending")).isEqualTo(3);
    }

    @Test
    void healthIsDownWhenPoolFullyExhausted() {
        when(pool.getActiveConnections()).thenReturn(20);
        when(pool.getIdleConnections()).thenReturn(0);
        when(pool.getThreadsAwaitingConnection()).thenReturn(0);
        when(pool.getTotalConnections()).thenReturn(20);

        Health health = indicator.health();
        assertThat(health.getStatus()).isEqualTo(Status.DOWN);
    }
}
```

---

## Acceptance Criteria

- [ ] `application-prod.yml` sets `maximumPoolSize: 20` with `minimumIdle: 5`, `connectionTimeout`, `idleTimeout`, `maxLifetime`, and `keepaliveTime`.
- [ ] `application-dev.yml` sets `maximumPoolSize: 10` (or lower) with matching companion properties.
- [ ] `GET /management/metrics/hikaricp.connections.active` returns a JSON metrics payload after startup (not 404).
- [ ] `GET /management/health` includes a `hikariPool` component showing connection counts.
- [ ] The health indicator reports `DOWN` when `threadsAwaitingConnection > 0`.
- [ ] Unit tests for `HikariPoolHealthIndicator` pass.
- [ ] `./mvnw test` green.
- [ ] No existing tests break due to the pool size change.
