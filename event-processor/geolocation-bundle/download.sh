#!/usr/bin/env bash
# Download GeoLite2 CSVs from MaxMind into this directory.
# Requires a free MaxMind account: https://www.maxmind.com/en/geolite2/signup
# Usage: MAXMIND_LICENSE_KEY=<your_key> ./download.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
LICENSE_KEY="${MAXMIND_LICENSE_KEY:?Set MAXMIND_LICENSE_KEY to your MaxMind license key}"

_dl() {
  local edition="$1"
  echo "==> Downloading $edition..."
  curl -fsSL \
    "https://download.maxmind.com/app/geoip_download?edition_id=${edition}&license_key=${LICENSE_KEY}&suffix=zip" \
    -o "/tmp/geo_${edition}.zip"
  unzip -jo "/tmp/geo_${edition}.zip" -d "$DIR" "*.csv"
  rm "/tmp/geo_${edition}.zip"
}

_dl GeoLite2-ASN-CSV
_dl GeoLite2-City-CSV

mv "$DIR/GeoLite2-ASN-Blocks-IPv4.csv"   "$DIR/asn-blocks-v4.csv"  2>/dev/null || true
mv "$DIR/GeoLite2-ASN-Blocks-IPv6.csv"   "$DIR/asn-blocks-v6.csv"  2>/dev/null || true
mv "$DIR/GeoLite2-City-Blocks-IPv4.csv"  "$DIR/blocks-v4.csv"      2>/dev/null || true
mv "$DIR/GeoLite2-City-Blocks-IPv6.csv"  "$DIR/blocks-v6.csv"      2>/dev/null || true
mv "$DIR/GeoLite2-City-Locations-en.csv" "$DIR/locations-en.csv"   2>/dev/null || true

echo "==> Done. Files in $DIR:"
ls -lh "$DIR/"*.csv
