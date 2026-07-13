# S06-T08 — Add Docker Health Checks to frontend-v2 and web-pdf

**Sprint:** 6 (Tech Debt)
**Severity:** LOW
**Issue ID:** DEBT-07
**Dependencies:** None
**Estimated time:** 2 hours

---

## Context

`frontend-v2` and `web-pdf` are the only services in `local-dev/docker-compose.yml` without `healthcheck:` directives. This means Docker cannot detect when these services fail to start, and dependent services (e.g., the backend, which needs the PDF service for report generation) can start before their dependency is ready. This causes intermittent "works after a second docker-compose up" bugs.

All other services already have healthchecks:
- `postgres` — `pg_isready`
- `opensearch` — curl to `/_cluster/health`
- `redis` — `redis-cli ping`
- `agentmanager` — `nc -z localhost 9000`
- `backend` — curl to `/api/healthcheck`
- `eventprocessor` — `nc -z localhost 8000`
- `user-auditor` — curl to `/actuator/health`
- `frontend` (Angular) — curl to `http://localhost:80/`

The `web-pdf` service is a Selenium-based PDF renderer — it exposes an HTTP port that we can check. The `frontend-v2` service is a Next.js app that serves at port 3000.

---

## What to Read First

Before editing anything, read these files completely:

1. `local-dev/docker-compose.yml` — the entire file, to understand the existing healthcheck format used by other services and to find the exact service names for `frontend-v2` and `web-pdf`
2. `web-pdf/` directory — look for `Dockerfile` or `entrypoint.sh` to understand what port and path the web-pdf service exposes; specifically check if there's a `/health` or `/status` endpoint

---

## Implementation Steps

### Step 1: Determine web-pdf's health endpoint

Run this to inspect the web-pdf container while it's running:

```bash
# Find what port web-pdf listens on
docker inspect $(docker ps -q --filter name=web-pdf) \
  --format '{{json .NetworkSettings.Ports}}' 2>/dev/null | jq '.'

# Try common health paths
curl -sf http://localhost:<PORT>/ && echo "root OK"
curl -sf http://localhost:<PORT>/health && echo "health OK"
curl -sf http://localhost:<PORT>/api/health && echo "api/health OK"
```

If no health endpoint exists, use a TCP check via `nc -z` or check the root path returns HTTP 200.

### Step 2: Add healthcheck to frontend-v2 in docker-compose.yml

In `local-dev/docker-compose.yml`, find the `frontend-v2` service block and add a `healthcheck:` section. Match the indentation style of existing services.

Pattern to add (adjust port if frontend-v2 does not use 3000):

```yaml
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:3000/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
```

The `start_period: 60s` gives Next.js time to do its initial compilation before health failures count.

### Step 3: Add healthcheck to web-pdf in docker-compose.yml

Find the `web-pdf` service block. If the service has a `/health` endpoint, use:

```yaml
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:<PORT>/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 90s
```

If no HTTP endpoint exists (Selenium headless browser can be slow to start), use a TCP port check:

```yaml
    healthcheck:
      test: ["CMD-SHELL", "nc -z localhost <PORT> || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 120s
```

Use `start_period: 120s` for web-pdf because Selenium/Chrome is notoriously slow to initialize.

### Step 4: Add depends_on health conditions for dependent services (optional improvement)

If the backend service uses web-pdf for report generation, update the `backend` service's `depends_on` to wait for web-pdf to be healthy:

```yaml
  backend:
    depends_on:
      postgres:
        condition: service_healthy
      opensearch:
        condition: service_healthy
      web-pdf:               # add this
        condition: service_healthy
```

Check the existing `depends_on` structure in the backend service and follow the same pattern.

### Step 5: Validate the health checks work

```bash
cd /Users/encryptshell/GIT/UTMStack-11/local-dev

# Bring up the stack
docker compose up -d

# Wait 2 minutes, then check health status of all services
docker compose ps

# Specifically check frontend-v2 and web-pdf
docker inspect $(docker compose ps -q frontend-v2) \
  --format '{{.Name}} — {{.State.Health.Status}}'

docker inspect $(docker compose ps -q web-pdf) \
  --format '{{.Name}} — {{.State.Health.Status}}'

# Both should show "healthy", not "starting" or "unhealthy"
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/local-dev

# Validate docker-compose.yml syntax
docker compose config --quiet && echo "SYNTAX OK"

# Check that both services have healthcheck defined in the parsed config
docker compose config | grep -A5 "frontend-v2:"
docker compose config | grep -A5 "web-pdf:"

# After full stack start (allow 3 min for slow services):
docker compose up -d
sleep 180
docker compose ps --format "table {{.Name}}\t{{.Status}}"

# Both frontend-v2 and web-pdf should show "(healthy)" in the Status column
docker compose ps | grep -E "frontend-v2|web-pdf" | grep "healthy" && echo "PASS" || echo "FAIL"
```

---

## Acceptance Criteria

- [ ] `local-dev/docker-compose.yml` has a `healthcheck:` block for the `frontend-v2` service
- [ ] `local-dev/docker-compose.yml` has a `healthcheck:` block for the `web-pdf` service
- [ ] `docker compose config --quiet` reports no syntax errors
- [ ] After `docker compose up -d`, both `frontend-v2` and `web-pdf` eventually reach `(healthy)` status (allow up to 3 min for startup)
- [ ] `docker compose ps` shows no service as `(unhealthy)` in a healthy stack
- [ ] The `start_period` for `frontend-v2` is at least 60s (Next.js is slow to compile on first start)
- [ ] The `start_period` for `web-pdf` is at least 90s (Selenium/Chrome startup time)
- [ ] Existing service healthchecks are not modified
