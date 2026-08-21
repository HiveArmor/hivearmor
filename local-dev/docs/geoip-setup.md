# GeoIP Enrichment Setup

HiveArmor's event-processor enriches log events with geographic metadata for source and destination IP addresses. Two modes are available; they operate in a priority chain so that when one source cannot resolve an IP the next source is consulted.

---

## Mode 1 — CSV Enrichment (Existing Behavior)

The default geo enrichment uses CSV data files loaded at event-processor startup. These files are sourced from the HiveArmor CDN during the Docker image build and stored in the `geolocation/` directory.

**How it works:**

1. `enrichment.InitGeo()` is called on startup, loading the CSV files into memory.
2. For every event, `enrichSide(ip)` queries the CSV dataset first.
3. If a match is found, the resolved country, city, and coordinates are attached to the event.

**Operator action:** No runtime configuration is needed. The CSV files are baked into the Docker image at build time.

---

## Mode 2 — MaxMind MMDB Fallback (New)

When an IP is not found in the CSV dataset, the event-processor falls back to a MaxMind GeoLite2-City MMDB binary database. This fallback is powered by the `event-processor/geo/` package.

**How it works:**

1. On startup, `geo.Init(os.Getenv("GEOIP_DB_PATH"))` opens the MMDB file.
2. If the file is missing, empty, or invalid, initialization succeeds silently (logs a WARN) and the MMDB layer is disabled — no crash, no startup failure.
3. During enrichment, if the CSV source returns no result for an IP, `geommdb.Lookup(ip)` is invoked.
4. If the MMDB resolves the IP, the result is used. If not, the event receives `Country: "Unknown"` and `CountryCode: "XX"`.

**Priority chain:** CSV → MMDB → Unknown stub.

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GEOIP_DB_PATH` | `/opt/hivearmor/geo/GeoLite2-City.mmdb` | Absolute path inside the container where the MMDB file is expected |

Set this in `local-dev/docker-compose.yml` on the `event-processor` service:

```yaml
environment:
  GEOIP_DB_PATH: /opt/hivearmor/geo/GeoLite2-City.mmdb
```

Mount the file from the host:

```yaml
volumes:
  - ./geo/GeoLite2-City.mmdb:/opt/hivearmor/geo/GeoLite2-City.mmdb:ro
```

---

## Air-Gap Offline Workflow

In an air-gapped deployment, you cannot download the MMDB file at runtime. Follow this procedure to stage the database ahead of time.

### Step 1 — Download on an Internet-Connected Host

On a machine with network access, download the GeoLite2-City database from MaxMind:

```bash
# Using the MaxMind direct download link (requires a free MaxMind account and license key)
curl -Lo GeoLite2-City.mmdb.tar.gz \
  "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=YOUR_LICENSE_KEY&suffix=tar.gz"

# Extract the .mmdb file
tar -xzf GeoLite2-City.mmdb.tar.gz --strip-components=1 --wildcards '*/GeoLite2-City.mmdb'
```

Alternatively, use the `geoipupdate` tool provided by MaxMind:

```bash
# Install geoipupdate (Debian/Ubuntu)
sudo apt-get install geoipupdate

# Configure /etc/GeoIP.conf with your AccountID and LicenseKey
# Then run:
geoipupdate -d ./
```

### Step 2 — Transfer to the Air-Gapped Environment

Copy the `GeoLite2-City.mmdb` file to the air-gapped host using your approved transfer method (USB, optical media, secure file transfer appliance, etc.):

```bash
# Example: copy via USB mount
cp /media/usb/GeoLite2-City.mmdb /opt/hivearmor/geo/GeoLite2-City.mmdb
```

### Step 3 — Mount into the Container

**Option A — Volume mount (recommended for updates):**

Place the file on the Docker host and mount it read-only:

```bash
mkdir -p /opt/hivearmor/geo
cp GeoLite2-City.mmdb /opt/hivearmor/geo/GeoLite2-City.mmdb
```

In `docker-compose.yml`:

```yaml
services:
  event-processor:
    environment:
      GEOIP_DB_PATH: /opt/hivearmor/geo/GeoLite2-City.mmdb
    volumes:
      - /opt/hivearmor/geo/GeoLite2-City.mmdb:/opt/hivearmor/geo/GeoLite2-City.mmdb:ro
```

**Option B — Bake into the Docker image (for immutable deployments):**

Edit `event-processor/Dockerfile` and uncomment the COPY directive:

```dockerfile
RUN mkdir -p /opt/hivearmor/geo
COPY GeoLite2-City.mmdb /opt/hivearmor/geo/GeoLite2-City.mmdb
```

Then build the image with the MMDB file present in the build context:

```bash
cp GeoLite2-City.mmdb event-processor/
docker build -t hivearmor/event-processor:airgap event-processor/
```

### Step 4 — Verify

After the container starts, check the event-processor logs:

```bash
docker logs event-processor 2>&1 | grep -i "mmdb\|geoip\|geo"
```

- If the file loaded successfully, you will see an INFO log confirming MMDB initialization.
- If the file is missing or invalid, you will see a WARN log stating MMDB geo fallback is disabled. The event-processor continues to operate using CSV data only.

### Updating the Database

To refresh the MMDB file in an air-gapped environment:

1. Download the latest `GeoLite2-City.mmdb` on an internet-connected host.
2. Transfer to the air-gapped host.
3. Replace the file at the mount path.
4. Restart the event-processor container to pick up the new data.

---

## MaxMind EULA and License Compliance

The GeoLite2 databases are provided by MaxMind under the [GeoLite2 End User License Agreement](https://www.maxmind.com/en/geolite2/eula).

**Key obligations:**

- A free MaxMind account is required to download GeoLite2 databases.
- The database must not be redistributed to third parties outside your organization.
- Attribution is required in user-facing products: include the notice "This product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com" in your documentation or about page.
- The database should be updated at least every 30 days to comply with the license terms (where network access permits).
- Commercial GeoIP2 databases (higher accuracy) are available under a separate paid license.

**Air-gap note:** In air-gapped environments where 30-day updates are not feasible, document the last update date and refresh the database during scheduled maintenance windows when transfer media access is available. MaxMind does not enforce real-time update checks, but stale data will degrade geo accuracy over time.

For full license text, see: https://www.maxmind.com/en/geolite2/eula
