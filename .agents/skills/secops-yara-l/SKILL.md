---
name: secops-yara-l
description: YARA-L 2.0 language reference for Google SecOps/Chronicle — section order, variable types, window types, condition syntax, common gotchas (regex, enumerated fields, Windows paths), minimal working examples. Triggered by "YARA-L", "Chronicle rule syntax", "write YARA-L", "YARA-L gotcha".
---

# YARA-L 2.0 Quick Reference

## Section Order

Rules require: `meta` → `events` → (optional `match`) → (optional `outcome`) → `condition`

Search/Dashboard extras: `dedup`, `order`, `limit`, `select`/`unselect`

## Variable Types

| Type | Syntax | Purpose |
|---|---|---|
| Event | `$e`, `$login` | References an event; field access prefix |
| Placeholder | `$user`, `$ip` | Join/group-by key across events |
| Outcome | `$count`, `$score` | Computed aggregate for condition logic |

## Window Types

| Type | Syntax | Behavior |
|---|---|---|
| Hop (default) | `$key over 5m` | Overlapping — general correlation |
| Tumbling | `$key by 30m tumbling` | Fixed, non-overlapping blocks |
| Sliding | `$key over 10m after $pivot` | Anchored to a pivot event |

Range: **1m minimum → 48h maximum**

## Condition Quick Reference

```
$e          → event must exist (#e > 0)
#e > 5      → more than 5 distinct occurrences
$e and $e2  → both must be present
$e and not $e2 → e2 non-existence (~1h delay warning)
$count > 10 → outcome variable comparison
```

## Critical Gotchas

**Regex syntax:**
```yara
❌  /pattern/i
✓   = /pattern/ nocase
```

**Enumerated fields reject regex:**
```yara
❌  $e.metadata.event_type = /USER_LOGIN|USER_LOGOUT/
✓   ($e.metadata.event_type = "USER_LOGIN" or $e.metadata.event_type = "USER_LOGOUT")
```

**Windows path separators inside regex:**
```yara
❌  /^[d-zD-Z]:\//
✓   /^[d-zD-Z]:\\/
```

**`count()` needs a field argument** — bare `count()` won't compile; write `count(field)`.

**`nocase` on string literals fails** — only valid on regex literals.

**Single-event rules**: omit `match:` entirely — adding it causes unnecessary detection delay.

## Minimal Working Examples

**Single event:**
```yara
rule SuspiciousLogin {
  meta:
    severity = "MEDIUM"
  events:
    $e.metadata.event_type = "USER_LOGIN"
    $e.principal.ip in %suspicious_ips
  condition:
    $e
}
```

**Multi-event correlation:**
```yara
rule LoginThenDeletion {
  meta:
    severity = "HIGH"
  events:
    $user = $login.principal.user.userid
    $login.metadata.event_type = "USER_LOGIN"
    $user = $del.principal.user.userid
    $del.metadata.event_type = "FILE_DELETION"
  match:
    $user over 30m
  condition:
    $login and $del
}
```

## Deployment Reminders

- New rules are **not live by default** — toggle the Live Rule switch manually
- Reference lists deprecated June 2026 — prefer `%table.column` data tables
- Non-existence conditions (`not $e2`) add roughly one hour of detection delay
- Retrohunts require the match window to be ≤ the selected time range
