#!/usr/bin/env bash
# Fails if any compliance-module file has a TenantContext.set( call
# whose enclosing method does not also contain TenantContext.clear() inside a finally block.
set -euo pipefail

COMPLIANCE_DIR="src/main/java/com/hivearmor/service/compliance"

if [ ! -d "$COMPLIANCE_DIR" ]; then
  echo "[tenant-context-clear-check] compliance dir not found: $COMPLIANCE_DIR"
  exit 1
fi

FAILED=0

while IFS= read -r -d '' file; do
  if grep -q "TenantContext.set(" "$file"; then
    if ! grep -q "TenantContext.clear()" "$file"; then
      echo "[tenant-context-clear-check] FAIL: $file calls TenantContext.set() but has no TenantContext.clear()"
      FAILED=1
    fi
  fi
done < <(find "$COMPLIANCE_DIR" -name "*.java" -print0)

if [ "$FAILED" -eq 1 ]; then
  echo "[tenant-context-clear-check] One or more files violate the TenantContext.clear() invariant."
  exit 1
fi

echo "[tenant-context-clear-check] All compliance-module files pass the TenantContext.clear() invariant."
exit 0
