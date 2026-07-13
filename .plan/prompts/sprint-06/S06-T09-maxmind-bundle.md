# S06-T09 — Bundle MaxMind GeoLite2 CSVs in eventprocessor Image

**Sprint:** 6 (Deployment)
**Severity:** HIGH
**Issue ID:** DEPLOY-01
**Dependencies:** None
**Estimated time:** 4 hours

---

## Context

Geolocation enrichment silently does nothing on a fresh install. The `event-processor` expects MaxMind GeoLite2 CSV files at `$WORK_DIR/geolocation/` on startup. When the directory exists but the files are absent, `geoReady` stays `false` and all events get no country/city data — no error is logged, alerts fire with `country: ""`.

**Two geo implementations exist in the repo:**
1. `event-processor/enrichment/geo.go` — loads CSVs via `sync.Once` from the `geolocation/` directory. Called by the rules engine to enrich events.
2. `plugins/geolocation/geolocate.go` — the geolocation plugin binary, built into the Docker image, uses the same CSV format.

**The problem:** `event-processor/entrypoint.sh` line 7 creates the `geolocation/` directory but never populates it. No CSVs are bundled in the Docker image. The files must be downloaded from MaxMind — but this requires a free MaxMind account and license key, which installers don't automatically have.

**Required CSV files:**
- `geolocation/asn-blocks-v4.csv`
- `geolocation/asn-blocks-v6.csv`
- `geolocation/blocks-v4.csv`
- `geolocation/blocks-v6.csv`
- `geolocation/locations-en.csv`

**Solution:** Bundle the latest public GeoLite2 CSVs in the Docker image at build time as a fallback. Add startup validation that logs a clear warning (not silent failure) if files are absent. The CSV files are approximately 60 MB combined but are compressible in the image layer.

---

## What to Read First

Before writing any code, read these files completely:

1. `event-processor/enrichment/geo.go` — the `SetGeoDir()` function and `sync.Once` init logic; understand what exact CSV column names it expects
2. `event-processor/main.go` lines around 49 — where `enrichment.SetGeoDir()` is called
3. `event-processor/entrypoint.sh` — the startup script; line 7 creates the directory
4. `event-processor/Dockerfile` — current build stages; understand multi-stage build structure
5. `plugins/geolocation/geolocate.go` — the plugin's CSV column expectations (should match geo.go)

---

## Implementation Steps

### Step 1: Download GeoLite2 CSVs for bundling

MaxMind provides a free version of GeoLite2 data. You need a free MaxMind account to download. For CI/CD, use the license key approach.

For the purpose of this task, download the CSVs to `event-processor/geolocation-bundle/`:

```bash
cd /Users/encryptshell/GIT/UTMStack-11/event-processor
mkdir -p geolocation-bundle

# Option A: Download from MaxMind (requires free account at maxmind.com)
# Replace YOUR_LICENSE_KEY with a free GeoLite2 license key
LICENSE_KEY="YOUR_LICENSE_KEY"

curl -fsSL "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN-CSV&license_key=${LICENSE_KEY}&suffix=zip" \
  -o /tmp/asn.zip && unzip -jo /tmp/asn.zip -d geolocation-bundle/ "*.csv"

curl -fsSL "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City-CSV&license_key=${LICENSE_KEY}&suffix=zip" \
  -o /tmp/city.zip && unzip -jo /tmp/city.zip -d geolocation-bundle/ "*.csv"

# Option B: If there's already a volume-mounted geolocation/ directory with the files,
# copy from there:
cp -r geolocation/*.csv geolocation-bundle/ 2>/dev/null || true

ls -lh geolocation-bundle/
```

The files will be named with MaxMind conventions (e.g., `GeoLite2-ASN-Blocks-IPv4.csv`). Rename them to the expected names:

```bash
cd event-processor/geolocation-bundle/
mv GeoLite2-ASN-Blocks-IPv4.csv asn-blocks-v4.csv 2>/dev/null || true
mv GeoLite2-ASN-Blocks-IPv6.csv asn-blocks-v6.csv 2>/dev/null || true
mv GeoLite2-City-Blocks-IPv4.csv blocks-v4.csv 2>/dev/null || true
mv GeoLite2-City-Blocks-IPv6.csv blocks-v6.csv 2>/dev/null || true
mv GeoLite2-City-Locations-en.csv locations-en.csv 2>/dev/null || true
```

> Verify the exact column names match what `geo.go` expects. If they differ, either rename the columns in geo.go or add a conversion step. The `geo.go` file is the source of truth for expected column names.

### Step 2: Add CSVs to the Docker image

In `event-processor/Dockerfile`, add a COPY step to place the bundled CSVs in the image. Find the final stage (the one that produces the runtime image) and add:

```dockerfile
# Bundle default GeoLite2 CSVs (can be overridden by volume mount)
COPY geolocation-bundle/ /opt/utm/geolocation/
```

Place this COPY after the app binary is copied but before the ENTRYPOINT. The path `/opt/utm/geolocation/` (or wherever `$WORK_DIR/geolocation/` resolves to at runtime) is where `geo.go` will look.

### Step 3: Update entrypoint.sh to validate CSV presence

In `event-processor/entrypoint.sh`, replace the silent directory creation with a validation that logs a warning if files are missing:

```bash
# Replace the silent mkdir with this block:
GEO_DIR="${WORK_DIR:-/opt/utm}/geolocation"
mkdir -p "$GEO_DIR"

REQUIRED_GEOFILES="asn-blocks-v4.csv asn-blocks-v6.csv blocks-v4.csv blocks-v6.csv locations-en.csv"
MISSING_FILES=0
for f in $REQUIRED_GEOFILES; do
  if [ ! -f "$GEO_DIR/$f" ]; then
    echo "[WARN] GeoIP file missing: $GEO_DIR/$f — geolocation enrichment will be disabled"
    MISSING_FILES=$((MISSING_FILES + 1))
  fi
done

if [ "$MISSING_FILES" -eq 0 ]; then
  echo "[INFO] GeoIP CSV files found in $GEO_DIR — geolocation enrichment enabled"
else
  echo "[WARN] $MISSING_FILES GeoIP file(s) missing. Events will not be enriched with country/city data."
  echo "[WARN] To enable: mount CSV files to $GEO_DIR or set MAXMIND_LICENSE_KEY to auto-download."
fi
```

### Step 4: Add optional auto-download via MAXMIND_LICENSE_KEY env var

Extend `entrypoint.sh` to auto-download from MaxMind if a license key is provided:

```bash
# Add before the validation block:
if [ -n "$MAXMIND_LICENSE_KEY" ] && [ "$MISSING_FILES" -gt 0 ]; then
  echo "[INFO] MAXMIND_LICENSE_KEY found — attempting to download latest GeoLite2 CSVs..."
  
  download_csv() {
    local edition="$1"
    local dest="$2"
    curl -fsSL \
      "https://download.maxmind.com/app/geoip_download?edition_id=${edition}&license_key=${MAXMIND_LICENSE_KEY}&suffix=zip" \
      -o /tmp/geo_${edition}.zip \
      && unzip -jo /tmp/geo_${edition}.zip -d "$GEO_DIR" "*.csv" \
      && rm /tmp/geo_${edition}.zip \
      && echo "[INFO] Downloaded $edition"
  }
  
  download_csv GeoLite2-ASN-CSV "$GEO_DIR"
  download_csv GeoLite2-City-CSV "$GEO_DIR"
  
  # Rename to expected names
  mv "$GEO_DIR"/GeoLite2-ASN-Blocks-IPv4.csv "$GEO_DIR"/asn-blocks-v4.csv 2>/dev/null || true
  mv "$GEO_DIR"/GeoLite2-ASN-Blocks-IPv6.csv "$GEO_DIR"/asn-blocks-v6.csv 2>/dev/null || true
  mv "$GEO_DIR"/GeoLite2-City-Blocks-IPv4.csv "$GEO_DIR"/blocks-v4.csv 2>/dev/null || true
  mv "$GEO_DIR"/GeoLite2-City-Blocks-IPv6.csv "$GEO_DIR"/blocks-v6.csv 2>/dev/null || true
  mv "$GEO_DIR"/GeoLite2-City-Locations-en.csv "$GEO_DIR"/locations-en.csv 2>/dev/null || true
fi
```

### Step 5: Add geo.go startup validation log

In `event-processor/enrichment/geo.go`, in the `sync.Once` init function, add a structured log after the CSVs are loaded (or fail to load):

```go
// In the once.Do() block, after attempting to load the files:
if geoReady {
    log.Printf("[INFO] GeoIP enrichment initialized — country/city lookup active")
} else {
    log.Printf("[WARN] GeoIP enrichment NOT initialized — %s is empty or files are missing", geoDir)
}
```

This ensures the absence of geo data is visible in container logs, not silently swallowed.

### Step 6: Add geo CSVs to .dockerignore and .gitignore

The CSV files should be in `.gitignore` (they are large binary-like data files, not source code) but must be present at Docker build time.

```bash
# Add to event-processor/.gitignore
echo "geolocation-bundle/*.csv" >> event-processor/.gitignore

# They must NOT be in .dockerignore — the Dockerfile COPY needs them
grep "geolocation-bundle" event-processor/.dockerignore && \
  echo "WARNING: remove geolocation-bundle from .dockerignore" || \
  echo "OK: geolocation-bundle not in .dockerignore"
```

For CI, add a step that downloads the CSVs before `docker build`. Document this in a `Makefile` target or CI step comment.

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/event-processor

# 1. Build the Docker image
docker build -t armorsight/eventprocessor:test .

# 2. Verify CSV files are present in the image
docker run --rm armorsight/eventprocessor:test ls -la /opt/utm/geolocation/
# Expected: all 5 CSV files listed

# 3. Run the container and check startup logs for "GeoIP enrichment initialized"
docker run --rm armorsight/eventprocessor:test sh -c "cat entrypoint.sh | head -30"
docker run --rm -e WORK_DIR=/opt/utm armorsight/eventprocessor:test /opt/utm/entrypoint.sh &
sleep 5
docker logs <container_id> | grep -E "GeoIP|WARN.*GeoIP"
# Expected: "[INFO] GeoIP enrichment initialized"

# 4. Test missing-file warning: run with empty geo dir
docker run --rm \
  -e WORK_DIR=/tmp/test_workdir \
  armorsight/eventprocessor:test \
  sh -c "mkdir -p /tmp/test_workdir/geolocation && /opt/utm/entrypoint.sh" 2>&1 | \
  grep -E "GeoIP|WARN" | head -10
# Expected: "[WARN] GeoIP file missing" for each of the 5 files

# 5. Test MAXMIND_LICENSE_KEY auto-download (requires a real key)
# docker run --rm -e MAXMIND_LICENSE_KEY=your_key armorsight/eventprocessor:test ...
```

---

## Acceptance Criteria

- [ ] All 5 GeoLite2 CSV files are present in `event-processor/geolocation-bundle/` (not committed to git)
- [ ] `docker build` copies the CSVs into the image at the correct path
- [ ] `docker run` — container startup logs show `[INFO] GeoIP enrichment initialized`
- [ ] When CSV files are missing (empty dir), startup logs show `[WARN] GeoIP file missing` for each missing file (not silent)
- [ ] When `MAXMIND_LICENSE_KEY` env var is set, entrypoint downloads and renames CSVs automatically
- [ ] `geo.go` logs either `[INFO]` or `[WARN]` after geo initialization attempt — no more silent failure
- [ ] CSV files are in `.gitignore` (not committed)
- [ ] CSV files are NOT in `.dockerignore` (needed at build time)
- [ ] `go build ./...` still passes in the event-processor directory
