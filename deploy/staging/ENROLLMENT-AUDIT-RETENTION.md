# Enrollment audit retention and export (staging)

This is the PILOT-01 / SIEM-009 **audit table** slice. It does not close full SIEM-009 (SLO dashboards, OpenSearch snapshots, 24-hour soak, or a clean full-cluster restore).

## Source of truth

- Database: PostgreSQL `agentmanager.enrollment_audit_events`
- Immutability: trigger `enrollment_audit_events_append_only` rejects `UPDATE` and `DELETE`
- Safe list: `GET /api/ha-agent-enrollments/audit` (Admin / SOC Manager, tenant header, max 100 rows)
- Safe export: `GET /api/ha-agent-enrollments/audit/export` (same roles and tenant; NDJSON of the list DTO; max 10,000 rows)
- Operator copy-hold metadata: `GET /api/ha-retention-policies/ENROLLMENT_AUDIT` (`sourceImmutable: true`, `archiveTarget: NONE`)

`retentionDays` on `ENROLLMENT_AUDIT` is how long **exported copies and pg_dump files** should be kept. It does not prune the source table.

## Operator backup of the audit table

```bash
docker exec hivearmor-staging-postgres-1 \
  pg_dump -U postgres -d agentmanager --data-only --table=enrollment_audit_events \
  > /var/tmp/hivearmor-enrollment-audit.dump.sql
chmod 0600 /var/tmp/hivearmor-enrollment-audit.dump.sql
```

Do not restore that dump over a live table unless you have a maintenance window and a verified empty/new database. A restore that issues `DELETE` against the live table will fail while the append-only trigger is in place.

## Live check

```bash
bash deploy/staging/run-enrollment-audit-export.sh
```

The script must not print JWTs, passwords, or audit event payloads.
