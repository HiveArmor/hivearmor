# HiveArmor — Plugin Development Guide

**Audience:** Go Developers extending the event processing pipeline  
**Version:** v1.x

---

## Table of Contents

1. [Overview](#1-overview)
2. [Plugin Types](#2-plugin-types)
3. [Plugin SDK](#3-plugin-sdk)
4. [Plugin Binary Naming Convention](#4-plugin-binary-naming-convention)
5. [Directory Structure](#5-directory-structure)
6. [Writing a Parsing Plugin](#6-writing-a-parsing-plugin)
7. [Writing a Correlation Plugin](#7-writing-a-correlation-plugin)
8. [Writing an Input Plugin](#8-writing-an-input-plugin)
9. [Plugin Configuration](#9-plugin-configuration)
10. [Building and Deploying Plugins](#10-building-and-deploying-plugins)
11. [Existing Plugins Reference](#11-existing-plugins-reference)
12. [Testing Plugins](#12-testing-plugins)

---

## 1. Overview

HiveArmor's event processor is extended via **plugins** — separate Go binaries that communicate with the core engine over gRPC. Plugins allow you to add:

- New enrichment steps (parsing plugins): geo lookup, custom field extraction, data transformations
- New correlation logic (correlation plugins): custom alert generation, threat scoring, AI analysis
- New data intake (input plugins): receive logs from third-party services, cloud APIs, custom protocols

Plugins live in the `plugins/` directory:

```
plugins/
├── alerts/               Indexes correlated alerts to OpenSearch
├── aws/                  AWS CloudTrail log intake
├── azure/                Azure Activity Log intake
├── bitdefender/          Bitdefender AV event intake
├── compliance-orchestrator/ Compliance framework evaluations
├── config/               Plugin configuration service
├── crowdstrike/          CrowdStrike Falcon intake
├── events/               General event indexing to OpenSearch
├── feeds/                Threat intelligence feed downloader
├── gcp/                  GCP audit log intake
├── geolocation/          GeoIP enrichment (parsing plugin)
├── inputs/               Log intake plugins (syslog, file, etc.)
├── modules-config/       Event processor module configuration
├── o365/                 Office 365 audit log intake
├── soc-ai/               AI-powered alert analysis
├── sophos/               Sophos endpoint event intake
└── stats/                Pipeline statistics and metrics
```

---

## 2. Plugin Types

| Type | SDK Function | Purpose |
|---|---|---|
| **Parsing** | `plugins.InitParsingPlugin` | Transform/enrich events in the pipeline |
| **Correlation** | `plugins.InitCorrelationPlugin` | Generate alerts from event patterns |
| **Input** | `plugins.InitInputPlugin` | Receive raw logs from external sources |

---

## 3. Plugin SDK

HiveArmor plugins use the `github.com/threatwinds/go-sdk` package.

### Core types

```go
// Event — a normalized log event flowing through the pipeline
type Event struct {
    DataType  string            // e.g., "linux", "wineventlog"
    Raw       string            // original raw log string
    Fields    map[string]string // parsed and enriched fields
    Timestamp time.Time
}

// Transform — input to a parsing plugin step
type Transform struct {
    Step  Step            // current pipeline step definition
    Draft *Draft          // the event being built
}

// Draft — mutable event being built by a parsing pipeline
type Draft struct {
    Event *Event
}

// Alert — a generated security alert
type Alert struct {
    Name        string
    Severity    int
    DataTypes   []string
    Category    string
    Technique   string
    Description string
    Fields      map[string]interface{}
}
```

### SDK initialization functions

```go
// Parsing plugin
func InitParsingPlugin(name string, handler func(context.Context, *Transform) (*Draft, error)) error

// Correlation plugin
func InitCorrelationPlugin(name string, handler func(context.Context, *Event) (*Alert, error)) error

// Input plugin
func InitInputPlugin(name string, handler func(context.Context) (<-chan *Event, error)) error
```

### Configuration access

```go
// Read plugin configuration (from the modules-config service)
cfg := plugins.GetCfg("plugin_com.hivearmor.myPlugin")
value := cfg.GetEnv().SomeField

// Read a specific config key
host := plugins.PluginCfg("org.opensearch").Get("opensearch").Get("host").String()
```

---

## 4. Plugin Binary Naming Convention

**Critical:** The event processor loads plugins by **exact binary name**. The name must follow this pattern:

```
com.hivearmor.<name>.plugin
```

Examples:
```
com.hivearmor.alerts.plugin
com.hivearmor.geolocation.plugin
com.hivearmor.soc-ai.plugin
com.hivearmor.myNewPlugin.plugin
```

The name used in `InitParsingPlugin("com.hivearmor.myNewPlugin", ...)` must match the compiled binary filename.

---

## 5. Directory Structure

Each plugin is a standalone Go module:

```
plugins/my-new-plugin/
├── go.mod              module github.com/hivearmor/plugins/my-new-plugin
├── go.sum
├── main.go             entry point — calls plugins.InitXxxPlugin
├── config/
│   └── config.go       configuration struct and loader
├── internal/
│   ├── processor.go    core plugin logic
│   └── types.go        data types
└── README.md
```

---

## 6. Writing a Parsing Plugin

A parsing plugin enriches or transforms events. It receives each event, can modify fields, and returns the modified event.

**Example: Add a custom field based on a pattern match**

```go
// plugins/my-enricher/main.go
package main

import (
    "context"
    "os"
    "strings"
    "time"

    "github.com/threatwinds/go-sdk/catcher"
    "github.com/threatwinds/go-sdk/plugins"
)

const pluginName = "com.hivearmor.my-enricher"

func main() {
    err := plugins.InitParsingPlugin(pluginName, enrichEvent)
    if err != nil {
        _ = catcher.Error("failed to start enricher plugin", err, map[string]any{
            "process": pluginName,
        })
        time.Sleep(5 * time.Second)
        os.Exit(1)
    }
}

// enrichEvent is called for every event in the pipeline.
// Return the modified draft. Do NOT return an error unless the event must be dropped.
func enrichEvent(_ context.Context, transform *plugins.Transform) (*plugins.Draft, error) {
    message := transform.Draft.Event.Fields["log.message"]

    // Mark events containing known bad strings
    if strings.Contains(message, "CVE-2024") {
        transform.Draft.Event.Fields["threat.cve"] = extractCVE(message)
        transform.Draft.Event.Fields["threat.enriched"] = "true"
    }

    return transform.Draft, nil
}

func extractCVE(msg string) string {
    // Simple extraction — in production, use regexp
    start := strings.Index(msg, "CVE-")
    if start < 0 {
        return ""
    }
    end := start + 13
    if end > len(msg) {
        end = len(msg)
    }
    return msg[start:end]
}
```

**Registering in the pipeline YAML (filters):**

After writing the plugin, wire it into a filter pipeline using the `dynamic` operator:

```yaml
pipeline:
  - dataTypes:
      - wineventlog
    steps:
      - json:
          source: raw
      # ... other steps ...
      - dynamic:
          plugin: com.hivearmor.my-enricher
          params:
            source: log.message
```

---

## 7. Writing a Correlation Plugin

A correlation plugin receives fully-parsed events and can generate alerts.

```go
// plugins/my-correlator/main.go
package main

import (
    "context"
    "os"
    "time"

    "github.com/threatwinds/go-sdk/catcher"
    "github.com/threatwinds/go-sdk/plugins"
)

const pluginName = "com.hivearmor.my-correlator"

// Track state for correlation (use a proper store in production)
var loginFailures = make(map[string]int)

func main() {
    err := plugins.InitCorrelationPlugin(pluginName, correlate)
    if err != nil {
        _ = catcher.Error("failed to start correlator", err, map[string]any{
            "process": pluginName,
        })
        time.Sleep(5 * time.Second)
        os.Exit(1)
    }
}

func correlate(_ context.Context, event *plugins.Event) (*plugins.Alert, error) {
    // Only look at failed logins
    if event.Fields["log.action"] != "failed_login" {
        return nil, nil // nil = no alert
    }

    ip := event.Fields["origin.ip"]
    loginFailures[ip]++

    if loginFailures[ip] >= 5 {
        loginFailures[ip] = 0 // reset counter
        return &plugins.Alert{
            Name:        "Custom: Brute Force Detected",
            Severity:    7, // medium-high
            DataTypes:   []string{event.DataType},
            Category:    "Credential Access",
            Technique:   "T1110",
            Description: "5+ failed logins from " + ip,
            Fields: map[string]interface{}{
                "origin.ip": ip,
            },
        }, nil
    }

    return nil, nil
}
```

> For production correlation plugins, use an external state store (Redis or the PostgreSQL `agentmanager` DB) rather than in-memory maps — the plugin may be restarted.

---

## 8. Writing an Input Plugin

Input plugins receive logs from external sources and inject them into the pipeline.

```go
// plugins/my-input/main.go
package main

import (
    "context"
    "os"
    "time"

    "github.com/threatwinds/go-sdk/catcher"
    "github.com/threatwinds/go-sdk/plugins"
)

const pluginName = "com.hivearmor.my-input"

func main() {
    err := plugins.InitInputPlugin(pluginName, collectLogs)
    if err != nil {
        _ = catcher.Error("failed to start input plugin", err, map[string]any{
            "process": pluginName,
        })
        time.Sleep(5 * time.Second)
        os.Exit(1)
    }
}

func collectLogs(ctx context.Context) (<-chan *plugins.Event, error) {
    ch := make(chan *plugins.Event, 100)

    go func() {
        defer close(ch)
        ticker := time.NewTicker(10 * time.Second)
        defer ticker.Stop()

        for {
            select {
            case <-ctx.Done():
                return
            case <-ticker.C:
                // Fetch logs from your source
                logs, err := fetchFromExternalSource()
                if err != nil {
                    continue
                }
                for _, raw := range logs {
                    ch <- &plugins.Event{
                        DataType: "my-source",
                        Raw:      raw,
                    }
                }
            }
        }
    }()

    return ch, nil
}

func fetchFromExternalSource() ([]string, error) {
    // Your API call / file read / database query here
    return []string{`{"message": "test log"}`}, nil
}
```

---

## 9. Plugin Configuration

Plugins read configuration from the `modules-config` service, which serves config from the backend.

### Configuration is defined in YAML (in the `modules-config/` directory):

```yaml
# modules-config/plugin_com.hivearmor.my-plugin.yaml
plugin_com.hivearmor.my-plugin:
  api_url: "https://api.example.com"
  api_key: ""        # filled in at runtime from env
  poll_interval: 60
```

### Access in Go code:

```go
cfg := plugins.GetCfg("plugin_com.hivearmor.my-plugin")
apiURL := cfg.Get("api_url").String()
pollInterval := cfg.Get("poll_interval").Int()
```

---

## 10. Building and Deploying Plugins

### Build

```bash
cd plugins/my-new-plugin

# The binary name MUST match the plugin name
go build -o com.hivearmor.my-new-plugin.plugin .
```

### Deploy

```bash
# Copy the compiled binary to the event processor container
docker compose cp \
  plugins/my-new-plugin/com.hivearmor.my-new-plugin.plugin \
  eventprocessor:/workdir/plugins/

# The event processor auto-discovers and loads new plugins on restart
docker compose restart eventprocessor

# Verify the plugin loaded
docker compose logs eventprocessor | grep "my-new-plugin"
```

### In the Dockerfile (for a permanent addition)

```dockerfile
# event-processor/Dockerfile
COPY plugins/my-new-plugin/com.hivearmor.my-new-plugin.plugin \
     /workdir/plugins/com.hivearmor.my-new-plugin.plugin
```

---

## 11. Existing Plugins Reference

| Plugin | Binary Name | Type | Purpose |
|---|---|---|---|
| `alerts` | `com.hivearmor.alerts.plugin` | Correlation | Indexes generated alerts to OpenSearch, applies tags |
| `events` | `com.hivearmor.events.plugin` | Parsing | Indexes all normalized events to OpenSearch |
| `geolocation` | `com.hivearmor.geolocation.plugin` | Parsing | Adds GeoIP fields (country, lat/lon, ASN) to origin/destination IP fields |
| `feeds` | `com.hivearmor.feeds.plugin` | Parsing | Enriches IPs against threat intelligence feeds (blocklists) |
| `soc-ai` | `com.hivearmor.soc-ai.plugin` | Correlation | AI-powered alert analysis and classification |
| `aws` | `com.hivearmor.aws.plugin` | Input | Polls AWS CloudTrail API for audit events |
| `azure` | `com.hivearmor.azure.plugin` | Input | Polls Azure Activity Log API |
| `gcp` | `com.hivearmor.gcp.plugin` | Input | Polls GCP Audit Logs API |
| `o365` | `com.hivearmor.o365.plugin` | Input | Polls Office 365 Management Activity API |
| `bitdefender` | `com.hivearmor.bitdefender.plugin` | Input | Receives Bitdefender GravityZone push events |
| `crowdstrike` | `com.hivearmor.crowdstrike.plugin` | Input | Polls CrowdStrike Falcon Event Streams API |
| `sophos` | `com.hivearmor.sophos.plugin` | Input | Polls Sophos Central API |
| `compliance-orchestrator` | `com.hivearmor.compliance-orchestrator.plugin` | Correlation | Evaluates HIPAA/PCI/ISO27001/NIST/SOC2 controls |
| `stats` | `com.hivearmor.stats.plugin` | Correlation | Computes pipeline throughput metrics |
| `inputs` | `com.hivearmor.inputs.plugin` | Input | Syslog (UDP/TCP 514), file tailing, agent intake |

---

## 12. Testing Plugins

### Unit test the handler function

```go
// plugins/my-enricher/main_test.go
package main

import (
    "context"
    "testing"

    "github.com/threatwinds/go-sdk/plugins"
)

func TestEnrichEvent(t *testing.T) {
    event := &plugins.Event{
        DataType: "linux",
        Fields: map[string]string{
            "log.message": "Exploiting CVE-2024-1234 in progress",
        },
    }
    draft := &plugins.Draft{Event: event}
    transform := &plugins.Transform{Draft: draft}

    result, err := enrichEvent(context.Background(), transform)
    if err != nil {
        t.Fatal(err)
    }

    if result.Event.Fields["threat.cve"] != "CVE-2024-1234" {
        t.Errorf("expected CVE-2024-1234, got %s", result.Event.Fields["threat.cve"])
    }
}
```

### Run tests

```bash
cd plugins/my-enricher
go test ./...
```

### Integration test via inject endpoint

```bash
INJECT_KEY="<EVENTPROCESSOR_INJECT_KEY>"

curl -X POST http://localhost:8090/v1/inject \
  -H "X-Inject-Key: $INJECT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dataType":"linux","raw":"Exploiting CVE-2024-1234 in progress"}'
```

Verify the enriched event appeared in OpenSearch with the new fields.
