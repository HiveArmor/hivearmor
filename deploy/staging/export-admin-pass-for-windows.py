# Sync HiveArmor admin password from staging ADMIN_BOOTSTRAP into Windows secret file.
# Never prints password contents. Run on staging Linux as ubuntu/sudo as needed.
from __future__ import annotations

import re
import sys
from pathlib import Path

BOOTSTRAP = Path("/home/ubuntu/HiveArmor-v1/deploy/staging/ADMIN_BOOTSTRAP.txt")
OUT = Path("/tmp/ha-windows-admin.pass")


def main() -> int:
    text = BOOTSTRAP.read_text(encoding="utf-8")
    pw = None
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        low = s.lower()
        if low.startswith("password") and ("=" in s or ":" in s):
            pw = re.split(r"[:=]", s, 1)[1].strip().strip("\"'")
            break
    if pw is None:
        print("parse_failed", file=sys.stderr)
        return 2
    OUT.write_text(pw + "\n", encoding="utf-8")
    OUT.chmod(0o600)
    print("wrote", str(OUT))
    print("pw_len", len(pw))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
