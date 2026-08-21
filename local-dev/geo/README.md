# GeoIP MMDB Mount (Optional)

This directory is for an optional **MaxMind GeoLite2-City.mmdb** file used by the
HiveArmor event processor for IP geolocation enrichment.

## Do I need this?

**No.** The CSV-based geo enrichment is already built into the Docker image and works
without any additional files. The MMDB is an optional fallback for air-gapped
environments that cannot download the CSV data at build time.

## How to obtain the file

1. Create a free MaxMind account at https://www.maxmind.com/en/geolite2/signup
2. Generate a license key under **Account → Manage License Keys**
3. Download `GeoLite2-City.mmdb` from the GeoIP2 / GeoLite2 download page
   (or use the direct download API):
   ```
   curl -o GeoLite2-City.mmdb \
     "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=YOUR_KEY&suffix=tar.gz"
   ```
   Extract the `.mmdb` file from the archive and place it here.

4. Uncomment the volume mount in `local-dev/docker-compose.yml` under the
   `eventprocessor` service:
   ```yaml
   - ./geo/GeoLite2-City.mmdb:/opt/hivearmor/geo/GeoLite2-City.mmdb:ro
   ```

5. Restart the event processor:
   ```bash
   docker compose restart eventprocessor eventprocessor-worker
   ```

## File details

| Field | Value |
|-------|-------|
| Expected filename | `GeoLite2-City.mmdb` |
| Container path | `/opt/hivearmor/geo/GeoLite2-City.mmdb` |
| Env variable | `GEOIP_DB_PATH` |
| License | MaxMind GeoLite2 End User License (free, attribution required) |

## Note

This file is `.gitignore`d — do not commit the MMDB binary to the repository.
