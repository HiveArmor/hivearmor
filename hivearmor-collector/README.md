# HiveArmor Collector

**Part of the [HiveArmor](https://github.com/hivearmor) — Hyper-scale Incident Visibility Engine**

A lightweight, high-throughput Go service that receives log data from network devices, firewalls, switches, routers, and other syslog-capable sources, then forwards enriched log streams to the HiveArmor Event Processor via gRPC.

---

## Overview

`hivearmor-collector` is the network-edge ingestion component of the HiveArmor SIEM/XDR platform. It listens on standard syslog ports, accepts log traffic from any RFC 3164/5424-compliant device or custom TCP source, enriches each message with source metadata, and delivers it to the correlation pipeline.

The collector registers with AgentManager at startup and receives its collection configuration dynamically via gRPC streaming. This means collection rules, source allowlists, and forwarding targets can be updated without restarting the collector.

---

## Supported Protocols

| Protocol | Transport | Default Port | Notes |
|---|---|---|---|
| Syslog | UDP | 514 | RFC 3164 and RFC 5424 |
| Syslog | TCP | 514 | RFC 3164 and RFC 5424, framed |
| Raw TCP | TCP | 514 | Unframed line-delimited |
| RELP | TCP | 2514 | Reliable Event Logging Protocol |

All listeners can be enabled independently. Each accepted message is tagged with source IP, transport protocol, and a high-resolution ingestion timestamp before entering the forwarding pipeline.

---

## Architecture

```
Network Device / Firewall / Switch
        |
        | UDP 514 / TCP 514 / RELP 2514
        v
+-------------------+
| hivearmor-collector|
|  - UDP listener   |
|  - TCP listener   |
|  - RELP listener  |
|  - Raw TCP        |
+-------------------+
        |
        | Metadata enrichment
        | (source IP, protocol, timestamp)
        v
+-------------------+          +-------------------+
|   AgentManager    |<-------->|  Event Processor  |
|   (gRPC :9000)    | config   |  (gRPC forward)   |
+-------------------+ stream   +-------------------+
                                       |
                                       v
                               Correlation engine
                               OpenSearch indexing
```

The collector maintains a persistent gRPC stream to AgentManager. Configuration updates (new sources, tag rules, forwarding endpoints) are pushed down this stream and applied without restart.

---

## Go Module

```
github.com/hivearmor/hivearmor-collector
```

---

## Build Requirements

### REPLACE_KEY ldflag (Required)

The collector authenticates with AgentManager using a shared secret baked into the binary at compile time. **Builds without this flag will fail to register and cannot forward logs.**

```bash
go build \
  -ldflags "-X github.com/hivearmor/hivearmor-collector/config.ReplaceKey=${REPLACE_KEY}" \
  -o hivearmor-collector .
```

In CI/CD, `REPLACE_KEY` is injected from the `$AGENT_SECRET_PREFIX` secret. Do not distribute binaries built without it, and do not embed development keys in production images.

### Standard Build

```bash
# Development (non-functional without REPLACE_KEY in env)
go build -o hivearmor-collector .

# Production
export REPLACE_KEY=<secret>
go build \
  -ldflags "-X github.com/hivearmor/hivearmor-collector/config.ReplaceKey=${REPLACE_KEY}" \
  -o hivearmor-collector .
```

### Prerequisites

- Go 1.25.5 or later
- Access to `github.com/hivearmor/shared` (referenced via `replace` directive in `go.mod` — the repository must be checked out alongside this module)

---

## Configuration

Configuration is supplied via environment variables. Collection rules and forwarding targets are additionally streamed from AgentManager at runtime.

| Variable | Required | Default | Description |
|---|---|---|---|
| `AGENT_MANAGER_HOST` | Yes | — | AgentManager hostname or IP |
| `AGENT_MANAGER_PORT` | No | `9000` | AgentManager gRPC port |
| `SYSLOG_UDP_PORT` | No | `514` | UDP syslog listener port |
| `SYSLOG_TCP_PORT` | No | `514` | TCP syslog listener port |
| `RELP_PORT` | No | `2514` | RELP listener port |
| `RAW_TCP_PORT` | No | `514` | Raw TCP listener port |
| `LOG_LEVEL` | No | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |
| `COLLECTOR_ID` | No | hostname | Unique identifier reported to AgentManager |

---

## Running

### Docker (Recommended)

The collector ships as part of the HiveArmor stack. The service is defined in `local-dev/docker-compose.yml`.

```bash
cd local-dev
docker compose up -d hivearmor-collector
```

To run the collector standalone against an existing stack:

```bash
docker run -d \
  --name hivearmor-collector \
  -e AGENT_MANAGER_HOST=<agentmanager-host> \
  -e REPLACE_KEY=<secret> \
  -p 514:514/udp \
  -p 514:514/tcp \
  -p 2514:2514/tcp \
  ghcr.io/hivearmor/hivearmor-collector:latest
```

### Standalone Binary

```bash
export AGENT_MANAGER_HOST=agentmanager.internal
export REPLACE_KEY=<secret>

./hivearmor-collector
```

### Systemd Service

For distributed collection deployments where the collector runs on a dedicated host (DMZ, remote site, OT network segment):

```ini
[Unit]
Description=HiveArmor Collector
After=network.target

[Service]
ExecStart=/usr/local/bin/hivearmor-collector
EnvironmentFile=/etc/hivearmor/collector.env
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Place secrets in `/etc/hivearmor/collector.env` (mode `0600`, owned by the service user).

---

## Log Enrichment

Every message processed by the collector is enriched before forwarding:

- **Source IP** — the IP address of the sending device, preserved from the socket connection (not the syslog HOSTNAME field, which can be spoofed or absent)
- **Protocol** — the transport used: `syslog-udp`, `syslog-tcp`, `raw-tcp`, or `relp`
- **Ingestion timestamp** — UTC timestamp at the moment the collector received the message, independent of the device clock
- **Collector ID** — identifies which collector instance received the log, useful in multi-site deployments

---

## Distributed Deployment

For large environments or networks with strict segmentation, multiple collector instances can be deployed:

```
Remote Site A          Remote Site B          Cloud VPC
+----------+           +----------+           +----------+
| Collector|           | Collector|           | Collector|
+----------+           +----------+           +----------+
      \                     |                     /
       \                    |                    /
        +-------------------+-------------------+
                            |
                            v
                      AgentManager
                            |
                            v
                    Event Processor
```

Each collector registers independently with AgentManager and receives its own configuration slice. The Event Processor correlates events across all collectors using the source IP and collector ID tags.

---

## Firewall Rules

Open the following ports inbound on the collector host:

| Port | Protocol | Direction | Purpose |
|---|---|---|---|
| 514 | UDP | Inbound | Syslog UDP from devices |
| 514 | TCP | Inbound | Syslog TCP from devices |
| 2514 | TCP | Inbound | RELP from devices |
| 9000 | TCP | Outbound | gRPC to AgentManager |

---

## Tested Integrations

The collector accepts standard syslog from any RFC-compliant source. Validated device categories include:

- Cisco ASA, IOS, NX-OS, Meraki
- Palo Alto PAN-OS
- Fortinet FortiGate
- Juniper Junos
- pfSense / OPNsense
- Linux syslog (rsyslog, syslog-ng, journald with syslog forwarding)
- Windows NXLog and Winlogbeat (syslog output mode)
- F5 BIG-IP
- CheckPoint

---

## Versioning and Support

| Version | Status | Supported Until |
|---|---|---|
| v11.x LTS | Current | November 2030 |
| v10.x | Maintenance | July 2026 |

---

## Part of the HiveArmor Platform

| Component | Role |
|---|---|
| `hivearmor-collector` | Network log ingestion (this service) |
| `agent` | Endpoint log collection (Windows/Linux/macOS) |
| `agent-manager` | Agent and collector registry, config distribution |
| `event-processor` | Log correlation and alerting |
| `backend` | REST API, incident management, user auth |
| `frontend-v2` | Web UI (Next.js) |

---

## Support

- Documentation: [https://docs.hivearmor.io](https://docs.hivearmor.io)
- Support: [support@hivearmor.io](mailto:support@hivearmor.io)
- GitHub: [https://github.com/hivearmor](https://github.com/hivearmor)

---

*HiveArmor — Hyper-scale Incident Visibility Engine*