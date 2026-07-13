#!/usr/bin/env bash
# =============================================================================
# HiveArmor — Frontend Production Deploy Script
# Builds frontend-v2 and injects it into the running Docker container.
#
# Usage:
#   ./deploy-frontend.sh                  # build + deploy to running container
#   ./deploy-frontend.sh --build-only     # build only, skip docker step
#   ./deploy-frontend.sh --deploy-only    # skip build, deploy existing .next/
#   CONTAINER=my-container-name ./deploy-frontend.sh
#
# Requirements:
#   - Node.js 20+ and npm installed
#   - Docker running with the frontend container already up
#   - Run from the repo root (where frontend-v2/ lives)
# =============================================================================

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
FRONTEND_DIR="${FRONTEND_DIR:-$(cd "$(dirname "$0")/frontend-v2" && pwd)}"
CONTAINER="${CONTAINER:-local-dev-frontend-v2-1}"
BUILD_ONLY=false
DEPLOY_ONLY=false

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[deploy]${NC} $*"; }
success() { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()    { echo -e "${YELLOW}[deploy]${NC} $*"; }
die()     { echo -e "${RED}[deploy] ERROR:${NC} $*" >&2; exit 1; }

# ── Argument parsing ──────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --build-only)  BUILD_ONLY=true ;;
    --deploy-only) DEPLOY_ONLY=true ;;
    *) die "Unknown argument: $arg" ;;
  esac
done

# ── Preflight ─────────────────────────────────────────────────────────────────
[[ -d "$FRONTEND_DIR" ]] || die "Frontend directory not found: $FRONTEND_DIR"

if [[ "$DEPLOY_ONLY" == false ]]; then
  command -v node >/dev/null 2>&1 || die "Node.js not found. Install Node 20+ first."
  command -v npm  >/dev/null 2>&1 || die "npm not found."
  NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
  NODE_MAJOR="${NODE_VER%%.*}"
  [[ "$NODE_MAJOR" -ge 18 ]] || die "Node.js 18+ required (found $NODE_VER)"
fi

if [[ "$BUILD_ONLY" == false ]]; then
  command -v docker >/dev/null 2>&1 || die "Docker not found or not running."
  docker info >/dev/null 2>&1      || die "Docker daemon is not running."
  docker inspect "$CONTAINER" >/dev/null 2>&1 \
    || die "Container '$CONTAINER' not found. Is the stack running?\n  cd local-dev && docker compose up -d"
fi

# ── Step 1: Install dependencies ──────────────────────────────────────────────
if [[ "$DEPLOY_ONLY" == false ]]; then
  info "Installing npm dependencies..."
  cd "$FRONTEND_DIR"
  npm ci --prefer-offline --no-audit --no-fund 2>&1 | grep -v "^npm warn" || true
  success "Dependencies installed."

  # ── Step 2: Production build ─────────────────────────────────────────────
  info "Building production bundle (Next.js standalone)..."
  npm run build 2>&1 | grep -E "✓|error occurred|Error|Failed|Generating" | grep -v "^ERROR: failed to copy trust" || true

  STANDALONE="$FRONTEND_DIR/.next/standalone"
  [[ -d "$STANDALONE" ]] || die "Build failed — .next/standalone not found. Check build output above."
  success "Build complete."
fi

# ── Step 3: Deploy into container ────────────────────────────────────────────
if [[ "$BUILD_ONLY" == false ]]; then
  cd "$FRONTEND_DIR"
  STANDALONE="$FRONTEND_DIR/.next/standalone"
  [[ -d "$STANDALONE" ]] || die "No build found at $STANDALONE. Run without --deploy-only first."

  info "Deploying to container: $CONTAINER"

  info "  → Copying standalone server..."
  docker cp "$STANDALONE/." "$CONTAINER":/app/

  info "  → Copying static assets..."
  docker cp "$FRONTEND_DIR/.next/static/." "$CONTAINER":/app/.next/static/

  info "  → Copying public assets..."
  docker cp "$FRONTEND_DIR/public/." "$CONTAINER":/app/public/

  info "  → Restarting container..."
  docker restart "$CONTAINER" >/dev/null

  # Wait for health
  info "  → Waiting for container to become healthy..."
  ATTEMPTS=0
  until docker exec "$CONTAINER" wget -qO- http://127.0.0.1:3000/login >/dev/null 2>&1; do
    ATTEMPTS=$((ATTEMPTS + 1))
    [[ $ATTEMPTS -ge 30 ]] && die "Container did not become healthy after 30s. Check: docker logs $CONTAINER"
    sleep 1
  done

  success "Frontend deployed and healthy."
  echo ""
  echo -e "  ${GREEN}UI is live at:${NC} http://localhost:3000"
  echo -e "  ${CYAN}Container:${NC}     $CONTAINER"
  echo ""
fi
