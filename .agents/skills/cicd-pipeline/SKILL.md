---
name: cicd-pipeline
description: GitHub Actions CI/CD patterns for HiveArmor — multi-service monorepo pipelines, Docker multi-stage builds, ghcr.io publishing, security scanning, deployment gates. Use when editing .github/workflows/.
metadata:
  type: skill
  source: tomas-u/Codex-skills + alirezarezvani/Codex-skills devops (adapted)
---

# CI/CD Pipeline Patterns — HiveArmor

## Project Context
- Images: `ghcr.io/hivearmor/<service>` (CI), `hivearmor/<service>` (local)
- Main workflow: `.github/workflows/deployment-pipeline.yml`
- Go services with `replace` directives — must build from repo root
- `REPLACE_KEY` / `AGENT_SECRET_PREFIX` required for agent/collector builds

## Monorepo Job Structure
```yaml
name: HiveArmor Deployment Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  # 1. Detect what changed — skip unchanged service builds
  changes:
    runs-on: ubuntu-latest
    outputs:
      backend: ${{ steps.filter.outputs.backend }}
      frontend: ${{ steps.filter.outputs.frontend }}
      event-processor: ${{ steps.filter.outputs.event-processor }}
      agent: ${{ steps.filter.outputs.agent }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            backend:
              - 'backend/**'
            frontend:
              - 'frontend-v2/**'
            event-processor:
              - 'event-processor/**'
              - 'plugins/**'
            agent:
              - 'agent/**'
              - 'shared/**'
```

## Go Service Build (event-processor / agent-manager)
```yaml
  build-event-processor:
    needs: changes
    if: needs.changes.outputs.event-processor == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version-file: 'event-processor/go.mod'
          cache-dependency-path: 'event-processor/go.sum'
      
      - name: Run tests
        working-directory: event-processor
        run: go test ./... -race -coverprofile=coverage.out
      
      - name: Build Docker image
        uses: docker/build-push-action@v6
        with:
          context: .           # MUST be repo root (replace directives)
          file: event-processor/Dockerfile
          push: ${{ github.ref == 'refs/heads/main' }}
          tags: ghcr.io/hivearmor/event-processor:${{ github.sha }}
```

## Agent Build (requires AGENT_SECRET_PREFIX ldflags)
```yaml
  build-agent:
    needs: changes
    if: needs.changes.outputs.agent == 'true'
    steps:
      - name: Build agent
        env:
          AGENT_SECRET_PREFIX: ${{ secrets.AGENT_SECRET_PREFIX }}
        run: |
          go build -ldflags="-X main.replaceKey=${AGENT_SECRET_PREFIX}" \
            -o hivearmor_agent_service ./agent/
```
**Critical:** Never build agent without `AGENT_SECRET_PREFIX` — authentication will fail silently.

## Docker Multi-Stage Build Pattern
```dockerfile
# Stage 1: Build
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /service .

# Stage 2: Runtime — minimal image
FROM gcr.io/distroless/static:nonroot
COPY --from=builder /service /service
USER nonroot:nonroot  # never run as root
ENTRYPOINT ["/service"]
```

## Security Scanning Gates
```yaml
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      # Container vulnerability scan
      - name: Run Trivy
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'  # fail on CRITICAL/HIGH
      
      # Go vulnerability check
      - name: govulncheck
        uses: golang/govulncheck-action@v1
        with:
          go-version-file: event-processor/go.mod
          
      # Java dependency scan
      - name: Maven dependency check
        run: mvn -s settings.xml -B dependency:check -DfailBuildOnCVSS=7
        working-directory: backend
        env:
          MAVEN_TK: ${{ secrets.MAVEN_TK }}
```

## Required Secrets
| Secret | Used by | Description |
|---|---|---|
| `MAVEN_TK` | backend build | GitHub PAT with `read:packages` |
| `AGENT_SECRET_PREFIX` | agent build | ldflags REPLACE_KEY |
| `MAXMIND_LICENSE_KEY` | CI GeoLite2 download | MaxMind license |
| `GHCR_TOKEN` | image push | GitHub Container Registry |

## Branch Protection Rules (enforce in repo settings)
- Require CI to pass before merge to `main`
- Require security scan to pass
- No force push to `main`
- Require 1 approval for PRs touching `backend/` or `event-processor/`
