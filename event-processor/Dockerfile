FROM golang:1.26 AS builder

WORKDIR /build

# Build the engine
COPY event-processor/go.mod event-processor/go.sum ./engine/
WORKDIR /build/engine
RUN go mod download

COPY event-processor/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/engine .

# Build companion plugins
WORKDIR /build
COPY plugins/config/go.mod plugins/config/go.sum ./config/
WORKDIR /build/config
RUN go mod download
COPY plugins/config/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/com.hivearmor.config.plugin .

WORKDIR /build
COPY plugins/events/go.mod plugins/events/go.sum ./events/
WORKDIR /build/events
RUN go mod download
COPY plugins/events/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/com.hivearmor.events.plugin .

WORKDIR /build
COPY plugins/alerts/go.mod plugins/alerts/go.sum ./alerts/
WORKDIR /build/alerts
RUN go mod download
COPY plugins/alerts/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/com.hivearmor.alerts.plugin .

WORKDIR /build
COPY plugins/geolocation/go.mod plugins/geolocation/go.sum ./geolocation/
WORKDIR /build/geolocation
RUN go mod download
COPY plugins/geolocation/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/com.hivearmor.geolocation.plugin .

WORKDIR /build
COPY plugins/compliance-orchestrator/go.mod plugins/compliance-orchestrator/go.sum ./compliance-orchestrator/
WORKDIR /build/compliance-orchestrator
RUN go mod download
COPY plugins/compliance-orchestrator/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/com.hivearmor.compliance-orchestrator.plugin .

WORKDIR /build
COPY plugins/inputs/go.mod plugins/inputs/go.sum ./inputs/
WORKDIR /build/inputs
RUN go mod download
COPY plugins/inputs/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/com.hivearmor.inputs.plugin .

# --- Runtime image ---
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip supervisor && rm -rf /var/lib/apt/lists/*

COPY --from=builder /out/engine                                        /usr/local/bin/engine
COPY --from=builder /out/com.hivearmor.config.plugin                   /usr/local/bin/com.hivearmor.config.plugin
COPY --from=builder /out/com.hivearmor.events.plugin                   /usr/local/bin/com.hivearmor.events.plugin
COPY --from=builder /out/com.hivearmor.alerts.plugin                   /usr/local/bin/com.hivearmor.alerts.plugin
COPY --from=builder /out/com.hivearmor.geolocation.plugin              /usr/local/bin/com.hivearmor.geolocation.plugin
COPY --from=builder /out/com.hivearmor.compliance-orchestrator.plugin  /usr/local/bin/com.hivearmor.compliance-orchestrator.plugin
COPY --from=builder /out/com.hivearmor.inputs.plugin                   /usr/local/bin/com.hivearmor.inputs.plugin

COPY event-processor/entrypoint.sh /entrypoint.sh
COPY event-processor/wait-for-socket.sh /wait-for-socket.sh
RUN chmod +x /entrypoint.sh /wait-for-socket.sh

# Bundle default GeoLite2 CSVs (can be overridden by volume mount at runtime)
COPY event-processor/geolocation-bundle/ /workdir/geolocation/

# Bundle built-in detection rules (including graph_offense rules)
COPY event-processor/builtin-rules/ /workdir/rules/

EXPOSE 8000 8090 9003 8094 4317 4318 50051

ENTRYPOINT ["/entrypoint.sh"]
