# Staging access (shared across AI chat sessions)

**Purpose:** One place every Cursor/Claude session can read for staging + Windows agent access.  
**Do not paste live passwords into chat.** Read them from the paths below (files are gitignored / local-only).

Last verified: **2026-08-24** (hosts reachable; secret files present).

---

## Quick paste for a new chat

```
Read docs/ai-handoff/STAGING_ACCESS.md first.
Use SSH key ~/.ssh/hivearmor-staging-aws.pem.
Staging UI https://72.44.52.187 — admin password from deploy/staging/ADMIN_BOOTSTRAP.txt (on the staging VM or sync locally). Never print secrets.
Label outcomes STAGING CANDIDATE — never PRODUCTION READY.
```

---

## 1. Staging SIEM VM (Linux)

| Item | Value |
|---|---|
| Role | Full HiveArmor staging stack (Compose) |
| Public IP / SSH | `ubuntu@72.44.52.187` |
| Private IP | `172.31.17.117` |
| SSH key (laptop) | `~/.ssh/hivearmor-staging-aws.pem` (`chmod 400`) |
| Repo on VM | `/home/ubuntu/HiveArmor-v1` |
| Compose dir | `/home/ubuntu/HiveArmor-v1/deploy/staging` |
| UI | `https://72.44.52.187` (self-signed TLS — ignore cert errors) |
| API | same host `/api/*` |

### SSH

```bash
ssh -i ~/.ssh/hivearmor-staging-aws.pem -o IdentitiesOnly=yes ubuntu@72.44.52.187
```

### HiveArmor UI / API login (admin)

| Item | Value |
|---|---|
| Username | `admin` |
| Password | **Read only** from `deploy/staging/ADMIN_BOOTSTRAP.txt` on the staging VM (single-line raw password, mode `0600`). Also mirrored after sync to Windows `C:\ha-agent-test\secrets\admin.pass`. |
| Other users | `soc.manager`, `analyst.chen` — passwords in `C:\ha-agent-test\secrets\*.pass` on the Windows VM (not in git). |

Safe read on staging (prints length only):

```bash
ssh -i ~/.ssh/hivearmor-staging-aws.pem ubuntu@72.44.52.187 \
  'python3 -c "from pathlib import Path; t=Path(\"/home/ubuntu/HiveArmor-v1/deploy/staging/ADMIN_BOOTSTRAP.txt\").read_text().strip(); print(\"pw_len\", len(t.splitlines()[0]))"'
```

Get a JWT without echoing the password in chat:

```bash
ssh -i ~/.ssh/hivearmor-staging-aws.pem ubuntu@72.44.52.187 'bash -s' <<'REMOTE'
cd /home/ubuntu/HiveArmor-v1/deploy/staging
PASS=$(python3 -c "from pathlib import Path; print(Path(\"ADMIN_BOOTSTRAP.txt\").read_text().strip().splitlines()[0].strip())")
curl -sk -X POST https://127.0.0.1/api/authenticate \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"$PASS\",\"rememberMe\":false}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); t=d.get(\"id_token\") or d.get(\"token\") or \"\"; print(\"token_len\", len(t))"
REMOTE
```

### Compose / ops

```bash
cd /home/ubuntu/HiveArmor-v1/deploy/staging
docker compose ps
# OpenSearch admin password: OPENSEARCH_INITIAL_ADMIN_PASSWORD in .env (never print)
```

Secrets on staging (gitignored):

- `/home/ubuntu/HiveArmor-v1/deploy/staging/ADMIN_BOOTSTRAP.txt`
- `/home/ubuntu/HiveArmor-v1/deploy/staging/.env`

---

## 2. Windows agent VM (ACC-02)

| Item | Value |
|---|---|
| Hostname | `EC2AMAZ-8F0Q7DL` |
| Public IP | `54.160.142.254` |
| Private IP | `172.31.16.134` |
| SSH user | `Administrator` |
| Auth | Same PEM: `~/.ssh/hivearmor-staging-aws.pem` (key-based SSH; no password in chat) |
| Agent package | `C:\ha-agent-test\pkg\hivearmor-agent-11.0.0-staging-windows-amd64\` |
| Service | `HiveArmorAgent` (`sc query HiveArmorAgent`) |
| HiveArmor secrets on host | `C:\ha-agent-test\secrets\admin.pass`, `soc.manager.pass`, `analyst.chen.pass` |
| Reports | `C:\ha-agent-test\hivearmor-*.json` |

### SSH from laptop

```bash
ssh -i ~/.ssh/hivearmor-staging-aws.pem -o IdentitiesOnly=yes Administrator@54.160.142.254
```

### Useful checks

```bat
sc query HiveArmorAgent
hostname
dir C:\ha-agent-test\secrets
type C:\ha-agent-test\pkg\hivearmor-agent-11.0.0-staging-windows-amd64\config.yml
```

(Agent `config.yml` contains `agent-key` — do not paste into chat.)

Staging backend seen by the agent: `172.31.17.117` (HTTPS + gRPC). Latest known enrolled agent id after live ingest: **19** (older ids 12–17 may be revoked/offline).

---

## 3. What every session must not do

- Do not print `ADMIN_BOOTSTRAP.txt`, `.env`, JWTs, enrollment tokens, or `agent-key` into chat or commits.
- Do not commit `ADMIN_BOOTSTRAP.txt` / `.env` (listed in `deploy/staging/.gitignore`).
- Do not stamp **PRODUCTION READY**; use **STAGING CANDIDATE** / **LIVE VERIFIED**.
- Prefer scripts that write `0600` reports under `/var/tmp/hivearmor-*.json`.

---

## 4. Related handoff docs

| Doc | Use |
|---|---|
| `docs/ai-handoff/current-state.md` | Product status |
| `docs/ai-handoff/next-production-slice.md` | Active queue |
| `docs/ai-handoff/validation-evidence.md` | Evidence log |
| `docs/ai-handoff/FULL_STACK_AUDIT_PROMPT.md` | Full-stack audit prompt |
| `docs/ai-handoff/pilot-telemetry-matrix.md` | Pilot rules / telemetry |
| `deploy/staging/INSTALL.md` | Install notes |
| `deploy/staging/run-windows-live-ingest.ps1` | Re-enroll Windows + generate activity |

---

## 5. Optional: keep a local laptop copy of admin bootstrap

Only on your machine (never commit):

```bash
scp -i ~/.ssh/hivearmor-staging-aws.pem \
  ubuntu@72.44.52.187:/home/ubuntu/HiveArmor-v1/deploy/staging/ADMIN_BOOTSTRAP.txt \
  ~/hivearmor-staging-ADMIN_BOOTSTRAP.txt
chmod 600 ~/hivearmor-staging-ADMIN_BOOTSTRAP.txt
```

Point new chats at this file path if they need UI login without SSHing first.
