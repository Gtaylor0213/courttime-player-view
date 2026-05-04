#!/usr/bin/env bash
# Save an iOS Simulator screenshot to design-review/repro/<name>.png
set -e
NAME="${1:-screenshot}"
DEST_DIR="$(git rev-parse --show-toplevel)/CourtTime Player View/design-review/repro"
mkdir -p "$DEST_DIR"
xcrun simctl io booted screenshot "$DEST_DIR/$NAME.png"
echo "$DEST_DIR/$NAME.png"
