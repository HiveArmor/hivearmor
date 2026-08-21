# Stage 1: Build
FROM golang:1.26-bookworm AS builder

WORKDIR /src

# shared/ is a replace directive dependency of agent-manager/go.mod
COPY shared/ /shared/
COPY agent-manager/go.mod agent-manager/go.sum ./

# Keep dependency resolution reproducible and independently cacheable from
# source edits. HTTP/1.1 avoids intermittent proxy HTTP/2 stream resets seen
# during clean release builds; go.sum remains the authority and is not mutated.
RUN --mount=type=cache,target=/go/pkg/mod \
    GODEBUG=http2client=0 go mod download

COPY agent-manager/ .

RUN --mount=type=cache,target=/go/pkg/mod \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /agent-manager .

# Stage 2: Runtime
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates jq wget netcat-openbsd && rm -rf /var/lib/apt/lists/*

COPY --from=builder /agent-manager /app/agent-manager

# gRPC agent-manager port | HTTPS deps server | Prometheus metrics
EXPOSE 9000 9001 9090

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=10 \
    CMD nc -zw2 localhost 9000 || exit 1

CMD ["/app/agent-manager"]
