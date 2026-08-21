---
name: docker-patterns
description: Docker multi-stage build patterns, image hardening, Docker Compose for local dev, container security. Use when editing Dockerfiles or local-dev/docker-compose.yml.
metadata:
  type: skill
  source: alirezarezvani/Codex-skills devops (adapted for HiveArmor)
---

# Docker Patterns — HiveArmor

## Multi-Stage Build — Go Services
```dockerfile
# GOOD — distroless, non-root, minimal attack surface
FROM golang:1.25-alpine AS builder
ARG REPLACE_KEY=""
WORKDIR /repo
# Copy entire repo root first (needed for replace directives)
COPY . .
WORKDIR /repo/event-processor
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-w -s -X main.replaceKey=${REPLACE_KEY}" \
    -o /event-processor .

FROM gcr.io/distroless/static:nonroot
COPY --from=builder /event-processor /event-processor
COPY --from=builder /repo/event-processor/entrypoint.sh /entrypoint.sh
USER nonroot:nonroot
ENTRYPOINT ["/event-processor"]
```

## Multi-Stage Build — Java/Spring Boot
```dockerfile
FROM eclipse-temurin:17-jdk-alpine AS builder
WORKDIR /app
COPY settings.xml .
COPY pom.xml .
# Cache dependencies layer separately
RUN --mount=type=cache,target=/root/.m2 \
    mvn -s settings.xml -B dependency:go-offline
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    mvn -s settings.xml -B -Pprod clean package -DskipTests

FROM eclipse-temurin:17-jre-alpine
RUN addgroup -S hivearmor && adduser -S hivearmor -G hivearmor
WORKDIR /app
COPY --from=builder /app/target/hivearmor.war .
USER hivearmor
EXPOSE 8080
ENTRYPOINT ["java", \
    "-XX:+UseContainerSupport", \
    "-XX:MaxRAMPercentage=75.0", \
    "-jar", "hivearmor.war"]
```

## Security Hardening Rules
- **Never `USER root`** in runtime stage
- **Pin base image versions** — never `latest` tag
- **Use distroless or alpine** — no shell in production images
- **No secrets in Dockerfile** — use build args or env vars at runtime
- **Health check on every service**:
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget -qO- http://localhost:8080/actuator/health || exit 1
```

## Image Size Anti-Patterns
```dockerfile
# BAD — dev dependencies in final image
FROM node:20
COPY . .
RUN npm install  # includes devDependencies
CMD ["node", "server.js"]

# GOOD — production deps only, non-root
FROM node:20-alpine AS builder
COPY package*.json .
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
RUN adduser -D appuser
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER appuser
CMD ["node", "dist/server.js"]
```

## Local Dev Docker Compose Patterns
```yaml
# local-dev/docker-compose.yml conventions:
# - Use named volumes for databases (not bind mounts)
# - Environment variables from .env file (copy from .env.example)
# - Health checks on all dependencies
# - No hardcoded credentials — use ${VARIABLE} from .env

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: ${DB_PASS:-localdev123!}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
```

## Common Fixes for HiveArmor Dockerfiles
1. Event processor: build context must be repo root (Go replace directives)
2. Backend: `MAVEN_TK` must be injected — do not bake into image
3. Agent: `REPLACE_KEY` must be passed as build arg — never hardcode
4. All services: add `HEALTHCHECK` instruction
5. All services: confirm `USER` is non-root before shipping

## Debugging Container Issues
```bash
# Check if running as root (should not be)
docker exec <container> id

# Check actual exposed ports
docker inspect <container> | python3 -c "import sys,json; c=json.load(sys.stdin); print(json.dumps(c[0]['NetworkSettings']['Ports'], indent=2))"

# Exec into distroless (no shell — use debug variant for troubleshooting only)
docker run --rm -it --entrypoint sh gcr.io/distroless/static:debug
```
