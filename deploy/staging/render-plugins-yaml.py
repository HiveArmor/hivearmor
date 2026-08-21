#!/usr/bin/env python3
from pathlib import Path
import json
import sys

staging = Path(sys.argv[1])
env = {}
for line in (staging / ".env").read_text().splitlines():
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    env[key] = value.strip().strip("'\"")
required = ("INTERNAL_KEY", "POSTGRES_PASSWORD", "OPENSEARCH_INITIAL_ADMIN_PASSWORD")
missing = [key for key in required if not env.get(key)]
if missing:
    raise SystemExit("missing " + ",".join(missing))
template = (staging / "hivearmor_plugins.yaml.template").read_text()
for key in required:
    template = template.replace("__" + key + "__", json.dumps(env[key]))
out = staging / "hivearmor_plugins.yaml"
out.write_text(template)
out.chmod(0o600)
print("generated hivearmor_plugins.yaml")
