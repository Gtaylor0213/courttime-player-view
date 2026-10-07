# Mobile Before/After Screenshot Checklist

This environment cannot access iOS simulator tooling (`xcrun simctl` unavailable), so screenshot capture must be run locally.

## Required screen set

Capture each screen twice: `before` and `after`.

1. Book
2. Community
3. Home
4. Messages
5. Profile
6. Club Info
7. QuickReserve modal
8. Find a Partner form

## Filename convention

Store files in:

- `design-review/before-after/before/`
- `design-review/before-after/after/`

Use deterministic names:

- `book.png`
- `community.png`
- `home.png`
- `messages.png`
- `profile.png`
- `club-info.png`
- `quick-reserve-modal.png`
- `find-partner-form.png`

## iOS commands

```bash
# Boot simulator first, then run:
xcrun simctl io booted screenshot "design-review/before-after/after/book.png"
```

Repeat for each screen and for `before/`.

## Android command

```bash
adb exec-out screencap -p > "design-review/before-after/after/book.png"
```

## Notes

- Use the same test account and facility for both `before` and `after`.
- Keep device/frame consistent per pair.
- Capture after content is fully loaded (no transient spinners).
