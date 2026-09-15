# CourtTime mobile (Expo)

## Install

Mobile dependencies are **not** installed by the web project's install. From
`CourtTime Player View`:

```bash
npm run mobile:install    # or: npm --prefix mobile ci
```

This used to run automatically from a root `postinstall`, which meant the web
deploy installed the React Native app too — so a mobile dependency conflict
could fail a production web build, and did. The two projects install
separately now.

## Bug repro workflow

Before you change mobile code for a bug, from this directory run `npx expo start --ios --clear` (use another `--port` if 8081 is busy), reproduce on the iOS Simulator, then save evidence under `CourtTime Player View/design-review/repro/`. Use `./scripts/screenshot.sh <name>` (for example `./scripts/screenshot.sh task-42-before` and `task-42-after`) so `xcrun simctl` writes a PNG there. For Metro lines, either run the dev server with `2>&1 | tee /tmp/metro.log` and then `./scripts/dump-logs.sh /tmp/metro.log 80 <name>` to copy the last *N* lines into `<name>.log` in the same folder, or paste the relevant Metro pane output into `design-review/repro/<task-id>.log` yourself.

## Scripts

- `scripts/screenshot.sh` — iOS Simulator screenshot to `design-review/repro/<name>.png`.
- `scripts/dump-logs.sh` — last *N* lines from a saved log file into `design-review/repro/<name>.log`.
