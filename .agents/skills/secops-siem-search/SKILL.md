---
name: secops-siem-search
description: Google Security Operations (Chronicle) SIEM search — Filter/Stats/Join/Raw Log query types, metadata.log_type lookup, entity investigation (users/hosts/IPs/files/domains), enriched data queries (geo/VirusTotal/entity context). Triggered by "Chronicle SIEM search", "Google SecOps search", "SecOps UDM query", "Chronicle investigation", "UDM search".
---

# Google Security Operations (SecOps) — SIEM Search

SecOps queries use an **implicit-AND filter model** — not SQL, not pipe syntax.

## Query Types

| Type | When to Use |
|------|-------------|
| **Filter** | Default — searching for events matching conditions |
| **Stats** | Aggregation, counts, grouping by field |
| **Join** | Correlating two event types within a time window |
| **Raw Log** | Regex against unparsed logs (slower, 10K result limit) |

## UDM Field Reference

```
metadata.log_type            # Data source (WINEVTLOG, OKTA, AWS_CLOUDTRAIL, etc.)
metadata.event_type          # Event category (USER_LOGIN, NETWORK_CONNECTION, etc.)
metadata.vendor_name         # Vendor (e.g., "Microsoft")
principal.hostname           # Source host
principal.user.userid        # Source user
principal.ip                 # Source IP
target.hostname              # Destination host
target.user.userid           # Target user
target.ip                    # Destination IP
target.url                   # URL accessed
target.file.sha256           # File hash
security_result.action       # ALLOW / BLOCK / UNKNOWN
security_result.severity     # CRITICAL / HIGH / MEDIUM / LOW
network.http.method          # GET / POST / etc.
network.destination_port     # Destination port
```

## Filter Queries (Most Common)

```
# Authentication failures
metadata.log_type = "WINEVTLOG"
metadata.event_type = "USER_LOGIN"
security_result.action = "BLOCK"

# Lateral movement via WMI
metadata.log_type = "WINEVTLOG"
target.process.command_line /= "wmic"

# Suspicious PowerShell
metadata.log_type = "WINEVTLOG"
target.process.command_line /= "-EncodedCommand"

# Outbound connection to threat-intel flagged IP
metadata.event_type = "NETWORK_CONNECTION"
target.ip = "<known-bad-ip>"
```

## Stats Queries

```
# Authentication failures by source IP (last 24h)
metadata.log_type = "WINEVTLOG"
metadata.event_type = "USER_LOGIN"
security_result.action = "BLOCK"
| summarize count() by principal.ip
| order count() desc

# Top processes by host
metadata.log_type = "WINEVTLOG"
metadata.event_type = "PROCESS_LAUNCH"
| summarize count() by principal.hostname, target.process.file.full_path
```

## Join Queries (Correlation)

```
# Brute force followed by success (within 10 minutes)
join(
  # Event 1: multiple failures
  (metadata.log_type = "WINEVTLOG"
   metadata.event_type = "USER_LOGIN"
   security_result.action = "BLOCK"
   | summarize count() by principal.ip, target.user.userid
   | where count() > 5),
  # Event 2: success from same source
  (metadata.log_type = "WINEVTLOG"
   metadata.event_type = "USER_LOGIN"
   security_result.action = "ALLOW"),
  match principal.ip, target.user.userid
  within 10m
)
```

## Entity Investigation Queries

```
# All activity for a user (last 7 days)
principal.user.userid = "suspicious.user@company.com"
| summarize count() by metadata.event_type, target.hostname

# Host timeline
principal.hostname = "WORKSTATION-123"
| order metadata.event_timestamp asc

# Domain lookup
target.hostname = "suspicious-domain.com"

# File hash reputation
target.file.sha256 = "<hash>"
```

## Enriched Data Queries

```
# VirusTotal-enriched matches
graph.entity.file.prevalence.rolling_max_sub_30_days = 0

# Geo-based unusual login
principal.location.country_or_region != "United States"
metadata.event_type = "USER_LOGIN"
security_result.action = "ALLOW"
```

## Diagnosing Missing Data

```
# Verify log type exists in environment
metadata.log_type = "EXPECTED_LOG_TYPE"
| summarize count() by metadata.log_type

# Check data freshness
metadata.log_type = "WINEVTLOG"
| summarize max(metadata.event_timestamp)
```

If a log type returns zero results: confirm the parser is onboarded and the data source is actively sending logs to the SecOps tenant.
