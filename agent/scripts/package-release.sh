#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 7 ]]; then
  echo "usage: $0 <linux|windows> <amd64|arm64> <version> <agent-binary> <updater-binary> <install-guide> <output-dir>" >&2
  exit 2
fi

target_os="$1"
target_arch="$2"
version="$3"
agent_binary="$4"
updater_binary="$5"
install_guide="$6"
output_dir="$7"

case "$target_os" in linux|windows) ;; *) echo "unsupported target OS: $target_os" >&2; exit 2 ;; esac
case "$target_arch" in amd64|arm64) ;; *) echo "unsupported target architecture: $target_arch" >&2; exit 2 ;; esac
[[ -n "$version" && -f "$agent_binary" && -f "$updater_binary" && -f "$install_guide" ]] || {
  echo "version and all input files are required" >&2
  exit 2
}

mkdir -p "$output_dir"
stage="$(mktemp -d)"
cleanup() { rm -rf -- "$stage"; }
trap cleanup EXIT

package_name="hivearmor-agent-${version}-${target_os}-${target_arch}"
package_dir="$stage/$package_name"
mkdir -p "$package_dir"

if [[ "$target_os" == "windows" ]]; then
  install -m 0755 "$agent_binary" "$package_dir/hivearmor_agent_service.exe"
  install -m 0755 "$updater_binary" "$package_dir/hivearmor_updater_service.exe"
else
  install -m 0755 "$agent_binary" "$package_dir/hivearmor_agent_service"
  install -m 0755 "$updater_binary" "$package_dir/hivearmor_updater_service"
fi
install -m 0644 "$install_guide" "$package_dir/INSTALL.md"
if [[ "$target_os" == "linux" ]]; then
  install -m 0644 "$(dirname "$0")/../release/linux-telemetry.env.example" "$package_dir/linux-telemetry.env.example"
  install -m 0644 "$(dirname "$0")/../release/hivearmor-telemetry.service" "$package_dir/hivearmor-telemetry.service"
fi

(
  cd "$package_dir"
  if [[ "$target_os" == "linux" ]]; then
    hash_files=(hivearmor_agent_service hivearmor_updater_service INSTALL.md linux-telemetry.env.example hivearmor-telemetry.service)
  else
    hash_files=(hivearmor_agent_service.exe hivearmor_updater_service.exe INSTALL.md)
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${hash_files[@]}" > SHA256SUMS
  else
    shasum -a 256 "${hash_files[@]}" > SHA256SUMS
  fi
)

# Normalize archive entry times so identical signed inputs produce identical
# packages. The external provenance still records the workflow identity.
find "$package_dir" -exec touch -t 198001010000 {} +

if [[ "$target_os" == "windows" ]]; then
  (
    cd "$stage"
    zip -q -X -r "$output_dir/$package_name.zip" "$package_name"
  )
else
  if tar --version 2>/dev/null | grep -q GNU; then
    tar --no-xattrs --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner \
      -cf - -C "$stage" "$package_name" | gzip -n > "$output_dir/$package_name.tar.gz"
  else
    COPYFILE_DISABLE=1 tar -czf "$output_dir/$package_name.tar.gz" -C "$stage" "$package_name"
  fi
fi
