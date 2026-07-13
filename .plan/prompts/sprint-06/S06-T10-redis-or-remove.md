# S06-T10 — Decide and Act: Enable Redis for Alert Streaming or Remove It

**Sprint:** 6 (Tech Debt)
**Severity:** MEDIUM
**Issue ID:** DEBT-06
**Dependencies:** None
**Estimated time:** 3 hours

---

## Context

Redis is deployed in `local-dev/docker-compose.yml` with a 128 MB memory limit and `maxmemory-policy: noeviction`. When Redis fills up under `noeviction`, it returns `OOM command not allowed` write errors. However, the backend is currently using Redis only as an optional pub/sub channel for SSE alert streaming — it is not the primary cache.

**How the Redis opt-in works:**
- `backend/src/main/java/com/nilachakra/config/RedisConfiguration.java` — `@ConditionalOnProperty(name = "app.redis.enabled", havingValue = "true", matchIfMissing = false)`
- `backend/src/main/java/com/nilachakra/service/sse/AlertRedisPublisher.java` — same guard
- `backend/src/main/java/com/nilachakra/service/sse/AlertSseService.java` — when Redis is OFF, uses `@Scheduled` polling fallback every few seconds
- Docker-compose does NOT set `APP_REDIS_ENABLED=true` for the backend env — Redis pub/sub is currently disabled in local dev

**Current caching:** Only Caffeine (in-process JVM cache in `config/TfaCacheConfig.java`). No distributed cache.

**Decision required:** Two options are documented below. Read both, make a decision based on the current state of the app, implement it.

---

## What to Read First

Before writing any code, read these files completely:

1. `local-dev/docker-compose.yml` — redis service block (lines ~86-99), backend environment vars
2. `backend/src/main/java/com/nilachakra/config/RedisConfiguration.java` — what beans exist when enabled
3. `backend/src/main/java/com/nilachakra/service/sse/AlertSseService.java` — the polling fallback vs Redis path
4. `backend/src/main/java/com/nilachakra/service/sse/AlertRedisPublisher.java` — the publish call
5. `backend/src/main/java/com/nilachakra/service/impl/UtmAlertServiceImpl.java` line ~128 — the `if (alertRedisPublisher != null) publishAlerts(...)` call

---

## Decision Framework

### Option A: Enable Redis (Recommended if alert SSE latency is poor)

Redis pub/sub eliminates the polling delay in `AlertSseService`. Instead of the `@Scheduled` fallback checking every N seconds, new alerts are pushed to the SSE stream within milliseconds. This also opens the door to using Redis for rate limiting and session blacklisting later.

**When to choose A:** The `@Scheduled` polling fallback has a noticeable delay (>5 seconds) between alert generation and it appearing in the UI, OR you plan to use Redis for rate limiting in Sprint 7+.

**Fix the `noeviction` problem for pub/sub:** Pub/sub does not use memory (messages are not stored, only relayed). The `noeviction` policy only matters for key-value data. Set `maxmemory-policy: allkeys-lru` instead so if cache data is ever added later, old keys are evicted rather than returning errors.

### Option B: Remove Redis (Recommended if polling is fast enough)

The `@Scheduled` fallback in `AlertSseService` works correctly. Redis is adding operational complexity with no active benefit. Remove it from docker-compose and remove the dead `AlertRedisPublisher` code.

**When to choose B:** The alert polling fallback feels responsive enough (< 3 second delay), and you have no near-term plans to add Redis-backed rate limiting or session management.

---

## Implementation Steps — Option A: Enable Redis

### A1: Fix the memory policy

In `local-dev/docker-compose.yml`, find the redis service and change:

```yaml
  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 128mb --maxmemory-policy noeviction
```

to:

```yaml
  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
```

### A2: Enable Redis in the backend

In `local-dev/docker-compose.yml`, in the `backend` service environment block, add:

```yaml
      - APP_REDIS_ENABLED=true
```

### A3: Add `depends_on` for Redis in backend

In `local-dev/docker-compose.yml`, in the `backend` service `depends_on` section, add:

```yaml
      redis:
        condition: service_healthy
```

### A4: Verify alert SSE streaming via Redis

```bash
# Start the stack
cd /Users/encryptshell/GIT/UTMStack-11/local-dev
docker compose up -d

# Check that the backend logs show Redis connection
docker compose logs backend | grep -i "redis" | head -10
# Expected: "Connected to Redis" or similar Spring Data Redis log

# Subscribe to the SSE stream in one terminal
JWT=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | jq -r '.id_token')

curl -N -H "Authorization: Bearer $JWT" \
  http://localhost:8088/api/alerts/sse

# In another terminal, trigger an alert (or wait for organic alert activity)
# Verify the SSE stream delivers the event within 1-2 seconds
```

---

## Implementation Steps — Option B: Remove Redis

### B1: Remove redis from docker-compose.yml

In `local-dev/docker-compose.yml`:
- Delete the entire `redis:` service block
- Remove `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` from the `backend` environment
- Remove `redis:` from any `depends_on` blocks

### B2: Remove AlertRedisPublisher.java

```bash
rm backend/src/main/java/com/nilachakra/service/sse/AlertRedisPublisher.java

# Verify compilation succeeds (RedisConfiguration beans are conditional, should be fine)
cd /Users/encryptshell/GIT/UTMStack-11/backend
./mvnw compile -q
```

### B3: Clean up RedisConfiguration.java

Since `AlertRedisPublisher` was the only consumer of `RedisConfiguration`, the entire `RedisConfiguration.java` becomes dead code. Delete it:

```bash
rm backend/src/main/java/com/nilachakra/config/RedisConfiguration.java
./mvnw compile -q
```

### B4: Remove Redis dependency from pom.xml (if no other code uses it)

```bash
# Check if any other Java class imports Spring Data Redis
grep -r "import org.springframework.data.redis" src/main/java/ --include="*.java"
# If zero results after deleting the above files, remove from pom.xml:
```

In `backend/pom.xml`, find and remove:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

Then recompile to confirm nothing else needed it:

```bash
./mvnw compile -q
```

### B5: Remove Redis config from application.yml

In `backend/src/main/resources/application.yml`, remove the `spring.data.redis:` block.

---

## Test Commands (apply after either option)

```bash
# Docker-compose syntax check
cd /Users/encryptshell/GIT/UTMStack-11/local-dev
docker compose config --quiet && echo "SYNTAX OK"

# Backend compiles
cd /Users/encryptshell/GIT/UTMStack-11/backend
./mvnw compile -q && echo "BACKEND OK"

# Stack comes up healthy
cd /Users/encryptshell/GIT/UTMStack-11/local-dev
docker compose up -d
sleep 60
docker compose ps | grep -v "healthy\|running" | grep -v "NAME" && echo "WARN: unhealthy services" || echo "ALL HEALTHY"

# If Option A: verify Redis is accepting connections
docker compose exec redis redis-cli ping
# Expected: PONG

# SSE stream is live (for either option):
JWT=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | jq -r '.id_token')
curl -s --max-time 5 -N -H "Authorization: Bearer $JWT" \
  http://localhost:8088/api/alerts/sse
# Expected: SSE stream opens without error (may be empty if no alerts)
```

---

## Acceptance Criteria — Option A (Enable Redis)

- [ ] `maxmemory-policy` changed from `noeviction` to `allkeys-lru`
- [ ] `APP_REDIS_ENABLED=true` added to backend env in docker-compose.yml
- [ ] Backend logs show successful Redis connection on startup
- [ ] SSE alert stream (`/api/alerts/sse`) delivers events without needing the polling fallback
- [ ] `docker compose config --quiet` passes
- [ ] No `OOM command not allowed` errors in Redis logs under normal load

## Acceptance Criteria — Option B (Remove Redis)

- [ ] Redis service block removed from docker-compose.yml
- [ ] `AlertRedisPublisher.java` deleted
- [ ] `RedisConfiguration.java` deleted
- [ ] `spring-boot-starter-data-redis` removed from pom.xml (if no other usage)
- [ ] `spring.data.redis` removed from application.yml
- [ ] `./mvnw compile -q` succeeds
- [ ] SSE alert stream (`/api/alerts/sse`) still works via the `@Scheduled` polling fallback
- [ ] `docker compose up -d` no longer starts a Redis container
