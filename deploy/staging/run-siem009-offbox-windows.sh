#!/usr/bin/env bash
set -euo pipefail
# SIEM-009: copy latest off-volume backup stamp to a second host (Windows staging VM).
# Requires SSH to Windows with the staging PEM. Does not print dump contents.

STAGING="$(cd "$(dirname "$0")" && pwd)"
OFFHOST_ROOT="${OFFHOST_ROOT:-/var/backups/hivearmor-offhost}"
WIN_HOST="${WIN_HOST:-54.160.142.254}"
WIN_USER="${WIN_USER:-Administrator}"
WIN_DEST="${WIN_DEST:-C:/ha-agent-test/offbox-backups}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/hivearmor-staging-aws.pem}"
REPORT="${REPORT_FILE:-/var/tmp/hivearmor-siem009-offbox-copy.json}"

LATEST="$(ls -1dt "$OFFHOST_ROOT"/*/ 2>/dev/null | head -1 || true)"
if [[ -z "$LATEST" ]]; then
  echo "no offhost stamp under $OFFHOST_ROOT — run run-siem009-backup-restore.sh first" >&2
  exit 2
fi
STAMP="$(basename "$LATEST")"
echo "offhost_stamp=$STAMP"

ssh -i "$SSH_KEY" -o BatchMode=yes -o IdentitiesOnly=yes "${WIN_USER}@${WIN_HOST}" \
  "powershell -NoProfile -Command \"New-Item -ItemType Directory -Force -Path '$WIN_DEST\\$STAMP' | Out-Null\""

# Tar the stamp and scp (avoids many small files / permissions noise)
TAR="/tmp/ha-offbox-${STAMP}.tar.gz"
sudo tar -C "$OFFHOST_ROOT" -czf "$TAR" "$STAMP"
sudo chmod 644 "$TAR"
scp -i "$SSH_KEY" -o BatchMode=yes -o IdentitiesOnly=yes "$TAR" \
  "${WIN_USER}@${WIN_HOST}:C:/ha-agent-test/ha-offbox-${STAMP}.tar.gz"
rm -f "$TAR"

ssh -i "$SSH_KEY" -o BatchMode=yes -o IdentitiesOnly=yes "${WIN_USER}@${WIN_HOST}" \
  "powershell -NoProfile -Command \"
    \$ErrorActionPreference='Stop'
    \$dest='$WIN_DEST\\$STAMP'
    New-Item -ItemType Directory -Force -Path \$dest | Out-Null
    tar -xzf C:\\ha-agent-test\\ha-offbox-${STAMP}.tar.gz -C '$WIN_DEST'
    Remove-Item -Force C:\\ha-agent-test\\ha-offbox-${STAMP}.tar.gz
    Get-ChildItem \$dest | Select-Object Name,Length | Format-Table -AutoSize | Out-String -Width 200
  \""

python3 - "$REPORT" "$STAMP" "$WIN_HOST" "$WIN_DEST" <<'PY'
import json, sys
from pathlib import Path
report = {
    "gate": "siem009-offbox-second-host",
    "stamp": sys.argv[2],
    "windowsHost": sys.argv[3],
    "windowsDest": sys.argv[4] + "\\" + sys.argv[2],
    "limitations": [
        "Second host is the Windows ACC-02 VM in the same VPC — not WORM/object-store",
        "Copy only; restore onto a brand-new Linux VM remains open",
        "Not PRODUCTION READY",
    ],
    "status": "script-complete",
}
Path(sys.argv[1]).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
Path(sys.argv[1]).chmod(0o600)
print("SIEM009_OFFBOX_REPORT=" + sys.argv[1])
print("status=script-complete")
PY
