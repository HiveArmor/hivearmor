---
name: secops-detection-engineering
description: Google SecOps / Chronicle SIEM detection engineering — YARA-L rule authoring, run test vs retrohunt vs live rule, run frequency guide, error reference. Triggered by "Chronicle detection", "SecOps rule", "YARA-L rule", "Google SecOps", "retrohunt".
---

# SecOps Detection Engineering

## Core Workflow

```
Write rule → Test (Run Test) → Retrohunt → Deploy (Live Rule)
```

## Testing Methods

| Method | Alerts? | Persists? |
|--------|---------|-----------|
| Run Test | No | No |
| Retrohunt | Yes* | Yes |
| Live Rule | Yes | Yes |

*Only if alerting is enabled on the rule beforehand.

## Key Gotchas

1. **Saving ≠ Enabling** — rules land in disabled state; the Live Rule toggle must be flipped manually in the Rules Dashboard.

2. **Suppression during tests** — `suppression_window` is not honored during Run Test; every match surfaces.

3. **Non-existence delay** — any rule using `not $e2` adds roughly one hour to detection latency, regardless of run frequency.

4. **Retrohunt time range** — the window must be at least as large as the rule's `match` window, or it will fail.

5. **Reference lists** — deprecated as of June 2026; use data tables (`%table.column`) in new rules.

## Run Frequency Guide

| Rule Type | Recommended Frequency |
|-----------|----------------------|
| Single-event | Near real-time |
| Multi-event, window < 60m | 10 minutes |
| Multi-event, window ≥ 60m | 1 hour or 24 hours |

## Quick Error Reference

- **Slow query** → add `metadata.event_type` filter or shrink the match window
- **Memory error** → reduce keys in the `match:` section
- **Arithmetic type mismatch** → use `cast.as_int()` or `cast.as_uint()`

For deeper issues, consult `references/troubleshooting.md`.
