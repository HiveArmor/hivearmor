# HiveArmor

**Hyper-scale Incident Visibility Engine** — enterprise SIEM/XDR platform.

HiveArmor merges SIEM (Security Information and Event Management) and XDR (Extended Detection and Response) technologies with real-time log correlation, threat intelligence, and automated response. Correlation runs before data ingestion, reducing workload and improving response times.

## Features

- Real-time log correlation and threat detection
- Alert investigation and incident management
- Threat intelligence and IOC enrichment
- MITRE ATT&CK coverage
- Security compliance reporting
- SOC AI-powered analysis
- Endpoint agent (Windows / Linux / macOS)
- 17 integration plugins (AWS, Azure, GCP, CrowdStrike, Sophos, and more)

## Architecture

```
Log source → Agent/Collector → gRPC → EventProcessor
  → parse → enrich → correlate
  → OpenSearch (_v3_hive_<type>-YYYY.MM.DD) → Backend API → HiveArmor UI
```

| Service | Technology |
|---|---|
| UI | Next.js 14 + React 18 (TypeScript) |
| API | Java 17 + Spring Boot 3.3 + JHipster 8 |
| Correlation Engine | Go 1.25.5 (event-processor + 17 plugins) |
| Agent | Go 1.25.5 |
| Log Store | OpenSearch 2.x |
| App Database | PostgreSQL 16 |

## Getting Started (Local Dev)

**Prerequisites:** Docker, Node 20, Java 17, Go 1.25.5, Maven 3.9+

```bash
# 1. Start the full stack
cd local-dev
cp .env.example .env   # fill in required secrets
docker compose up -d

# 2. Start the Next.js dev server
cd frontend-v2
npm install
npm run dev
# → http://localhost:3000   (admin / localdev123!)
```

Backend API: http://localhost:8088  
OpenSearch Dashboards: http://localhost:5601

## System Requirements (Production)

| Data Sources | Hot Storage | CPU | RAM | Disk |
|---|---|---|---|---|
| 50 | 120 GB/mo | 4 cores | 16 GB | 150 GB |
| 120 | 250 GB/mo | 8 cores | 16 GB | 250 GB |
| 240 | 500 GB/mo | 16 cores | 32 GB | 500 GB |
| 500 | 1 TB/mo | 32 cores | 64 GB | 1 TB |

Above 500 data sources, add secondary nodes for horizontal scaling.

## Installation

```bash
# Download the installer (Ubuntu 22.04 LTS recommended)
wget https://github.com/hivearmor/hivearmor/releases/latest/download/hivearmor_installer
chmod +x hivearmor_installer
sudo ./hivearmor_installer
```

After installation, access the UI at `https://<your-server>` with the credentials printed to `/root/hivearmor.yml`.

### Required Ports

| Port | Protocol | Purpose |
|---|---|---|
| 22 | TCP | SSH (restrict to admin IPs) |
| 80 | TCP | HTTP redirect to HTTPS |
| 443 | TCP | HiveArmor UI and API |
| 9090 | TCP | Cockpit server management |

Additional ports may be required for specific integrations (see integration guides).

## Security

- All agent-to-server communication encrypted with TLS 1.3
- Services isolated in containers with strong mutual authentication
- Connections authenticated with a 24+ character unique key per agent
- User credentials encrypted in the database, protected by fail2ban and optional 2FA
- Code reviewed regularly for vulnerable dependencies

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

HiveArmor is open-source software licensed under the AGPL version 3. See [LICENSE](LICENSE).
