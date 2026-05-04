# CourtTime mobile (Expo)

## Bug repro workflow

Before changing code for a mobile bug, run `npx expo start --ios --clear` from this directory, reproduce on the iOS Simulator, then capture evidence under `CourtTime Player View/design-review/repro/`. Use `./scripts/screenshot.sh <task-id>-before` (and `-after` after a fix) so `xcrun simctl` saves a PNG next to your task notes. For Metro output, either pipe the dev server to a file (for example `npx expo start --ios --clear 2>&1 | tee /tmp/metro.log`) and run `./scripts/dump-logs.sh /tmp/metro.log 80 <task-id>-metro` to write the last *N* lines to `<task-id>-metro.log` in the same folder, or copy the relevant lines from the Metro terminal into `design-review/repro/<task-id>.log` manually. Those paths keep screenshots and logs consistent across prompts.

## Scripts

- `scripts/screenshot.sh` — iOS Simulator screenshot to `design-review/repro/<name>.png`.
- `scripts/dump-logs.sh` — last *N* lines from a saved log file into `design-review/repro/<name>.log`.
