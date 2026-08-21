#!/bin/bash
# Rebuild backend Docker container with latest WAR
set -e

echo ">>> Stopping backend container..."
docker compose stop backend

echo ">>> Removing backend container..."
docker compose rm -f backend

echo ">>> Removing old backend image..."
docker rmi hivearmor/backend:local 2>/dev/null || true

echo ">>> Rebuilding backend image (no cache)..."
docker compose build --no-cache backend

echo ">>> Starting backend container..."
docker compose up -d backend

echo ">>> Waiting for backend health check..."
for i in $(seq 1 30); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' local-dev-backend-1 2>/dev/null || echo "starting")
  echo "  [$i/30] Status: $STATUS"
  if [ "$STATUS" = "healthy" ]; then
    echo ">>> Backend is healthy!"
    exit 0
  fi
  sleep 5
done

echo ">>> Backend did not become healthy in 150s, checking logs..."
docker logs local-dev-backend-1 --tail 20
