---
name: concurrency-review
description: Java concurrency review — thread safety, virtual threads, Spring @Async pitfalls, CompletableFuture, deadlocks, race conditions. Triggered by "check thread safety", "review async code", "concurrency issues".
---

# Concurrency Review Skill

Review Java concurrent code for correctness, safety, and modern patterns.

> Nearly 60% of multithreaded applications encounter issues due to improper management of shared resources. Concurrency bugs are timing-dependent and difficult to test.

## When This Skill Applies
- `@Async` methods in Spring services
- `CompletableFuture` chains
- `ExecutorService` / thread pool usage
- Scheduled workers (`@Scheduled`)
- Shared caches or state accessed from multiple threads
- gRPC server handlers (each call on a different thread)

---

## 1. Check-Then-Act Race Conditions

```java
// ❌ Non-atomic check-then-act on shared map
if (!ruleCache.containsKey(ruleId)) {
    ruleCache.put(ruleId, loadRule(ruleId));
}

// ✅ Atomic — ConcurrentHashMap.computeIfAbsent
Rule rule = ruleCache.computeIfAbsent(ruleId, this::loadRule);
```

**Common locations in HiveArmor:** plugin registry, threat-intel cache, feed refresh state.

---

## 2. Missing volatile — Visibility Failures

```java
// ❌ Without volatile, JVM may cache value in register
private boolean running = true;

// Thread 1: running = false;
// Thread 2: while (running) — may never see the change

// ✅ volatile for simple flag shared across threads
private volatile boolean running = true;

// ✅ Or AtomicBoolean for read-modify-write
private final AtomicBoolean running = new AtomicBoolean(true);
```

---

## 3. Spring @Async Pitfalls

```java
// ❌ @Async without @EnableAsync — runs synchronously, no error
@Service
public class AlertTaggingWorker {
    @Async
    public Future<Void> tagAlerts() { ... }
}
// If @EnableAsync is missing from config, this runs on caller thread

// ❌ Self-invocation bypasses proxy
@Service
public class AlertService {
    public void process(Alert a) {
        this.tagAsync(a);  // calls via 'this' — proxy skipped, runs sync
    }
    @Async
    public void tagAsync(Alert a) { ... }
}
// ✅ Inject self via @Autowired or move to separate bean

// ❌ @Async on non-public method — proxy cannot intercept
@Async
private void tagAsync(Alert a) { ... }  // must be public
```

---

## 4. CompletableFuture — Silent Exception Loss

```java
// ❌ Exceptions silently discarded
CompletableFuture.runAsync(() -> processAlerts())
    .thenRun(() -> log.info("done"));
// If processAlerts() throws — nothing happens, no log

// ✅ Always handle exceptions
CompletableFuture.runAsync(() -> processAlerts())
    .exceptionally(ex -> {
        log.error("Alert processing failed", ex);
        return null;
    });

// ✅ Or use handle() to branch on success/failure
.handle((result, ex) -> {
    if (ex != null) { log.error("Failed", ex); return fallback(); }
    return result;
});

// ✅ Add timeout (Java 9+)
cf.orTimeout(30, TimeUnit.SECONDS)
  .exceptionally(ex -> { log.warn("Timed out"); return null; });
```

---

## 5. Virtual Threads (Java 21+)

```java
// ✅ I/O-bound work (HTTP calls, DB queries, OpenSearch) — use virtual threads
try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
    for (Alert alert in alertBatch) {
        executor.submit(() -> enrichWithThreatIntel(alert));
    }
}

// ❌ CPU-bound work with virtual threads — use platform threads
// Virtual threads are cheap but not faster for CPU; they still need OS thread time

// ⚠️ Java < 25: synchronized blocks pin virtual thread to OS thread
// Java 25 resolves synchronization pinning — safe to use synchronized in Java 25+
```

---

## 6. Structured Concurrency (Java 21+ Preview / Java 25 standard)

```java
// ✅ Structured concurrency — parent scope owns all child tasks
try (StructuredTaskScope.ShutdownOnFailure scope = new StructuredTaskScope.ShutdownOnFailure()) {
    Future<AlertStats> stats = scope.fork(() -> queryAlertStats(filter));
    Future<IncidentCount> incidents = scope.fork(() -> queryIncidentCount(filter));

    scope.join().throwIfFailed();

    return new DashboardData(stats.resultNow(), incidents.resultNow());
}
// All tasks cancelled on failure. No orphaned threads.
```

---

## 7. ScopedValue vs ThreadLocal (Java 21+)

```java
// ❌ ThreadLocal does not propagate to virtual thread children
ThreadLocal<String> requestId = new ThreadLocal<>();
requestId.set(id);
executor.submit(() -> {
    requestId.get();  // null in child virtual thread!
});

// ✅ ScopedValue propagates automatically
ScopedValue<String> REQUEST_ID = ScopedValue.newInstance();
ScopedValue.where(REQUEST_ID, id).run(() -> {
    executor.submit(() -> REQUEST_ID.get());  // correct value
});
```

---

## 8. Deadlock Prevention

```java
// ❌ Inconsistent lock ordering across threads
// Thread A: lock(A) → lock(B)
// Thread B: lock(B) → lock(A)  → deadlock

// ✅ Always acquire locks in the same total order
// Define ordering: resource with smaller id is always locked first
void transfer(Account from, Account to, long amount) {
    Account first  = from.getId() < to.getId() ? from : to;
    Account second = from.getId() < to.getId() ? to : from;
    synchronized (first) {
        synchronized (second) {
            // safe — consistent ordering
        }
    }
}
```

---

## 9. Scheduled Workers (HiveArmor-specific)

```java
// ✅ @Scheduled methods are single-threaded by default in Spring
// They do NOT run concurrently — next run waits for current to finish

// ❌ If a worker takes > interval, runs pile up
@Scheduled(fixedDelay = 30_000)  // 30s AFTER completion — preferred
public void tagAlerts() { ... }

// vs fixedRate = 30_000 — fires every 30s regardless of completion time
// fixedDelay is safer for workers that touch shared state

// ✅ Add @Async + @Scheduled only if you explicitly want concurrent runs
// Then you MUST handle the race conditions between runs
```

---

## Concurrency Review Checklist

### Critical (always verify)
- [ ] No unsynchronized check-then-act on shared mutable state
- [ ] `volatile` present where variable is read in one thread, written in another without lock
- [ ] `@Async` methods are `public` and called from a different bean (not `this.`)
- [ ] `@EnableAsync` present in configuration
- [ ] `CompletableFuture` chains have `.exceptionally()` or `.handle()`
- [ ] No `HashMap` in shared mutable context — use `ConcurrentHashMap`

### High (verify for shared services)
- [ ] Scheduler uses `fixedDelay` (not `fixedRate`) for stateful operations
- [ ] `ThreadLocal` not shared across virtual threads without ScopedValue
- [ ] Lock ordering consistent to prevent deadlock
- [ ] Thread pool size appropriate (CPU-bound: cores, I/O-bound: virtual threads)
