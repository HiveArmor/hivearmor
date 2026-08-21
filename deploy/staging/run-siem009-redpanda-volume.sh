#!/usr/bin/env bash
set -euo pipefail
# SIEM-009: prove Redpanda named volume retains topic + high watermark across container recreate.
REPORT="${REPORT_FILE:-/var/tmp/hivearmor-siem009-redpanda-volume.json}"
RP="${RP_CONTAINER:-hivearmor-staging-redpanda-1}"
TOPIC="${RP_TOPIC:-hivearmor.raw.events}"
STAGING="$(cd "$(dirname "$0")" && pwd)"
export HA_RP_REPORT="$REPORT" HA_RP_CTR="$RP" HA_RP_TOPIC="$TOPIC" HA_RP_STAGING="$STAGING"
python3 <<'PY'
from __future__ import annotations
import json, os, subprocess, time
from pathlib import Path

report_path = Path(os.environ["HA_RP_REPORT"])
rp = os.environ["HA_RP_CTR"]
topic = os.environ["HA_RP_TOPIC"]
staging = Path(os.environ["HA_RP_STAGING"])
report: dict[str, object] = {
    "gate": "siem009-redpanda-volume-persist",
    "topic": topic,
    "limitations": [
        "Container recreate with named volume only — not restore from off-box tar",
        "Single-node staging broker",
        "Not PRODUCTION READY",
    ],
}

def sh(args: list[str], input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, input=input_text, text=True, capture_output=True, check=False)

def expect(label: str, ok: bool, detail: str = "") -> None:
    if not ok:
        raise SystemExit(f"FAIL: {label} {detail}".strip())
    print(f"PASS: {label}", flush=True)

def compose(*args: str) -> subprocess.CompletedProcess[str]:
    return sh(["docker", "compose", "--project-directory", str(staging), "--env-file", str(staging / ".env"), *args])

def high_watermark() -> int | None:
    r = sh(["docker", "exec", rp, "rpk", "topic", "describe", topic, "-H"])
    text = (r.stdout or "") + "\n" + (r.stderr or "")
    for line in text.splitlines():
        parts = line.split()
        if parts and parts[0].isdigit():
            ints = [int(p) for p in parts if p.isdigit()]
            if len(ints) >= 2:
                return ints[-1]
    r2 = sh(["docker", "exec", rp, "rpk", "topic", "describe", topic, "-p"])
    text2 = r2.stdout or ""
    report["describe_fallback"] = text2[:400]
    for line in text2.splitlines()[1:]:
        ints = [int(p) for p in line.replace(",", " ").split() if p.isdigit()]
        if ints:
            return max(ints)
    return None

mounts = sh(["docker", "inspect", "-f", "{{range .Mounts}}{{.Name}}={{.Destination}};{{end}}", rp])
expect("named redpanda_data volume", "redpanda_data" in (mounts.stdout or ""))
topics = sh(["docker", "exec", rp, "rpk", "topic", "list"])
expect("topic list before", topics.returncode == 0 and topic in (topics.stdout or ""))

marker = f"siem009-volume-{int(time.time())}"
prod = sh(["docker", "exec", "-i", rp, "rpk", "topic", "produce", topic, "-k", marker], input_text=marker + "\n")
expect("produce marker", prod.returncode == 0, (prod.stderr or prod.stdout or "")[:200])
report["marker_key"] = marker
time.sleep(1)
hw_before = high_watermark()
report["high_watermark_before"] = hw_before
expect("high watermark before", hw_before is not None and hw_before >= 1)

expect("stop redpanda", compose("stop", "redpanda").returncode == 0)
compose("rm", "-f", "redpanda")
expect("up redpanda", compose("up", "-d", "redpanda").returncode == 0)
healthy = False
for _ in range(40):
    st = sh(["docker", "inspect", "-f", "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}", rp])
    if (st.stdout or "").strip() == "healthy":
        healthy = True
        break
    time.sleep(3)
expect("redpanda healthy after recreate", healthy)
expect(
    "named volume still attached",
    "redpanda_data" in (sh(["docker", "inspect", "-f", "{{range .Mounts}}{{.Name}}={{.Destination}};{{end}}", rp]).stdout or ""),
)
topics2 = sh(["docker", "exec", rp, "rpk", "topic", "list"])
expect("topic survived recreate", topic in (topics2.stdout or ""))
report["topics_after"] = [line.split()[0] for line in (topics2.stdout or "").splitlines()[1:] if line.strip()]
hw_after = high_watermark()
report["high_watermark_after"] = hw_after
expect("high watermark retained", hw_after is not None and hw_before is not None and hw_after >= hw_before)

tail = sh(["docker", "exec", rp, "timeout", "20", "bash", "-lc",
           f"rpk topic consume {topic} -n 20 --offset -20 --format '%k' 2>/dev/null | grep -F '{marker}' | tail -1 || true"])
found = (tail.stdout or "").strip() == marker
report["marker_found_after_recreate"] = found
if found:
    print("PASS: marker retained on named volume", flush=True)
else:
    print("WARN: marker not found in short tail window; HWM retention still passed", flush=True)
    report["limitations"].append("marker key not observed in short tail window after recreate")

report["status"] = "script-complete"
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
report_path.chmod(0o600)
print(f"SIEM009_RP_REPORT={report_path}", flush=True)
print("status=script-complete", flush=True)
print(f"high_watermark_before={hw_before}", flush=True)
print(f"high_watermark_after={hw_after}", flush=True)
print(f"marker_found_after_recreate={found}", flush=True)
PY
