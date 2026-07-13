# 00 — Product Overview

## What UTMStack Is

UTMStack is an open-source enterprise **SIEM + XDR (Extended Detection and Response)** platform. It ingests logs from endpoints, network devices, cloud services, and SaaS platforms, correlates them in real-time using a custom Go-based correlation engine, and surfaces threats as alerts that analysts can investigate, escalate to incidents, and remediate via automated SOAR playbooks.

Licensed under **AGPL-3.0**. An enterprise tier adds faster correlation, threat intelligence updates, and AI-powered analysis.

---

## Product Positioning

| | |
|---|---|
| **Primary market** | Mid-market enterprises and MSSPs |
| **Not based on** | Grafana, Kibana, ELK, or any open-source SIEM framework |
| **Differentiator** | Correlation happens **before** data ingestion — reduces workload, improves real-time response |
| **Versioning** | v11 is the active line; v10 is EOL December 5, 2026 |

---

## User Personas

| Persona | Role | Key Workflows |
|---|---|---|
| **SOC Analyst (L1)** | Day-to-day alert triage | Alert management, log search, incident escalation |
| **SOC Analyst (L2/L3)** | Deep investigation | Full alert detail, SOAR playbooks, threat intelligence lookup |
| **Security Engineer** | Platform configuration | Correlation rules, integration setup, data parsing pipelines |
| **Compliance Officer** | Regulatory adherence | Compliance dashboards, scheduled PDF reports, control evaluation |
| **MSSP Administrator** | Multi-tenant management | User management, integration modules, tenant configuration |
| **Platform Admin** | Infrastructure | API keys, index management, system health, update management |

---

## Core Feature Set

### Log Ingestion (25+ sources)
- **Endpoints**: Windows Event Logs, Linux (syslog/auditd), macOS
- **Network**: Cisco (ASA/Firepower/Switch/Meraki), FortiGate, PaloAlto, pfSense, SonicWall, MikroTik, Netflow, Suricata
- **Cloud**: AWS (CloudTrail, CloudWatch), Azure (Activity/AD), GCP (Cloud Logging), Office 365
- **Security tools**: Sophos, Bitdefender, CrowdStrike, Kaspersky, SentinelOne
- **Infrastructure**: VMware ESXi, IBM AS/400, IBM AIX, Oracle, GitHub audit
- **Generic**: Syslog (UDP/TCP), JSON, generic log format

### Detection & Alerting
- Real-time correlation engine (custom Go — not ELK)
- YAML-based correlation rules across 23 technology categories
- Alert deduplication and grouping (configurable by field)
- Severity classification: Low, Medium, High (with configurable impact scores)
- Alert tagging via rule-based auto-tagging engine
- SOC AI powered alert analysis

### Alert Investigation
- Alert management views with filters (severity, status, category, time)
- Full alert detail with event timeline
- Related log search from alert context
- IP and host enrichment with geolocation
- Threat intelligence correlation (ThreatWinds feeds)
- Alert history and status lifecycle (Automatic Review → Open → In Review → Completed/Ignored)

### Incident / Case Management
- Incident creation from alerts
- Incident notes and history audit trail
- Alert-to-incident linking (1 incident : N alerts)
- Incident lifecycle management

### SOAR (Security Orchestration, Automation and Response)
- Automated response rules (triggered by alert conditions, run every 30s)
- Playbook builder and execution
- Interactive agent console (run commands on endpoints)
- Automation variables for playbook templating
- Command history and execution tracking

### Dashboard & Visualization
- Custom drag-and-drop dashboard builder (gridster2)
- Pre-built integration dashboards (Windows, Bitdefender, VMware, O365, etc.)
- Visualization builder (ECharts 4 — bar, line, pie, gauge, map, word cloud, 3D)
- Geographic visualizations (Leaflet with heatmap)
- KPI strip on overview dashboard
- Role-based dashboard access control

### Log Analyzer
- Elasticsearch/OpenSearch-backed log search
- Index pattern management
- Monaco Editor for advanced query authoring
- Saved query library

### Compliance & Reporting
- Compliance standards with configurable control sections
- Scheduled compliance reports (email delivery + PDF)
- PDF report generation via Selenium-based web-pdf service
- Report templates

### Threat Intelligence
- ThreatWinds feed integration
- Adversary/attacker tracking
- Threat indicator matching on alerts

### System Administration
- User CRUD with ROLE_ADMIN / ROLE_USER model
- Two-factor authentication (TOTP / email OTP)
- SAML2 SSO integration (Okta, Azure AD, etc.)
- API key management
- User activity auditing (dedicated user-auditor service)
- Integration module enable/disable
- Getting started wizard

---

## Active Modules (Enabled Routes)

| Module | Path | Description |
|---|---|---|
| Dashboard | `/dashboard` | Overview + custom dashboards |
| Alert Management | `/data` | Alert views, file management, adversary management |
| Log Analyzer | `/discover` | Raw log search |
| Data Sources | `/data-sources` | Asset discovery, collectors, source config |
| Integrations | `/integrations` | Enable/configure log source integrations |
| App Management | `/app-management` | API keys, metrics, health, menus, notifications |
| SOAR | `/soar` | Incident response automation |
| Incident Management | `/incident` | Case management |
| Compliance | `/compliance` | Compliance views and reporting |
| Data Parsing | `/data-parsing` | Logstash filter and pipeline management |
| Alerting Rules | `/alerting-rules` | Correlation rule management |
| Threat Intelligence | `/threat-intelligence` | ThreatWinds feeds and adversary tracking |
| Active Directory | `/active-directory` | AD integration views |
| Administration | `/management` | Admin-only: users, system config |
| Visualization Builder | `/creator` | Chart and dashboard builder |
| User Profile | `/profile` | User account settings |
| Automation Variables | `/variables` | SOAR variable management |
| Getting Started | `/getting-started` | Onboarding wizard |

## Disabled Modules (Code Exists, Routes Commented Out)

| Module | Reason |
|---|---|
| Vulnerability Scanner | Disabled — code in `/scanner/` and `/vulnerability-scanner/` |
| Reports | Disabled — code in `/report/` |
| File Browser | Disabled — code in `/filebrowser/` |

---

## Deployment Model

- **Single server**: Docker Swarm stack on Ubuntu 22.04 LTS
- **Container registry**: `ghcr.io/utmstack/utmstack/`
- **Scale tiers**: 50–500+ data sources; beyond 500 requires secondary horizontal nodes
- **Network ports**: 22 (SSH), 80 (HTTP redirect), 443 (HTTPS/UI), 9090 (Cockpit)
- **Default credentials**: admin / generated at install time (stored in `/root/utmstack.yml`)
- **TLS**: All agent-to-server communication encrypted; UI served over HTTPS

---

## Version and Lifecycle

| Version | Status | Notes |
|---|---|---|
| v11 | **Active** | Current development line |
| v10 | **EOL** | Sunset December 5, 2026; no new features |
