#!/usr/bin/env bash
# check-tenant-context-clear.sh
# Fails the build when any compliance-module Java file calls TenantContext.set(
# without a matching TenantContext.clear() inside a finally block.
set -euo pipefail

COMPLIANCE_DIR="src/main/java/com/hivearmor/service/compliance"
ERRORS=0

while IFS= read -r -d '' file; do
    if grep -q "TenantContext.set(" "$file"; then
        if ! grep -q "finally" "$file" || ! grep -q "TenantContext.clear()" "$file"; then
            echo "ERROR: $file contains TenantContext.set( but lacks finally { TenantContext.clear(); }"
            ERRORS=$((ERRORS + 1))
        fi
    fi
done < <(find "$COMPLIANCE_DIR" -name "*.java" -print0)

if [ "$ERRORS" -gt 0 ]; then
    echo "FAIL: $ERRORS file(s) violate the TenantContext.set/clear invariant."
    exit 1
fi

echo "OK: TenantContext.set/clear invariant satisfied."
exit 0
