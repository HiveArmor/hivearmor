# Agent package publish directory (staging)

Place allowlisted installer binaries in this folder on the staging host. The backend
mounts it read-only at `/opt/hivearmor/agent-packages` and serves:

- `GET /api/ha-agent-packages` — catalog availability
- `GET /api/ha-agent-packages/summary` — catalog + `version.json` latest version
- `GET /agent-packages/{filename}` — public download for install scripts

## Required filenames

```
hivearmor_agent_service_linux_amd64
hivearmor_agent_service_linux_arm64
hivearmor_agent_service_darwin_amd64
hivearmor_agent_service_darwin_arm64
hivearmor_agent_service_windows_amd64.exe
hivearmor_agent_service_windows_arm64.exe
version.json
```

## version.json

```json
{
  "version": "11.0.0-staging",
  "updater_version": "11.0.0-staging"
}
```

See `../publish-agent-packages.sh` to sync from a CI artifact directory into this folder
and into the live Docker volume.
