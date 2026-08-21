# HiveArmor Rule Test Fixtures

Each test fixture is a YAML file in `rules/testing/` named `<descriptor>.test.yml`.

The test runner is `rules/testing/run_tests.go`. Run all fixtures with:

```bash
make test-rules
```

## Format

```yaml
rule: rules/path/to/rule.yml   # relative path to the rule file (from repo root)
description: "Brief description of what this test validates"

# Input events fed into the engine. Each entry maps to a plugins.Event.
# Fields mirror the event-processor's eventToMap() representation.
events:
  - timestamp: "2026-01-15T10:00:00Z"
    dataType: wineventlog          # must match rule dataTypes[]
    origin:
      ip: "192.168.1.100"
      host: "WORKSTATION01"
      user: "attacker"
    target:
      ip: "192.168.1.10"
      user: "jsmith"
    log:
      eventCode: 4625              # CEL sees this as log["eventCode"]
      channel: "Security"
      message: "An account failed to log on"

# repeat injects the last event block N total times (use with threshold/correlation rules)
repeat: 5

# Expected outcome
expect:
  alert: true           # true = at least one alert must fire; false = no alert
  severity: "3"         # "1"=low "2"=medium "3"=high (string, matches plugins.Alert.Severity)
  name: "Rule Name"     # must match rule's name field exactly
```

## Rule type notes

| Rule type | How to trigger |
|---|---|
| Simple (`where` only) | One matching event |
| Correlation (`afterEvents`) | Provide enough events matching the correlation query; runner stubs the OpenSearch check |
| Risk (`riskScore`) | Use `repeat` so accumulated score ≥ threshold (default 75) |
| Sequence (`sequence[]`) | Provide events in step order; runner drives the sequence engine in-process |

## Negative tests

Set `expect.alert: false` and provide events that should NOT fire the rule.
The runner fails if any alert is produced.

## File naming

```
<descriptor>.test.yml     # positive case
```

Put both positive and a negative scenario in the same file via the `description` field
noting what the negative would be, or create separate `*-negative.test.yml` files.
