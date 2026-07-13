# UTMStack Frontend v2 — Feature Map (Old → New)

This document maps every feature from the old Angular frontend to what needs to be built in the new React frontend.

## Alerts Page (`/alerts`)

### API Endpoints Used
- `POST /api/utm-alerts/status` — Change alert status
- `POST /api/utm-alerts/tags` — Apply tags to alerts
- `POST /api/utm-alerts/notes?alertId=` — Update notes
- `POST /api/utm-alerts/solution` — Update proposed solution
- `POST /api/utm-alerts/convert-to-incident` — Create incident from alert
- `POST /api/soc-ai/analyze` — SOC AI analysis
- `GET /api/utm-alerts/auto-tags?alertId=` — Auto-tags

### Data is fetched via ElasticDataService (generic search endpoint)

### Table Columns (Alert mode, default visible)
1. Alert name, 2. Severity, 3. Status, 4. Time, 5. Last Echo
6. Sensor, 7. Echoes, 8. Target (IP, Host, User, ASN, ASO)
9. Adversary (IP, Host, User, ASN, ASO), 10. Availability

### Left Sidebar Filters
- Free text search
- Faceted checkbox filters for: Alert Name, Severity, Category, Sensor, Tags, Adversary IP/ASN/ASO, Target IP/ASN/ASO, Datasource Group, Incident Name

### Top Actions Bar
- Time range picker (default: 7 days)
- Applied filter chips (removable)
- Bulk: Change status (Open/In Review/Complete)
- Bulk: Create/Add to incident
- Status tabs with counts: All | Open | In Review | Closed

### Per-Row Actions
- Checkbox select
- Row-to-filter (add values as filter)
- Create/Add to incident
- Create automation flow
- Add comment
- Apply tags

### Detail Panel (right slide-over, 8 tabs)
1. Detail: description, severity, category, solution, references, all fields, target/adversary panels
2. SOC AI: analyze button, classification, reasoning, next steps
3. Events related: list of associated log events
4. Incident detail: incident metadata (if applicable)
5. Map: geo visualization of target/adversary
6. Echoes: child/correlated alerts timeline
7. Alert History: change timeline
8. Rules applied: which tag rules matched

### Alert Statuses
- Open (2), In Review (3), Ignored (4), Completed (5)
- Completing/Ignoring requires observation text + optional False Positive rule

### Header Buttons
- Save report, Manage tags, View rules (admin)
