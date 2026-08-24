# CEL pack fixture events (P2 Detection-as-product)

Synthetic events for a **sample** of `builtin-rules/**/cel-*.yaml` rules.

Each `*.json` file:

| Field | Meaning |
|-------|---------|
| `rule` | Expected CEL rule `name` |
| `expect` | `match` or `nomatch` |
| `description` | Short human note |
| `event` | Fields consumed by `rules.Evaluate` (`dataType`, `raw`, optional `log` / `origin`) |

Replay harness: `go test ./rules/ -run TestCelPack_fixtureReplay` from `event-processor/`.

Fixtures use synthetic hostnames and private IPs only — no customer data.
