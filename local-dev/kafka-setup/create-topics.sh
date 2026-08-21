#!/bin/bash
set -e

BROKER=${KAFKA_BROKER:-localhost:19092}

echo "Waiting for Redpanda cluster to be healthy..."
for i in $(seq 1 15); do
  rpk cluster health --brokers "$BROKER" 2>&1 | grep -q "Healthy.*true" && break
  echo "  Attempt $i/15 — Redpanda not ready, waiting 3s..."
  sleep 3
done

echo "Creating HiveArmor Kafka topics on $BROKER..."

MAX_BYTES=4194304

rpk topic create hivearmor.raw.events \
  --brokers "$BROKER" \
  --partitions 12 \
  --replicas 1 \
  --topic-config retention.ms=86400000 \
  --topic-config max.message.bytes=$MAX_BYTES

rpk topic create hivearmor.raw.events.quarantine \
  --brokers "$BROKER" \
  --partitions 4 \
  --replicas 1 \
  --topic-config retention.ms=604800000 \
  --topic-config max.message.bytes=$MAX_BYTES

rpk topic create hivearmor.raw.events.retry \
  --brokers "$BROKER" \
  --partitions 4 \
  --replicas 1 \
  --topic-config retention.ms=86400000 \
  --topic-config max.message.bytes=$MAX_BYTES

rpk topic create hivearmor.processed.events \
  --brokers "$BROKER" \
  --partitions 12 \
  --replicas 1 \
  --topic-config retention.ms=86400000

rpk topic create hivearmor.alerts \
  --brokers "$BROKER" \
  --partitions 4 \
  --replicas 1 \
  --topic-config retention.ms=604800000

rpk topic create hivearmor.compliance.evidence \
  --brokers "$BROKER" \
  --partitions 4 \
  --replicas 1 \
  --topic-config retention.ms=86400000

echo "Done. Topics created:"
rpk topic list --brokers "$BROKER"
