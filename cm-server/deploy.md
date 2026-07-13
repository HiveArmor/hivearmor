# CM Server — Deploy Guide

## First-time setup

```bash
cd cm-server
go mod tidy          # downloads dependencies, writes go.sum
go build -o cm-server .   # verify it compiles
```

## Bootstrap admin accounts (run once per environment)

```bash
# Dev
DATABASE_URL="postgres://postgres:localdev123!@localhost:5438/hivearmor" \
  go run ./cmd/seed --id ci-dev --role ci

# Prod (run against prod DB)
DATABASE_URL="postgres://..." \
  go run ./cmd/seed --id ci-prod --role ci
```

Copy the printed `{"id":"...","key":"..."}` JSON into GitHub Secrets:
- `CM_SERVICE_ACCOUNT_DEV`
- `CM_SERVICE_ACCOUNT_PROD`

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres DSN |
| `CM_ENCRYPT_SALT` | Yes | Must match `CM_ENCRYPT_SALT` baked into agent binaries |
| `CM_SIGN_PUBLIC_KEY` | No | PEM RSA public key — if set, verifies version signatures from CI |
| `PORT` | No | Defaults to `8080` |

## Docker

```bash
docker build -t hivearmor/cm-server:latest .

docker run -d \
  -e DATABASE_URL="postgres://..." \
  -e CM_ENCRYPT_SALT="your-salt" \
  -e CM_SIGN_PUBLIC_KEY="$(cat cm_sign_public.pem)" \
  -p 8080:8080 \
  hivearmor/cm-server:latest
```

## CI pipeline — publish a new version

In `.github/workflows/v11-deployment-pipeline.yml`, after building the agent binary:

```bash
# Sign the payload (CI has the private key, CM verifies with the public key)
PAYLOAD="agent${VERSION}${DOWNLOAD_URL}"
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -rsassa-pss \
  -sigopt rsa_padding_mode:pss -sign <(echo "$CM_SIGN_PRIVATE_KEY") | base64 -w0)

# Publish to CM
curl -X POST https://cm.onlyhacker.org/api/v1/admin/versions \
  -H "Authorization: Bearer ${CM_SERVICE_ACCOUNT_PROD_ID}:${CM_SERVICE_ACCOUNT_PROD_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"component\":\"agent\",\"tag\":\"${VERSION}\",\"download_url\":\"${DOWNLOAD_URL}\",\"signature\":\"${SIG}\"}"
```

## API reference

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/health` | None | Liveness probe |
| POST | `/api/v1/instances/register` | None (HMAC-verified) | First-boot registration |
| POST | `/api/v1/instances/heartbeat` | Instance key | Keep-alive + update check |
| GET | `/api/v1/updates?component=agent&version=v11.x` | Instance key | Check for newer version |
| GET | `/api/v1/licenses/{instance_id}` | Instance key (own ID only) | License status |
| POST | `/api/v1/admin/versions` | Admin key | Publish new release |
| GET | `/api/v1/admin/versions?component=agent` | Admin key | List versions |
| GET | `/api/v1/admin/instances` | Admin key | List all instances |
| PUT | `/api/v1/admin/instances/{id}/license` | Admin key | Set license tier |
