# F-11: App Management Suite

**Priority:** Tier 3  
**Effort:** 5 days  
**Impact:** 🟡 Medium — admin/ops features, not SOC-critical

---

## What's Missing from New UI

All these exist in legacy Angular under `/app-management/`:

| Feature | Backend API | New UI Status |
|---|---|---|
| Health Checks | health_check domain | ❌ Missing |
| App Metrics (JVM/HTTP) | Spring Actuator `/management/metrics` | ❌ Missing |
| Connection Keys | connection-key resource | ❌ Missing |
| Identity Provider (SAML) | `IdentityProviderConfigResource` | ❌ Missing |
| Index Patterns | `UtmIndexPatternResource` | ❌ Missing |
| Index Management | `IndexPolicyResource` | ⚠️ Partially in OpenSearch page |
| Rollover Config | `IndexPolicyResource` | ❌ Missing |
| API Keys | api_key domain | ⚠️ Partial in Settings |
| App Logs | `LogsResource` | ❌ Missing |
| Audit Log | `AuditResource` | ❌ Missing from Admin |
| App Theme | config params | ❌ Missing |

---

## Build Order Within This Feature

### Sub-feature 1: Connection Keys (agent enrollment tokens)
- List active tokens
- Generate new token (for agent install)
- Copy token to clipboard
- Revoke token
- Show agent install command with embedded token

### Sub-feature 2: Index Patterns
- List index patterns (used to route logs to correct OpenSearch index)
- Create/edit/delete patterns
- Map pattern to data source type

### Sub-feature 3: Health Checks Dashboard
- All service health status (backend, OpenSearch, eventprocessor, agent-manager)
- Auto-refresh every 30s
- Historical uptime per service

### Sub-feature 4: App Audit Log
- Show all admin actions with timestamp, user, IP
- Filter by action type, date range, user
- Export as CSV
- Uses `AuditResource.java`

### Sub-feature 5: Identity Provider (SAML/LDAP)
- Configure SAML IDP URL and certificate
- Configure LDAP connection
- Test connection button
- Uses `IdentityProviderConfigResource.java`

---

## Route Plan
All under `/admin/` since admin route already exists:

```
/admin/connection-keys
/admin/index-patterns  
/admin/health
/admin/audit-log
/admin/identity-provider
/admin/app-metrics
/admin/app-logs
```

---

## 📋 SESSION PROMPT

```
I want to implement F-11: App Management Suite for ArmorSight SIEM.

Project context:
- Root: /Users/encryptshell/GIT/UTMStack-11/
- Frontend: /frontend-v2/ (Next.js 14, React 18, Tailwind)
- Backend port: 8088

Current state:
- /frontend-v2/src/app/(app)/admin/ has: page.tsx, users/, settings/, notifications/, variables/, search-acceleration/
- Need to add sub-routes for: connection-keys, index-patterns, health, audit-log, identity-provider

For this session, build ONE sub-feature at a time. Start with: Connection Keys.

Connection Keys backend:
- Read /backend/src/main/java/com/nilachakra/web/rest/app-management/connection-key/ (check exact path)
- Or search: find /backend/src/main/java -name "*ConnectionKey*" -o -name "*Token*"

What to build for Connection Keys:
1. /admin/connection-keys/page.tsx:
   - Table: key name, created date, status (active/revoked), last used
   - "Generate New Key" button → modal with key name input → shows generated token (one-time display)
   - Copy to clipboard button
   - Revoke button with confirmation
   - Agent install command builder: show curl command with embedded token
2. Update admin nav/sidebar to include "Connection Keys" link

Read the legacy Angular implementation for reference:
/frontend/src/app/app-management/connection-key/ — for data model and API patterns
```
