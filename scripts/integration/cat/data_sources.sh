#!/usr/bin/env bash
# data_sources.sh — alias entry point for Category 6 data-source-aggregation.
# The phase1_test.sh runner resolves category scripts by name using
# CATEGORY_NAMES[6]="data-source-aggregation", so the canonical script is
# data-source-aggregation.sh.  This file exists as an explicit entry point
# for direct invocation as documented in task 4.5.
#
# Requirements: 12.3, plus validates 8.6, 9.2, 9.4
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/data-source-aggregation.sh" "$@"
