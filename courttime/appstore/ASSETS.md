# CourtTime — App Store / Play Store Asset Specs

Everything you need to ship visual assets for App Store + Play Store submission. **Claude can't produce raster images directly — these need to be made in Figma, Canva, Photoshop, or via an AI image tool (Midjourney, ChatGPT image, Adobe Express).** This doc covers exact dimensions, formats, content, and where each file lives.

---

## Brand foundation

You already have a finished horizontal logo at `mobile/assets/splash-logo.png`:

> The green tennis-ball "C" mark + "CourtTime" wordmark

For app icons specifically, you need an **icon-only version of just the C mark** — the square format doesn't have room for the wordmark.

**Brand colors (lift these from the existing logo):**
- Primary green: `#1a5f2a` (dark green, already used as Android adaptive-icon background)
- Lighter accent green: `#34a853` or similar (sample from the C mark)
- White: `#ffffff` (court lines, negative space)

---

## 1. iOS App Icon

| Spec | Value |
|---|---|
| **File** | `mobile/assets/icon.png` |
| **Dimensions** | 1024 × 1024 px |
| **Format** | PNG, **no transparency** (Apple rejects icons with alpha channels) |
| **Color space** | sRGB |
| **Corners** | Square — Apple rounds them automatically |
| **Margin** | Avoid placing critical content in the outer ~10% (visual safe area) |

**Design:** square with the brand green `#1a5f2a` as the background, centered C mark in white or lighter green. Avoid text — the icon is shown at sizes as small as 29 px and any text becomes unreadable.

**Common rejections:** transparency, photographic content, screenshots-as-icons, Apple's logo or store badges in the icon.

---

## 2. Android Adaptive Icon

Android uses a two-layer system so device launchers can apply different mask shapes (circle, squircle, teardrop, etc.).

### Foreground layer

| Spec | Value |
|---|---|
| **File** | `mobile/assets/adaptive-icon.png` |
| **Dimensions** | 1024 × 1024 px |
| **Format** | PNG with transparency |
| **Safe zone** | Center 66% (about 672 px diameter) — this is what's always visible regardless of mask shape |
| **Content** | Just the C mark, transparent background |

### Background layer

Already configured as a solid color in `mobile/app.json`:

```json
"adaptiveIcon": {
  "foregroundImage": "./assets/adaptive-icon.png",
  "backgroundColor": "#1a5f2a"
}
```

If you want a textured background instead of solid green, you'd add a second PNG and reference it as `backgroundImage`. Solid green is fine for v1.

---

## 3. Splash screen

| Spec | Value |
|---|---|
| **File** | `mobile/assets/splash-logo.png` |
| **Current dimensions** | 1368 × 402 px ✓ |
| **Background color** | `#ffffff` (set in `app.json`) |
| **Resize mode** | `contain` (set in `app.json`) |

This one's already done. The horizontal CourtTime logo sits centered on a white background while the app loads. If you want the splash to use the brand green instead of white, change `"backgroundColor": "#ffffff"` to `"#1a5f2a"` in `mobile/app.json` and make sure the logo's outline reads against green.

---

## 4. iPhone Screenshots

Apple requires screenshots at **at least one** of these display sizes. Bigger sizes are reused for smaller devices, so in practice you only need to ship the largest:

| Display size | Pixels (portrait) | Required? |
|---|---|---|
| **6.9" (iPhone 16 Pro Max)** | 1290 × 2796 | Strongly recommended (newest hardware) |
| **6.7" (iPhone 14 Pro Max)** | 1290 × 2796 | Required if shipping to current iPhones |
| **6.5" (iPhone 11 Pro Max / XS Max)** | 1242 × 2688 | Required for older device support |
| **5.5" (iPhone 8 Plus)** | 1242 × 2208 | Optional (legacy) |

**Quantity:** 3 minimum, 10 maximum per size.

**Recommended set (5 screenshots):**
1. **Quick Book on Home** — shows "next available 1-hour slot" cards (lead with the killer feature)
2. **Calendar / Booking flow** — calendar grid view of court availability
3. **Booking detail / confirmation** — modal showing court, time, type
4. **Drill sign-up** — bulletin board with a drill post and sign-up button
5. **Find a Hitting Partner** — community tab with partner posts

**Before taking screenshots:**
- Use real-looking data (real court names, member names that look real, future dates). No "Test Court 1" or "Lorem ipsum."
- Set the device clock to a believable time (not 03:42 AM).
- Status bar should be clean — full battery, 5 bars, current time.
- For iOS: `xcrun simctl status_bar booted override --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3`

**Adding marketing copy on top of screenshots** (optional but converts better):
- Add a one-line headline above each screenshot: "Book in seconds.", "Find a partner.", "Never miss a slot."
- Keep the device frame visible (Apple/Google both approve this style).
- Tools: [previewed.app](https://previewed.app), [hotpot.ai/screenshot-builder](https://hotpot.ai/screenshot-builder), [Rotato](https://rotato.app), or build in Figma.

---

## 5. Android Screenshots

| Spec | Value |
|---|---|
| **Aspect ratio** | 16:9 or 9:16 (portrait recommended) |
| **Min size** | 320 px on shortest side |
| **Max size** | 3840 px on longest side |
| **Quantity** | 2 minimum, 8 maximum |
| **File format** | PNG or JPEG, RGB |

**Recommended pixel size:** 1080 × 1920 (matches a typical Android phone). Use the same five flows as iOS — Android reviewers want to see the same content adapted for Android, not different screens entirely.

---

## 6. Google Play Feature Graphic

| Spec | Value |
|---|---|
| **Dimensions** | 1024 × 500 px |
| **Format** | PNG or JPEG, RGB, no transparency |
| **Required?** | Yes, blocks listing publication |

This banner shows at the top of your Play Store listing. Recommended composition:

- Brand green background (`#1a5f2a`)
- CourtTime wordmark + tennis-ball "C" mark on the left
- Tagline on the right: "Book courts. Play more." or "Tennis & Pickleball court reservations."
- Avoid putting critical content in the outer 100 px (Play crops differently on different devices)
- No screenshots inside the feature graphic (Google's guidelines)

---

## 7. Google Play Icon (separate from app icon)

| Spec | Value |
|---|---|
| **Dimensions** | 512 × 512 px |
| **Format** | 32-bit PNG with alpha |
| **Note** | Same design as the iOS icon, just smaller and with transparency allowed. |

You can downscale your 1024×1024 iOS icon for this — the source design is the same.

---

## Recommended workflow

1. **Make the icon-only "C" mark** (60–90 min in Figma, or 5 min in an AI image tool)
   - Open `mobile/assets/splash-logo.png` for color reference
   - Output: 1024×1024 PNG, square, brand green background, white C mark, no transparency
2. **Replace `mobile/assets/icon.png` and `mobile/assets/adaptive-icon.png`**
   - icon.png: solid green background + C mark, no transparency
   - adaptive-icon.png: transparent background + C mark only (Android adds the green via `backgroundColor`)
3. **Test the icon in the build**
   - Run `npx expo prebuild --clean` then `npx expo start`
   - Check on a physical phone — icons look different from simulators
4. **Take screenshots** (1–2 hr if data is ready)
   - Boot the iOS Simulator with the largest device size you can (iPhone 16 Pro Max → 6.9")
   - Run through the 5 recommended flows
   - For Android, use Android Studio's emulator or a real phone with `adb exec-out screencap -p > shot.png`
5. **Design the feature graphic** (15–30 min if reusing the splash logo composition)
   - 1024 × 500 PNG, green background, logo + tagline
6. **Drop everything in `appstore/screenshots/` and `appstore/marketing/`** so it's tracked in git

---

## File structure (suggested)

```
appstore/
  LISTING.md          (the metadata copy — already created)
  ASSETS.md           (this file)
  marketing/
    feature-graphic-1024x500.png
    play-icon-512.png
  screenshots/
    ios-6.9/
      01-quick-book.png
      02-calendar.png
      03-booking-detail.png
      04-drill-signup.png
      05-find-partner.png
    ios-6.5/         (same 5, smaller resolution)
    android/         (same 5 reflowed for Android)
mobile/assets/       (live in-app assets — replace icon.png and adaptive-icon.png here)
```

---

## Quick AI prompts that have worked for tennis-app icons

If you want to generate the C mark with ChatGPT image / Midjourney instead of Figma:

> Create a 1024x1024 px square iOS app icon for a tennis court booking app called CourtTime. Solid background color #1a5f2a (forest green). Centered, a clean modern letter 'C' formed by the curved seam of a tennis ball, in white. Flat design, no shadows, no text, no transparency, edges full to the corners (no padding around the icon — system rounds corners automatically).

> Create a 1024x500 px Google Play feature graphic for CourtTime, a tennis & pickleball court booking app. Solid forest-green background (#1a5f2a). On the left, a white tennis-ball-shaped letter 'C' icon (about 350 px tall). To the right of it, large bold white text "CourtTime" stacked above smaller text "Book courts. Play more." Modern, flat, sporty.

Iterate on the prompt until you get a result you like, then download the PNG and commit it to the right folder.

---

## What to do once assets are ready

- [ ] Replace `mobile/assets/icon.png` (1024 × 1024, no transparency)
- [ ] Replace `mobile/assets/adaptive-icon.png` (1024 × 1024, transparent background)
- [ ] (Optional) Update `mobile/app.json` splash backgroundColor if you want it green instead of white
- [ ] Add screenshots under `appstore/screenshots/ios-6.9/`, `ios-6.5/`, `android/`
- [ ] Add `appstore/marketing/feature-graphic-1024x500.png`
- [ ] Add `appstore/marketing/play-icon-512.png`
- [ ] Commit + push so Reid can review
- [ ] In App Store Connect / Play Console: upload the relevant files when you create the listing
