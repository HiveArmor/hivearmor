# S05-T01 — Fix Eventprocessor Plugin Crash Cascade

**Sprint:** 5 (Reliability + Performance)  
**Severity:** CRITICAL — Any plugin crash kills ALL log processing  
**Issue ID:** PLUGIN-01  
**Dependencies:** None  
**Estimated time:** 4 hours

---

## Context

`eventprocessor/entrypoint.sh` uses `wait -n` (wait for ANY child to exit). When one plugin crashes (e.g., geolocation plugin segfaults), `wait -n` returns and the bash script exits, killing the entire container including all working plugins. The entire log processing pipeline goes offline due to a single plugin failure.

**Affected file:** `eventprocessor/entrypoint.sh`

---

## What to Read First

1. `eventprocessor/entrypoint.sh` — read the entire file, understand how plugins are launched and how the script waits
2. `eventprocessor/Dockerfile` — what base image is used (alpine, debian, etc.)
3. `plugins/` — list all plugin directories to know what needs supervision

---

## Implementation Steps

### Option A (Recommended): Use supervisord for process supervision

Supervisord is the industry-standard approach for multi-process containers. It automatically restarts failed processes without affecting sibling processes.

#### Step 1: Install supervisord in the Dockerfile

In `eventprocessor/Dockerfile`, add supervisord installation:

```dockerfile
# For Alpine:
RUN apk add --no-cache supervisor

# For Debian/Ubuntu:
# RUN apt-get install -y supervisor
```

#### Step 2: Create supervisord configuration

Create: `eventprocessor/supervisord.conf`

```ini
[supervisord]
nodaemon=true
logfile=/var/log/supervisord.log
logfile_maxbytes=10MB
logfile_backups=2
loglevel=info
pidfile=/var/run/supervisord.pid

[unix_http_server]
file=/var/run/supervisor.sock
chmod=0700

[supervisorctl]
serverurl=unix:///var/run/supervisor.sock

[rpcinterface:supervisor]
supervisor.rpcinterface_factory = supervisor.rpcinterface:make_main_rpcinterface

# Each plugin gets its own process group
[program:inputs]
command=/usr/local/bin/inputs
autorestart=true
startretries=10
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
startsecs=5

[program:geolocation]
command=/usr/local/bin/geolocation
autorestart=true
startretries=10
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
startsecs=5

[program:events]
command=/usr/local/bin/events
autorestart=true
startretries=10
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
priority=1
startsecs=10  # Give OpenSearch time to be ready

[program:compliance-orchestrator]
command=/usr/local/bin/compliance-orchestrator
autorestart=true
startretries=5
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
startsecs=15

# Add remaining plugins here (check eventprocessor/entrypoint.sh for the full list)
```

#### Step 3: Update `entrypoint.sh` to use supervisord

Replace the current entrypoint content:

```bash
#!/bin/bash
set -e

echo "Starting ArmorSight event processor with supervisord..."

# Run supervisord — it manages all plugins and auto-restarts on crash
exec supervisord -c /etc/supervisord.conf
```

#### Step 4: Update Dockerfile to use new entrypoint

```dockerfile
COPY eventprocessor/supervisord.conf /etc/supervisord.conf
COPY eventprocessor/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
CMD ["/entrypoint.sh"]
```

### Option B (Simpler, no new dependency): Per-plugin restart loops

If supervisord adds unwanted complexity:

```bash
#!/bin/bash

# Restart wrapper: runs a command in a loop with backoff
restart_on_crash() {
    local name="$1"
    shift
    local delay=1
    while true; do
        echo "[supervisor] Starting $name..."
        "$@"
        EXIT_CODE=$?
        echo "[supervisor] $name exited with code $EXIT_CODE. Restarting in ${delay}s..."
        sleep $delay
        delay=$(( delay < 30 ? delay * 2 : 30 ))  # exponential backoff, cap at 30s
    done
}

restart_on_crash "inputs" /usr/local/bin/inputs &
restart_on_crash "geolocation" /usr/local/bin/geolocation &
restart_on_crash "events" /usr/local/bin/events &
restart_on_crash "compliance-orchestrator" /usr/local/bin/compliance-orchestrator &

# Wait for ANY child to die (but since they're all in restart loops, this blocks forever)
# If the bash parent dies, all children die too — use tini/dumb-init to handle signals
wait
```

**Go with Option A (supervisord) for production.** Option B is a quick workaround.

### Step 5: Add supervisorctl health endpoint to backend

After supervisord is running, add a backend endpoint to query plugin status:

In the backend, create a `PluginHealthService` that calls the supervisord XML-RPC interface or the compliance orchestrator health endpoint. Wire this to an admin API: `GET /api/plugin-health`.

---

## Test Commands

```bash
# Build the updated image:
cd /Users/encryptshell/GIT/UTMStack-11
docker build -f eventprocessor/Dockerfile -t armorsight-eventprocessor:supervised .

# Run and verify supervisord starts all plugins:
docker run --rm armorsight-eventprocessor:supervised &
sleep 10
docker exec <container_id> supervisorctl status
# Expected: all plugins showing RUNNING

# Simulate a plugin crash:
docker exec <container_id> pkill -f geolocation
sleep 5
docker exec <container_id> supervisorctl status geolocation
# Expected: RUNNING (auto-restarted)

# Verify other plugins continue running during the crash:
docker exec <container_id> supervisorctl status inputs
# Expected: RUNNING (not affected by geolocation crash)
```

---

## Acceptance Criteria

- [ ] Each plugin runs as an independent supervised process
- [ ] A crash in one plugin does NOT kill other plugins
- [ ] Crashed plugins are automatically restarted (up to `startretries` limit)
- [ ] Supervisord logs to stdout/stderr (visible in `docker-compose logs`)
- [ ] `docker-compose logs eventprocessor` shows plugin start messages
- [ ] If a plugin fails `startretries` times in a row, it enters FATAL state and an alert is logged
- [ ] The `wait -n` pattern that causes cascade is removed from entrypoint.sh
