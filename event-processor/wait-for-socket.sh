#!/usr/bin/env bash
# Waits for the engine unix socket, then execs a companion plugin.
# Usage: wait-for-socket.sh <max_wait_seconds> <socket_path> <plugin_bin> [plugin_args...]
set -euo pipefail

max_wait="${1:?missing max_wait}"; shift
sock="${1:?missing socket_path}"; shift

elapsed=0
while [ ! -S "$sock" ]; do
    if [ "$elapsed" -ge "$max_wait" ]; then
        echo "[wait-for-socket] timeout after ${max_wait}s waiting for $sock" >&2
        exit 1
    fi
    sleep 1
    elapsed=$(( elapsed + 1 ))
done

exec "$@"
