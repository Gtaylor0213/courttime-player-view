#!/usr/bin/env bash
# Copy the last N lines from a Metro log file into design-review/repro/<name>.log
# Usage: ./scripts/dump-logs.sh <path-to-metro.log> [N] [name]
# Example: ./scripts/dump-logs.sh /tmp/metro.log 50 task-123-metro
set -e
SOURCE="${1:?Usage: $0 <source-log-file> [line-count] [output-basename]}"
N="${2:-50}"
NAME="${3:-metro}"
DEST_DIR="$(git rev-parse --show-toplevel)/CourtTime Player View/design-review/repro"
mkdir -p "$DEST_DIR"
OUT="$DEST_DIR/$NAME.log"
tail -n "$N" "$SOURCE" >"$OUT"
echo "$OUT"
