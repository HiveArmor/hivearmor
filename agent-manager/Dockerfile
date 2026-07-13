# Stage 1: Build
FROM golang:1.26-bookworm AS builder

WORKDIR /src

# shared/ is a replace directive dependency of agent-manager/go.mod
COPY shared/ /shared/
COPY agent-manager/ .

RUN go mod tidy && go mod download

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /agent-manager .

# Stage 2: Runtime
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates jq wget netcat-openbsd && rm -rf /var/lib/apt/lists/*

COPY --from=builder /agent-manager /app/agent-manager

# gRPC agent-manager port | HTTPS deps server | Prometheus metrics
EXPOSE 9000 9001 9090

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=10 \
    CMD nc -zw2 localhost 9000 || exit 1

CMD ["/app/agent-manager"]
