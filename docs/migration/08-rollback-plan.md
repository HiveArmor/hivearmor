# 08 — Rollback Plan

> Every migration step must be reversible within 5 minutes using Docker image swap or git revert. No migration step should require a database rollback — schema changes use Liquibase add-only policy.

---

## General Rollback Principle

All services are Docker images tagged with version numbers (`ghcr.io/utmstack/utmstack/<service>:<tag>`). Rollback for any service is:

```bash
docker service update --image ghcr.io/utmstack/utmstack/<service>:<previous-tag> <service-name>
```

Docker Swarm replaces the running task with the previous image in ~30 seconds. No database changes are needed for any rollback because:
1. All Liquibase changesets are add-only (no `DROP COLUMN`, no `RENAME`)
2. The old schema is a strict subset of the new schema
3. The old application code is compatible with the new schema (additive changes only)

---

## Phase-Specific Rollback Procedures

### Phase 1 Rollback: node-sass → sass

**Trigger:** Build fails with dart-sass SCSS errors.

```bash
# Local
cd frontend
npm uninstall sass
npm install node-sass@^4.0.0
npm run build  # verify rebuilds successfully

# CI: Revert package.json and package-lock.json via git revert
git revert <phase-1-commit>
```

**Estimated time:** 5 minutes  
**Impact:** No production impact (build-time only change)

---

### Phase 2 Rollback: Node.js 14 → 20

**Trigger:** npm install fails or build errors on Node 20.

```bash
# Local
nvm use 14.16.1
npm run build

# CI: Revert reusable-node.yml node-version change
git revert <phase-2-commit>
```

**Estimated time:** 2 minutes  
**Impact:** No production impact (build-time only change)

---

### Phase 3 Rollback: TSLint → ESLint

**Trigger:** ESLint configuration produces false positives blocking CI.

```bash
git revert <phase-3-commit>
# Restores tslint.json, package.json, angular.json
npm install
npm run lint  # verify TSLint works again
```

**Estimated time:** 5 minutes  
**Impact:** No production impact (lint-time only change)

---

### Phase 4 Rollback: user-auditor + web-pdf

**Trigger:** user-auditor fails to start, audit records not written, PDF generation broken.

```bash
# Roll back user-auditor
docker service update \
  --image ghcr.io/utmstack/utmstack/user-auditor:<previous-tag> \
  user-auditor

# Roll back web-pdf
docker service update \
  --image ghcr.io/utmstack/utmstack/web-pdf:<previous-tag> \
  web-pdf
```

**Estimated time:** 2 minutes per service  
**Impact:** Audit trail gaps during rollback window (acceptable — no data lost, just not written during rollback)  
**Database:** No rollback needed — Liquibase changesets are add-only

---

### Phase 5 Rollback: Angular Frontend

**Trigger:** Authentication breaks, critical routes fail to load, visual regressions.

```bash
docker service update \
  --image ghcr.io/utmstack/utmstack/frontend:<previous-tag> \
  frontend
```

**Estimated time:** 30 seconds  
**Impact:** Analysts using the UI during rollback will be briefly interrupted. Sessions are NOT invalidated (frontend rollback does not touch the backend JWT).

---

### Phase 6 Rollback: Backend Spring Boot 3.3 + Security Config

**Trigger:** Authentication failing for any user, RBAC rules wrong, services can't communicate.

```bash
docker service update \
  --image ghcr.io/utmstack/utmstack/backend:<previous-tag> \
  backend
```

**⚠️ WARNING:** All active sessions will be invalidated on backend restart (JWT ephemeral key). Plan this rollback during low-activity windows.

**Estimated time:** 30 seconds for Docker swap + 2 minutes for backend startup  
**Impact:** All users must re-login after rollback.  
**Database:** No rollback needed.

---

### Phase 7 Rollback: Hibernate 6

**Trigger:** Query results differ from baseline, ORM errors in logs, missing or extra data in API responses.

```bash
# 1. Restore Hibernate version pin in pom.xml (git revert)
git revert <hibernate-pin-removal-commit>

# 2. Rebuild backend image
# (push to release branch → CI builds new image)

# 3. Deploy reverted image
docker service update \
  --image ghcr.io/utmstack/utmstack/backend:<reverted-tag> \
  backend
```

**Estimated time:** 30 minutes (includes rebuild)  
**Impact:** Users re-login. No data loss.  
**Database:** No rollback needed.

---

### Phase 8 Rollback: Go Modules

**Trigger:** Agent fails to connect, log ingestion stops, SOAR commands fail.

```bash
# Revert go.mod and go.sum changes
git revert <go-module-update-commit>

# Rebuild affected services
# agent-manager → deploy reverted Docker image
docker service update \
  --image ghcr.io/utmstack/utmstack/agent-manager:<previous-tag> \
  agentmanager
```

**⚠️ NOTE:** Agent binaries distributed from agent-manager are deployed-side. If agent binary upgrade was included, agents will auto-downgrade on next check-in.

**Estimated time:** 5 minutes  
**Impact:** Brief log ingestion gap during rollback.

---

### Phase 9 Rollback: ECharts 5

**Trigger:** Charts render blank, incorrect data, or throw console errors.

```bash
# Revert package.json echarts version changes
git revert <echarts-upgrade-commit>

# Rebuild frontend
# Deploy reverted frontend image
docker service update \
  --image ghcr.io/utmstack/utmstack/frontend:<previous-tag> \
  frontend
```

**Estimated time:** 30 seconds  
**Impact:** Dashboard charts may be unavailable briefly. No data loss.

---

### Phase 10 Rollback: Bootstrap 5

**Trigger:** Forms broken, modals not working, major visual regressions.

```bash
docker service update \
  --image ghcr.io/utmstack/utmstack/frontend:<previous-tag> \
  frontend
```

**Estimated time:** 30 seconds  
**Impact:** Brief UI disruption. No data loss.

---

## Rollback Decision Criteria

Roll back immediately (within 5 minutes) if ANY of:
- ❌ Authentication fails for any user role
- ❌ Alert list or alert detail shows no data
- ❌ Log ingestion stopped (no new events in OpenSearch)
- ❌ SOAR command execution fails
- ❌ Any health check returns unhealthy

Roll back after investigation (within 1 hour) if:
- ⚠️ Charts render but with incorrect data
- ⚠️ Compliance reports generate but look different
- ⚠️ PDF generation slower than baseline
- ⚠️ Individual feature module has visual issues

Do NOT roll back for:
- ✅ ESLint lint warnings (non-blocking)
- ✅ Deprecation warnings in browser console
- ✅ Slightly different log output format
- ✅ Minor visual differences in non-critical components

---

## Database Rollback Policy

**NEVER needed for these migrations** because:
1. All Liquibase changesets are add-only (new columns with defaults, new tables)
2. Old application code is compatible with new schema (reads existing columns, ignores new ones)
3. Old Docker images do not access new columns (safe to roll back the app without touching data)

**If a Liquibase changeset was accidentally written as destructive:**
1. Do NOT redeploy the old image (it expects the old schema)
2. Create a new Liquibase changeset that reverses the destructive change
3. Deploy a patched image with the reversal changeset
4. This is why all changesets must be reviewed for add-only compliance before merge
