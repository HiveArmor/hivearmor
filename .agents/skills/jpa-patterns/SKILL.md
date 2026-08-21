---
name: jpa-patterns
description: JPA/Hibernate patterns — N+1 problem, LazyInitializationException, JOIN FETCH, @EntityGraph, projections, pagination, optimistic locking. Triggered by "N+1 problem", "LazyInitializationException", "JPA help", "Hibernate performance". See also: spring-data-jpa skill for Liquibase and keyset pagination.
---

# JPA / Hibernate Patterns

## N+1 Problem (Most Common JPA Issue)

**Problem:** 1 query to load a list + N additional queries to load each related entity.

```java
// ❌ N+1 — 1 query for alerts + 1 per alert to load incident
List<Alert> alerts = alertRepo.findAll();
for (Alert a : alerts) {
    System.out.println(a.getIncident().getTitle());  // lazy load — 1 query each
}
```

**Fix 1 — JOIN FETCH in JPQL:**
```java
@Query("SELECT a FROM Alert a JOIN FETCH a.incident WHERE a.status = :status")
List<Alert> findByStatusWithIncident(@Param("status") AlertStatus status);
```

**Fix 2 — @EntityGraph:**
```java
@EntityGraph(attributePaths = {"incident", "tags"})
List<Alert> findByStatus(AlertStatus status);
```

**Fix 3 — DTO projection (best for read-only):**
```java
public interface AlertSummary {
    Long getId();
    String getSeverity();
    String getIncidentTitle();  // Spring Data can flatten nested via SpEL: @Value("#{target.incident.title}")
}
List<AlertSummary> findByStatus(AlertStatus status);
```

---

## LazyInitializationException

**Problem:** Accessing a lazy association outside a transaction (after the Session is closed).

```java
// ❌ Alert loaded in service, incident accessed in controller outside @Transactional
Alert alert = alertService.findById(id);
// Session closed here...
alert.getIncident().getTitle();  // LazyInitializationException
```

**Fix 1 — Use JOIN FETCH in the query (return what you need)**
**Fix 2 — `@Transactional(readOnly = true)` on the service method**
**Fix 3 — Return a DTO, not the entity (most defensive)**

```java
// ❌ Never set EAGER globally — causes over-fetching
@OneToMany(fetch = FetchType.EAGER)  // loads ALL incidents for every alert query
private List<Incident> incidents;

// ✅ Keep LAZY (default for collections) — fetch explicitly when needed
@OneToMany(fetch = FetchType.LAZY)
private List<Incident> incidents;

// ✅ Also make @ManyToOne lazy (it's EAGER by default — change this)
@ManyToOne(fetch = FetchType.LAZY)
private Incident incident;
```

---

## Transactions

```java
// ✅ readOnly = true on query methods — skips dirty checking, faster
@Transactional(readOnly = true)
public Page<AlertDTO> findAlerts(AlertFilter filter, Pageable pageable) { ... }

// ✅ readOnly = false (default) only for methods that write
@Transactional
public Alert updateStatus(Long id, AlertStatus status) { ... }

// ❌ Internal @Transactional calls are ignored — Spring proxy is bypassed
@Service
public class AlertService {
    public void bulkProcess(List<Long> ids) {
        for (Long id : ids) {
            this.updateStatus(id, AlertStatus.CLOSED);  // proxy bypassed — no transaction!
        }
    }
    @Transactional
    public void updateStatus(Long id, AlertStatus status) { ... }
}
// ✅ Fix: inject self or move to separate service
```

---

## Pagination

```java
// ✅ Always paginate — never findAll() without limit on production tables
@GetMapping("/api/ha-alerts")
public Page<AlertDTO> getAlerts(
    @RequestParam(defaultValue = "0") int page,
    @RequestParam(defaultValue = "25") int size
) {
    Pageable pageable = PageRequest.of(page, size, Sort.by("timestamp").descending());
    return alertService.findAlerts(filter, pageable);
}

// ✅ Keyset pagination for deep offsets (large alert tables)
// See spring-data-jpa skill for full keyset implementation
```

---

## Optimistic Locking

```java
// ✅ @Version prevents lost updates in concurrent alert status changes
@Entity
public class Alert {
    @Version
    private Long version;  // auto-managed by JPA
    // ...
}
// On save: UPDATE alert SET status=?, version=version+1 WHERE id=? AND version=?
// If another transaction updated first → OptimisticLockException → retry or 409
```

---

## Common Traps

| Trap | Consequence | Fix |
|---|---|---|
| `CascadeType.ALL` on `@ManyToOne` | Deleting alert deletes parent incident | Use `CascadeType.PERSIST, MERGE` only |
| `toString()` with lazy field | Triggers load, potential LazyInit | Exclude lazy fields from toString |
| Open Session in View | Masks N+1 — lazy loads in view layer | Disable in prod: `spring.jpa.open-in-view=false` |
| Missing index on filter column | Slow queries on large tables | Add index in Liquibase changeset |
| `findAll()` on large table | OOM or timeout | Always paginate |

---

## Batch Inserts

```java
# application.yml — enable JDBC batching
spring:
  jpa:
    properties:
      hibernate:
        jdbc:
          batch_size: 50
        order_inserts: true
        order_updates: true
```

```java
// ✅ For bulk alert import — use saveAll() with batching enabled
@Transactional
public void importAlerts(List<Alert> alerts) {
    for (int i = 0; i < alerts.size(); i++) {
        alertRepo.save(alerts.get(i));
        if (i % 50 == 0) {
            em.flush();
            em.clear();  // prevent 1st level cache OOM
        }
    }
}
```

> **Related:** See `spring-data-jpa` skill for Liquibase schema rules and keyset pagination implementation.
