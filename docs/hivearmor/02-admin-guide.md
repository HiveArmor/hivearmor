# HiveArmor — Administrator Reference

**Audience:** Platform administrators  
**Version:** v1.x

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Accessing the Admin Panel](#2-accessing-the-admin-panel)
3. [User Management](#3-user-management)
4. [Role-Based Access Control](#4-role-based-access-control)
5. [Email (SMTP) Configuration](#5-email-smtp-configuration)
6. [Two-Factor Authentication](#6-two-factor-authentication)
7. [Integrations & Data Sources](#7-integrations--data-sources)
8. [Log Retention (Index Lifecycle)](#8-log-retention-index-lifecycle)
9. [Compliance Frameworks](#9-compliance-frameworks)
10. [Tag Rules & Automation](#10-tag-rules--automation)
11. [Incident Response & SOAR](#11-incident-response--soar)
12. [Scheduled Reports](#12-scheduled-reports)
13. [Agent Management](#13-agent-management)
14. [Monitoring the Platform Health](#14-monitoring-the-platform-health)
15. [API Keys & Service Tokens](#15-api-keys--service-tokens)
16. [Audit Trail](#16-audit-trail)
17. [Environment Variable Reference (Full)](#17-environment-variable-reference-full)

---

## 1. System Overview

HiveArmor is a SIEM/XDR platform. It ingests logs from agents, network devices, and cloud services; correlates events into alerts; and provides investigation, incident management, compliance reporting, and threat intelligence enrichment.

### Data flow (summary)
```
Endpoint / Network Device
  └── Agent or Syslog/UDP:514
        └── Event Processor (correlates, parses, enriches)
              └── OpenSearch (storage, v3_hive_<type>-YYYY.MM.DD indices)
                    └── Backend API (Spring Boot :8088)
                          └── HiveArmor UI (Next.js :3000)
```

### Default admin URL
```
https://<SERVER_NAME>/login
Username: admin
Password: (printed during installation, or check /root/hivearmor.yml)
```

---

## 2. Accessing the Admin Panel

All admin functions are available under the navigation menu. Depending on your role:

| Role | Access |
|---|---|
| `ROLE_ADMIN` | Full platform access — users, config, all modules |
| `ROLE_USER` | SOC analyst access — alerts, incidents, log search |

Navigate to **Administration** (top navigation or left sidebar gear icon) for:
- User Management
- Log Sources / Integrations
- Compliance
- Tag Rules
- Incident Automation
- Reports

---

## 3. User Management

### Creating a user

1. Navigate to **Administration → Users**
2. Click **New User**
3. Fill in: Login (username), Email, First Name, Last Name, Language
4. Assign Role: `ROLE_ADMIN` or `ROLE_USER`
5. Click **Save**

The new user receives an activation email (requires SMTP configured — see Section 5).

### Resetting a password

1. Navigate to **Administration → Users**
2. Click the user row
3. Click **Reset Password** → sends email with reset link, OR
4. Click **Change Password** directly (admin override)

### Deactivating a user

Toggle the **Activated** switch on the user detail page. Deactivated users cannot log in but their data is preserved.

### Managing user sessions

Active sessions are tracked in the User Auditor service. Navigate to **Administration → User Audit** to see active sessions and force-logout specific users.

---

## 4. Role-Based Access Control

HiveArmor has two primary roles:

| Role | Permissions |
|---|---|
| `ROLE_ADMIN` | Everything: user management, integration config, rule editing, system settings |
| `ROLE_USER` | Read/write alerts, incidents, log search, dashboards, reports (view only). Cannot manage users or system config. |

> Custom roles are not available in the current version. All SOC analysts should receive `ROLE_USER`; platform owners receive `ROLE_ADMIN`.

### Adding a user to admin

```bash
# Via API (requires existing admin token)
TOKEN=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<PASS>","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id_token'])")

curl -X PUT http://localhost:8088/api/admin/users/<LOGIN> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"authorities":["ROLE_ADMIN","ROLE_USER"]}'
```

---

## 5. Email (SMTP) Configuration

Email is used for: password resets, user activation, scheduled report delivery.

### Configure SMTP

1. Navigate to **Administration → Configuration → Email**
2. Enter:
   - **SMTP Host** (e.g., `smtp.gmail.com`)
   - **Port** (587 for STARTTLS, 465 for SSL)
   - **Username** / **Password**
   - **From Address** (e.g., `noreply@acme.com`)
   - **From Name** (e.g., `HiveArmor Alerts`)
3. Click **Test** to send a test email
4. Click **Save**

### Environment variables (alternative)

Set in `.env` before starting:
```
MAIL_HOST=smtp.acme.com
MAIL_PORT=587
MAIL_USER=alerts@acme.com
MAIL_PASS=secret
MAIL_FROM=alerts@acme.com
```

---

## 6. Two-Factor Authentication

2FA is required for production deployments. It must be enabled via `APP_TFA_ENABLED=true` in `.env`.

When enabled:
- Users enrol via **Profile → Two-Factor Authentication** using any TOTP app (Google Authenticator, Authy, 1Password)
- Login issues a pre-verification token (`ROLE_PRE_VERIFICATION_USER`) until the TOTP code is submitted
- Admin can disable 2FA for a specific user in **User Management → user → Disable 2FA** (recovery)

> Never set `APP_TFA_ENABLED=false` on a production server.

---

## 7. Integrations & Data Sources

Data sources are configured under **Administration → Integrations** (or **Log Sources**).

### Supported log source categories

| Category | Sources |
|---|---|
| Endpoint | Windows (WinEventLog), Linux (syslog/journald), macOS (via agent) |
| Antivirus | Bitdefender, Crowdstrike, Sophos |
| Cloud | AWS CloudTrail, Azure AD, Office 365, GCP |
| Network | Cisco ASA/IOS, Fortinet, Palo Alto, pfSense, SonicWall, Mikrotik |
| NIDS | Suricata |
| Generic | Syslog UDP/TCP, JSON over HTTP |

### Adding a new data source

1. Navigate to **Administration → Integrations → New**
2. Select the source type
3. Configure the collection method:
   - **Agent-based:** Install the HiveArmor agent on the endpoint (see [Agent Installation Guide](04-agent-installation.md))
   - **Syslog:** Configure the device to send to `<SERVER_IP>:514` (UDP/TCP)
   - **Cloud API:** Enter API credentials (token, client ID/secret)
4. Click **Save & Test**

### Checking data source health

Navigate to **Administration → Integrations** — each source shows:
- Last event timestamp
- Events per minute (EPM)
- Status: Active / Inactive / Error

---

## 8. Log Retention (Index Lifecycle)

OpenSearch stores all logs in daily indices: `_v3_hive_<type>-YYYY.MM.DD`.

### Default retention policy

The backend manages an ISM (Index State Management) policy `hivearmor_ism_policy` in OpenSearch:

| Phase | Condition | Action |
|---|---|---|
| hot | always | Accept new writes |
| delete | age > 90 days | Delete index |

### Changing retention

1. Navigate to **Administration → System → Index Policy**
2. Set the retention period in days
3. Click **Apply** — the backend updates the OpenSearch ISM policy

Alternatively, modify the ISM policy directly in OpenSearch Dashboards (dev/advanced users only):
- Open `https://localhost:5601`
- Navigate to **Index Management → Policies → hivearmor_ism_policy**

---

## 9. Compliance Frameworks

The Compliance Orchestrator runs inside the event-processor container and evaluates controls every 24 hours.

### Supported frameworks

| Framework | Coverage |
|---|---|
| HIPAA | Healthcare data protection |
| PCI-DSS | Payment card industry |
| ISO 27001 | Information security management |
| NIST CSF | Cybersecurity framework |
| SOC 2 | Service organization controls |

### Viewing compliance status

Navigate to **Compliance** in the main navigation:
- **Dashboard:** Summary of passed/failed controls per framework
- **Controls:** Detailed control-by-control breakdown with evidence
- **Reports:** Generate and download PDF compliance reports

### How compliance is evaluated

Controls are evaluated against:
1. Log data in OpenSearch (e.g., "are failed logins being captured?")
2. Platform configuration (e.g., "is 2FA enabled?")
3. Agent coverage (e.g., "are all endpoints monitored?")

Results are written to `_v3_hive_log-compliance-evaluation` in OpenSearch.

---

## 10. Tag Rules & Automation

Tag rules automatically categorize alerts. Navigate to **Administration → Tag Rules**.

### Creating a tag rule

1. Click **New Tag Rule**
2. Set conditions (alert fields, regex matches, severity ranges)
3. Assign tags (e.g., `critical-asset`, `ransomware`, `vpn-login`)
4. Click **Save**

Rules are evaluated every 30 seconds against new alerts.

### Built-in auto-tags

When an alert is viewed, clicking **Auto-Tag** calls the SOC AI module to suggest relevant tags based on the alert content.

---

## 11. Incident Response & SOAR

### Creating an incident from alerts

1. Select one or more alerts in the **Alerts** view
2. Click **Create Incident** in the bulk action bar
3. Fill in: Title, Description, Severity, Assignee
4. Click **Create**

### Incident statuses

| Status | Meaning |
|---|---|
| Open | Under investigation |
| In Review | Assigned analyst is working it |
| Resolved | Root cause identified, remediated |
| Closed | Archived |

### SOAR automation rules

Navigate to **Administration → Automation**:
- Rules trigger automatically when alerts match conditions
- Actions: Create incident, Assign analyst, Send email, Run webhook

---

## 12. Scheduled Reports

Reports are generated as PDFs via the `web-pdf` service (headless browser).

### Creating a scheduled report

1. Navigate to **Reports → Scheduled Reports → New**
2. Choose report type: Compliance, Alerts Summary, Custom
3. Set schedule: daily / weekly / monthly
4. Set delivery: email recipients, or download only
5. Click **Save**

Reports are stored and downloadable from **Reports → History**.

---

## 13. Agent Management

Navigate to **Administration → Agents** to see all enrolled endpoints.

### Agent view

| Column | Description |
|---|---|
| Hostname | Agent machine hostname |
| OS | Operating system |
| IP | Last seen IP address |
| Status | Online / Offline / Stale |
| Last Seen | Timestamp of last heartbeat |
| Version | Agent binary version |
| Actions | Send command, Delete |

### Sending a remote command

1. Click the agent row
2. Click **Remote Command**
3. Type the command (e.g., `tasklist`, `ps aux`)
4. Click **Execute**
5. Output appears in the response panel

> All remote commands are logged in the audit trail.

### Deleting an agent

Click the agent row → **Delete**. The agent will re-register if it reconnects.

---

## 14. Monitoring the Platform Health

### Built-in health endpoint

```bash
curl -sf http://localhost:8088/api/healthcheck
```

Returns `200 OK` when the backend is up, OpenSearch is reachable, and PostgreSQL is connected.

### Docker health status

```bash
docker compose ps
```

All services should show `healthy`. If a service shows `unhealthy`:

```bash
# View container logs
docker compose logs <service-name> --tail=100

# View health check output
docker inspect hivearmor_<service>_1 | python3 -c \
  "import sys,json; h=json.load(sys.stdin)[0]['State']['Health']; print(h['Log'][-1]['Output'])"
```

### Key metrics to monitor

| Metric | Where to check | Alert threshold |
|---|---|---|
| OpenSearch heap usage | `GET /_nodes/stats/jvm` | > 80% |
| OpenSearch disk usage | `GET /_cat/allocation` | > 85% |
| PostgreSQL connections | `pg_stat_activity` | > 800 |
| Backend memory | `docker stats hivearmor_backend_1` | > 1.4 GB |
| Event processor queue depth | Backend logs: `queue depth` | > 10,000 |

---

## 15. API Keys & Service Tokens

### Getting a JWT token for API use

```bash
TOKEN=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<PASSWORD>","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id_token'])")
echo $TOKEN
```

Token is valid for 24 hours (no-remember-me) or 30 days (rememberMe: true).

All API calls require: `Authorization: Bearer <TOKEN>`

### Service-to-service authentication

Internal services use the `INTERNAL_KEY` env var as a shared secret on the `X-Internal-Key` header. Never expose this key externally.

---

## 16. Audit Trail

All security-relevant actions are logged:

| Event | Where stored |
|---|---|
| User login / logout | `user-auditor` service → `userauditor` DB → OpenSearch |
| Alert status changes | `ha_alert_log` table (PostgreSQL) |
| Incident changes | `ha_incident` table (PostgreSQL) |
| Remote commands to agents | `ha_agent_command` table (PostgreSQL) |
| API key usage | Backend access logs |

### Viewing the audit log

Navigate to **Administration → Audit Log** for a searchable view of all user activity.

---

## 17. Environment Variable Reference (Full)

| Variable | Service(s) | Required | Description |
|---|---|---|---|
| `SERVER_NAME` | all | ✅ | FQDN or IP of this server |
| `POSTGRES_PASSWORD` | postgres, backend, agentmanager, user-auditor | ✅ | PostgreSQL password |
| `OPENSEARCH_INITIAL_ADMIN_PASSWORD` | opensearch, backend, user-auditor, eventprocessor | ✅ | OpenSearch admin password |
| `INTERNAL_KEY` | backend, agentmanager, eventprocessor, user-auditor | ✅ | Inter-service auth shared secret |
| `ENCRYPTION_KEY` | backend, agentmanager | ✅ | JWT signing key + config encryption |
| `EVENTPROCESSOR_INJECT_KEY` | eventprocessor | ✅ | API key for log injection endpoint |
| `APP_TFA_ENABLED` | backend | ✅ | `true` in production, `false` in dev only |
| `JHIPSTER_CORS_ALLOWED_ORIGINS` | backend | ✅ | Allowed CORS origins (your domain) |
| `HIVEARMOR_TAG` | all images | ✅ | Docker image tag to use |
| `MAIL_HOST` | backend | for email | SMTP server hostname |
| `MAIL_PORT` | backend | for email | SMTP port (587 / 465) |
| `MAIL_USER` | backend | for email | SMTP username |
| `MAIL_PASS` | backend | for email | SMTP password |
| `MAIL_FROM` | backend | for email | From address |