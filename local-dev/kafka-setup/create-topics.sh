#!/bin/bash
set -e

BROKER=${KAFKA_BROKER:-localhost:19092}

echo "Creating HiveArmor Kafka topics on $BROKER..."

rpk topic create hivearmor.raw.events \
  --brokers "$BROKER" \
  --partitions 12 \
  --replicas 1 \
  --topic-config retention.ms=86400000

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
