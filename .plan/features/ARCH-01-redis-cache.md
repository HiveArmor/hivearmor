# ARCH-01: Redis Caching Layer

**Priority:** Tier 5 — Architecture  
**Effort:** 2 days  
**Impact:** 🟠 High — reduces OpenSearch load, faster dashboard response

---

## Current State
- Redis 7 is running in docker-compose (port 6379)
- Backend uses Caffeine (in-memory) cache only
- Every dashboard load hits OpenSearch for KPIs
- Every alert list page queries OpenSearch fresh
- No shared cache between backend instances

---

## What to Cache with Redis

| Data | TTL | Key Pattern |
|---|---|---|
| Overview KPIs (alert counts, EPS) | 30s | `overview:stats:{clientId}` |
| Alert count by severity | 30s | `alerts:summary:{clientId}:{timeRange}` |
| Top alert sources | 60s | `alerts:topsources:{clientId}:{timeRange}` |
| Collector health status | 60s | `collectors:health:{clientId}` |
| MITRE tactic counts | 5min | `mitre:tactics:{clientId}:{timeRange}` |
| Compliance scores | 10min | `compliance:scores:{clientId}` |
| User session data | session lifetime | `session:{userId}` |

---

## Backend Changes

### 1. Add Spring Data Redis dependency
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

### 2. Redis config (`RedisConfiguration.java`)
```java
@Configuration
@EnableCaching
public class RedisConfiguration {
    @Bean
    public RedisCacheManager cacheManager(RedisConnectionFactory factory) {
        // Configure TTLs per cache name
    }
}
```

### 3. Annotate services
```java
@Cacheable(value = "overview-stats", key = "#clientId")
public OverviewStatsDTO getStats(String clientId) { ... }

@CacheEvict(value = "overview-stats", key = "#alert.clientId")
public void saveAlert(Alert alert) { ... }
```

### 4. Cache invalidation on alert update
- When alert status changes → evict `alerts:summary:*`
- When new alert arrives (via event) → evict `overview:stats:*`

---

## 📋 SESSION PROMPT

```
I want to implement ARCH-01: Redis Caching Layer for ArmorSight SIEM backend.

Project context:
- Root: /Users/encryptshell/GIT/UTMStack-11/
- Backend: Spring Boot 3.3, port 8088
- Redis is running on port 6379 (in docker-compose) but not used by backend

Investigation:
1. Read /backend/pom.xml — check if spring-data-redis is already there
2. Read /backend/src/main/resources/config/application.yml — check Redis config
3. Read /backend/src/main/java/com/nilachakra/service/overview/ — this is the highest-traffic service
4. Read /backend/src/main/java/com/nilachakra/service/UtmAlertService.java — alert query patterns

What to build:
1. Add spring-boot-starter-data-redis to pom.xml if not present
2. Create RedisConfiguration.java in /backend/src/main/java/com/nilachakra/config/
   - TTL config: 30s for overview stats, 60s for collector health, 5min for MITRE, 10min for compliance
   - Key prefix: armorsight:{cacheName}:{key}
3. Add @Cacheable to OverviewService methods
4. Add @Cacheable to alert summary/stats methods  
5. Add @CacheEvict on alert status update methods
6. Add Redis connection config to application.yml and application-dev.yml
7. Add cache metrics endpoint (how many hits/misses) to health check

Test: Hit the overview API 10 times, verify only 1 OpenSearch query fires in 30s window.
```
