# P2 Detection-as-product — MITRE field flattening

**Status:** DRAFT / STAGING CANDIDATE  
**Scope:** event-processor alert documents indexed to OpenSearch

## Goal

Alert documents should expose ATT&CK fields under a consistent **flattened `mitre.*` namespace** so search, dashboards, and MSSP reporting can query:

| Field | Meaning |
|-------|---------|
| `mitre.technique.id` | ATT&CK technique ID (e.g. `T1059.001`) |
| `mitre.technique.name` | Human technique label |
| `mitre.tactic` | Tactic / category label |

without relying solely on free-text `technique` strings.

## Why not a full OpenSearch mapping change yet

Changing index templates / field types for every `v3-hive-alert-*` index is a migration: existing indices, saved searches, and backend projections must move together. That work is intentionally deferred.

## Concrete step shipped with this PR

`writer.alertToDoc` already published camelCase aliases:

- `mitreTechniqueId`
- `mitreTechniqueName`

It now **also** publishes the flattened keys above when `technique` parses as `Txxxx - Name`, and sets `mitre.tactic` from alert `category` when present. CamelCase fields remain for compatibility.

## Follow-ups (not in this PR)

1. OpenSearch index template: explicit `mitre.*` keyword/text mappings (versioned, non-breaking).
2. Prefer structured `mitre:` blocks on CEL YAML (today most CEL rules use string `technique:` + `category:`).
3. Backend API projection: prefer `mitre.technique.id` while accepting legacy aliases.
4. Expand fixture coverage beyond the initial CEL sample in `event-processor/rules/fixtures/cel/`.

## Related harness

```bash
cd event-processor
go test ./rules/ -run 'TestCelPack_(loadsHundredRules|fixtureReplay)' -count=1
```
