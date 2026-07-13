# OWN-02: Own Agent Manager (Already Have Source)

**Priority:** Tier 6 — Strategic  
**Effort:** 2 weeks  
**Impact:** 🟠 High — source already exists in agent-manager/

---

## Current Situation

You ALREADY have the source code in `/agent-manager/`. The upstream image is just a pre-built version of this code. You just need to:
1. Build it as a local Docker image
2. Replace the upstream image reference in docker-compose

---

## Steps

### 1. Build the local image
```bash
cd /agent-manager
docker build -t nilachakra/agent-manager:local .
```

### 2. Update docker-compose
```yaml
# Before:
image: ghcr.io/utmstack/utmstack/agent-manager:${UTMSTACK_TAG}

# After:
image: nilachakra/agent-manager:local
build:
  context: ./agent-manager
  dockerfile: Dockerfile
```

### 3. Verify it works
- Start docker-compose
- Register a test agent
- Confirm logs flow through

### 4. Backend gRPC fix (SEC-04)
Once you own agent-manager, add mutual TLS:
- Generate self-signed CA cert
- Generate server cert for agent-manager
- Generate client cert for backend
- Configure both sides with certs

---

## What to Enhance in Agent Manager

Once you own it:
- Add Prometheus metrics endpoint (`/metrics`)
- Add agent health check endpoint (`/health`)
- Add per-agent log rate limiting (prevent one noisy agent from flooding)
- Add agent authentication (currently key-based; add cert-based as option)
- Expose agent connection count to backend API

---

## 📋 SESSION PROMPT

```
I want to implement OWN-02: Build and own the Agent Manager for ArmorSight SIEM.

Project context:
- Root: /Users/encryptshell/GIT/UTMStack-11/
- agent-manager/ contains Go source code for the agent manager
- Currently using upstream Docker image: ghcr.io/utmstack/utmstack/agent-manager

Task 1: Build local Docker image
1. Read /agent-manager/Dockerfile
2. Read /agent-manager/main.go  
3. Read /agent-manager/go.mod
4. Build: docker build -t nilachakra/agent-manager:local ./agent-manager
5. If build fails, diagnose and fix

Task 2: Update docker-compose
1. Read /local-dev/docker-compose.yml
2. Replace agent-manager image reference with local build
3. Add build: context to allow docker-compose build to work

Task 3: Verify
1. Bring up docker-compose
2. Check agent-manager logs
3. Confirm backend can still connect (check gRPC connection in backend logs)

Task 4: Add Prometheus metrics (bonus if time allows)
- Add /metrics endpoint to agent-manager
- Expose: connected_agents_count, logs_received_total, logs_per_second

Do NOT modify any gRPC proto files or agent communication protocol — just build and wire it up.
```
