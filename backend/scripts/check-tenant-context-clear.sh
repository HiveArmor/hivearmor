#!/usr/bin/env bash
# check-tenant-context-clear.sh
# Fails with exit code 1 if any Java file under com.hivearmor.service.compliance
# contains TenantContext.set( without a matching TenantContext.clear() nearby.
set -euo pipefail

SCAN_DIR="${1:-src/main/java/com/hivearmor/service/compliance}"
ERRORS=0

while IFS= read -r -d '' file; do
    if grep -q "TenantContext\.set(" "$file"; then
        if ! grep -q "TenantContext\.clear()" "$file"; then
            echo "FAIL: $file contains TenantContext.set( but no TenantContext.clear()" >&2
            ERRORS=$((ERRORS + 1))
        fi
    fi
done < <(find "$SCAN_DIR" -name "*.java" -print0 2>/dev/null)

if [ "$ERRORS" -gt 0 ]; then
    echo "tenant-context-clear-check: $ERRORS file(s) failed the invariant check." >&2
    exit 1
fi

echo "tenant-context-clear-check: all compliance service files pass the TenantContext invariant."
exit 0
