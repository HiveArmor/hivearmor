---
name: java-code-review
description: Systematic Java code review covering null safety, exception handling, collections, concurrency, resource management, and API design. Triggered by "review this code", "check this PR", "code review". Outputs Critical/Improvements/Minor/Good sections.
---

# Java Code Review Skill

Systematic review covering 8 key areas. Output format: **Critical → Improvements → Minor → Good Practices**.

## Review Workflow

1. Quick scan: understand the change scope (1–2 min)
2. Apply checklist to **changed lines only**
3. Group similar findings
4. Always include at least one positive observation
5. Output structured findings

---

## 1. Null Safety

```java
// ❌ Chained call without null check — NPE risk
String city = user.getAddress().getCity().toUpperCase();

// ✅ Optional for nullable chains
String city = Optional.ofNullable(user.getAddress())
    .map(Address::getCity)
    .map(String::toUpperCase)
    .orElse("Unknown");

// ✅ Objects.requireNonNull for method preconditions
public AlertService(AlertRepository repo) {
    this.repo = Objects.requireNonNull(repo, "AlertRepository must not be null");
}
```

**Flag:** chained `.get()` on potentially null, returning `null` from a non-Optional method, missing `@NonNull`/`@Nullable` annotations on public APIs.

---

## 2. Exception Handling

```java
// ❌ Empty catch — silently swallows errors
try {
    processAlert(alert);
} catch (Exception e) {
    // ignored
}

// ❌ Losing original exception context
try {
    connect();
} catch (IOException e) {
    throw new ServiceException("Connection failed");  // e lost!
}

// ✅ Chain exceptions
throw new ServiceException("Connection failed", e);

// ✅ Log at boundary, not at every rethrow
// In controller / GlobalExceptionHandler — log once
// In service — throw, don't log
```

**Flag:** empty catch blocks, catching `Exception` or `Throwable` without re-throw, logging AND re-throwing (double logging), checked exceptions declared but never thrown.

---

## 3. Collections & Streams

```java
// ❌ Collectors.toList() may return immutable list (JDK 16+)
List<Alert> alerts = stream.collect(Collectors.toList());
// If caller tries alerts.add(...) → UnsupportedOperationException

// ✅ Explicit mutable list when modification needed
List<Alert> alerts = stream.collect(Collectors.toCollection(ArrayList::new));

// ✅ Unmodifiable when result is read-only
List<Alert> alerts = stream.collect(Collectors.toUnmodifiableList());

// ❌ O(n) List.contains in loop — use Set
for (String id : ids) {
    if (allowedIds.contains(id)) { ... }  // O(n) each
}
// ✅ Set<String> allowedIds = new HashSet<>(getAllowed());
```

**Flag:** List.contains() inside loops, streams inside tight loops, parallel streams on small collections, missing initial capacity on large collections.

---

## 4. Java Idioms

```java
// ❌ equals without hashCode — breaks HashMap/HashSet
@Override
public boolean equals(Object o) { ... }
// Missing: hashCode()

// ❌ String comparison with ==
if (status == "open") { ... }
// ✅ status.equals("open") or use enum

// ✅ Switch expression (Java 14+) over if-else chain
String label = switch (severity) {
    case CRITICAL, HIGH -> "urgent";
    case MEDIUM -> "review";
    case LOW, INFO -> "monitor";
};
```

---

## 5. Resource Management

```java
// ❌ Manual close — leaks if exception thrown
Connection conn = getConnection();
Statement stmt = conn.createStatement();
// ... use stmt ...
conn.close();  // never reached if exception above

// ✅ Try-with-resources
try (Connection conn = getConnection();
     Statement stmt = conn.createStatement()) {
    // auto-closed even on exception
}
```

**Flag:** Any `Closeable` (Connection, InputStream, PreparedStatement, HttpClient) not in try-with-resources.

---

## 6. Concurrency

```java
// ❌ Check-then-act race condition
if (!cache.containsKey(key)) {
    cache.put(key, compute(key));  // another thread may insert between check and put
}

// ✅ Atomic operation
cache.computeIfAbsent(key, this::compute);

// ❌ HashMap in shared context
private Map<String, Rule> rulesCache = new HashMap<>();  // not thread-safe

// ✅ ConcurrentHashMap
private Map<String, Rule> rulesCache = new ConcurrentHashMap<>();
```

---

## 7. API Design

```java
// ❌ Boolean parameter — unreadable at call site
public void setAlert(boolean active, boolean critical) {}
alertService.setAlert(true, false);  // what does false mean?

// ✅ Enum or named method
public void activateAlert() {}
public void setCriticality(Criticality level) {}

// ❌ Returning null from collection methods
public List<Alert> getAlerts() {
    if (noAlerts) return null;  // callers must null-check
}
// ✅ return Collections.emptyList()
```

---

## 8. Performance

```java
// ❌ Regex compile in loop
for (String line : lines) {
    if (line.matches("\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}")) {}
}
// ✅ private static final Pattern IP_PATTERN = Pattern.compile("...");

// ❌ String concatenation in loop
String result = "";
for (Alert a : alerts) { result += a.getId() + ","; }
// ✅ StringBuilder or String.join / Collectors.joining
```

---

## Severity Scale

| Level | Definition | Example |
|---|---|---|
| **Critical** | Security/data loss risk, certain NPE, resource leak | Password logged, connection never closed |
| **High** | Likely runtime error, race condition | Empty catch swallowing exception, missing hashCode |
| **Medium** | Code smell, maintenance risk, performance on hot path | Boolean parameter, List.contains in loop |
| **Low** | Style, minor improvement, cleaner alternative | Prefer switch expression, add @NonNull annotation |

## Review Output Template

```
## Code Review — [ClassName / PR title]

### Critical
- [file:line] — [finding] → [fix]

### Improvements
- [file:line] — [finding] → [fix]

### Minor
- [file:line] — [finding] → [fix]

### Good Practices
- [what was done well]
```
