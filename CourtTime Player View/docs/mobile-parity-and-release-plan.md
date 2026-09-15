# Mobile Parity & App Store Release Plan

**Created:** 2026-09-15
**Goal:** Bring the Expo app to full **player-facing** parity with the web app, then ship to the iOS App Store and Google Play.
**Decisions locked:** full player parity (including flagged features) · both stores this round.

Supersedes the feature-gap sections of [`MOBILE_DEVELOPMENT_PLAN.md`](../MOBILE_DEVELOPMENT_PLAN.md), which describes an April–May 2026 state. Keep [`docs/mobile-web-sync.md`](./mobile-web-sync.md) as the living contract doc and update it as each phase lands.

---

## 1. Where things actually stand

Verified against the working tree on `main` @ `84d61a0`.

### The drift is large

| Measure | Value |
|---|---|
| Commits since the last full mobile↔web sync (`9bf2fd2`) | **240** |
| Of those, commits that touched `mobile/` | ~20 |
| Commits touching web `src/` / `server/` / `shared/` in that window | 234 |

The web app has absorbed roughly a year of feature work — feature flags, waivers, split payments, Padel, Lessons, Pro Shop, ball-machine passes, player level groups, reservation-type variants, guest fees, daily billing — while mobile received a thin slice of it.

### Baseline health is broken today

Both of these must be fixed before any feature work, or every subsequent change ships unverified:

- **7 of 13 Jest suites fail to run.** Root cause is a single module-resolution problem: `Cannot find module '@babel/runtime/helpers/interopRequireDefault' from '../shared/api/core.ts'`. Files under `shared/` are compiled outside `mobile/`'s resolution root, so Jest can't find `@babel/runtime` even though `mobile/package.json` declares it. 31 tests pass; the other suites never execute.
- **15 TypeScript errors** across `app/_layout.tsx`, `app/auth/reset-password.tsx`, `src/utils/adminPaymentLockout.ts`, and shared modules (`shared/constants/facilityTypes.ts`, `shared/utils/operatingHours.ts`, `shared/api/__tests__/core.test.ts`). Nothing currently gates a merge on `tsc --noEmit`.

### Mobile has no concept of feature flags

`shared/constants/featureFlags.ts` defines **24 flags**, five of which default ON for every new facility. The server enforces them (`server/routes/lessons.ts`, `padel.ts`, `ballMachine.ts`, `proShop.ts`, `playerLevelGroups.ts`, `rules.ts`, `admin.ts`). The web client reads them and shows/hides nav accordingly.

A grep for `feature` across `mobile/app` and `mobile/src` returns **zero hits**. The endpoint mobile needs already exists: `GET /api/facilities/:id/feature-flags` (`server/routes/facilities.ts:464`).

This is the architectural prerequisite for everything else — without it, any flagged feature added to mobile would either appear for facilities that haven't bought it, or be dead code.

### Player features on web that mobile does not have

All of these already have working API routes that authenticate via the same Bearer JWT mobile uses (`req.user.userId`), so this is **client-side work only** — no new backend endpoints.

| Web feature | Flag | Web route / component | Mobile |
|---|---|---|---|
| Lessons & clinics hub | `lessons_tab` | `/lessons` — `Lessons.tsx` (255 ln) | ✗ none |
| Pro Shop (browse, checkout, my orders) | `pro_shop` | `/shop` — `ProShop.tsx` (323 ln) | ✗ none |
| Padel (Americano/Mexicano social play, standings, drop-in pay) | `padel` | `/padel`, `/padel/:id` — `Padel.tsx` + `padel/*` (846 ln) | ✗ none |
| Ball machine passes + access codes | `st_marlow_ball_machine` | `/ball-machine` — `BallMachine.tsx`, `BallMachineAccessDialog.tsx` (557 ln) | ~ partial: hourly rental fee only, in the booking flow. No passes, no access codes, no multi-machine support (`8f1573a`) |
| My Level Group | `player_level_groups` (default ON) | `MyLevelGroup.tsx` (133 ln) | ✗ none |
| Court waiver acceptance at booking | `court_waivers` (default ON) | `CourtWaiverAcceptanceDialog.tsx` (178 ln) | ✗ none — bookings that require a waiver will fail or skip consent |
| Split court payments | `split_court_payments` | `SplitPaymentPicker.tsx` (127 ln) | ✗ none |
| Member number prompt | `member_number` | `MemberNumberDialog.tsx` (72 ln) | ✗ none |
| Week/month calendar overview | `week_month_view` (default ON) | `WeekMonthCalendarView.tsx` (444 ln) | ✗ day view only |
| Bulletin paid signup / withdraw / min-participant handling | — | `BulletinActivitySignupModal.tsx` (257 ln) | ~ signup + share present; no withdraw, no min-participant messaging |
| Club Info: booking rules, General Rules, per-court-type max duration | `general_rules`, `court_type_max_duration` | `ClubInfo.tsx` | ~ Contact / Hours / Courts only — missing the rules and duration sections added in `a603537`, `c3f6971`, `84d61a0` |

Already at parity and needing only a drift check: booking flow (incl. additional courts + guest fees), bulletin board, messages, profile, strikes/lockout, payment lockout, payments, notification settings, Terms + General Rules acceptance gates, admin recurring series.

**Out of scope, deliberately:** CourtTime-Pickle (`pickleball` flag, `src/components/pickle/**`) is a separate product line and is not part of this app. Facility registration, admin consoles, and platform billing stay web-only per `docs/mobile-web-sync.md`.

### Store-compliance blockers

These are *rejection-grade*, not polish:

1. **No in-app account deletion.** Apple Guideline 5.1.1(v) and Google's equivalent both require it for any app that lets users create an account. A broad grep across `mobile/app` and `mobile/src` finds nothing — **and there is no server endpoint either** (`grep delete-account|deleteAccount server/routes/` → no hits). Worse, `legal/ACCOUNT_DELETION.md` already tells users the flow exists: *"Tap Profile → Settings → Delete Account."* The published policy currently describes a feature that does not exist on either client.
2. **All legal documents are unfinished drafts.** `PRIVACY_POLICY.md`, `TERMS_OF_SERVICE.md`, `ACCOUNT_DELETION.md`, and `SUPPORT.md` all carry `> ⚠️ DRAFT — Requires legal review` banners and unfilled placeholders: `[ENTITY NAME]`, `[BUSINESS ADDRESS]`, `[EFFECTIVE DATE]`, `[STATE]`. Apple requires a functioning privacy policy URL, and a reviewer who opens `/privacy` and sees `[ENTITY NAME]` will reject.
3. **No screenshots or marketing assets.** `appstore/screenshots/{ios-6.9,ios-6.5,android}/` and `appstore/marketing/` contain only `.gitkeep`. The Play feature graphic (1024×500) blocks listing publication outright.
4. **App icon is unverified.** `mobile/assets/icon.png` is 1024×1024 but is an 8-bit **colormap** PNG dated 2026-04-20 — it predates the icon work described in `appstore/ASSETS.md` and may carry an alpha channel, which Apple rejects.
5. **Release plumbing unset.** No `extra.eas.projectId` committed, no `EXPO_PUBLIC_SENTRY_DSN`, `eas.json` production/submit profiles are empty `{}`, no `ios.infoPlist.ITSAppUsesNonExemptEncryption` (forces a manual export-compliance answer on every upload), and `expo-updates` is not installed, so there is no OTA channel for post-launch fixes.

Good news on the release side: the app is a clean Expo managed project — `/ios` and `/android` are gitignored and untracked, so EAS Build handles signing without prebuild complications.

---

## 2. Plan

Phases are ordered by dependency. Phases 4–6 can run in parallel with 2–3 because they're mostly non-code work with human wait times (legal review, developer-account approvals).

### Phase 0 — Make the baseline trustworthy ✅ *(complete, 2026-09-15)*

*Blocked everything. Nothing below was verifiable until this was done.*

- ✅ **Jest resolution fixed.** `moduleDirectories` in `mobile/jest.config.cjs` now mirrors `metro.config.js`'s `nodeModulesPaths`, so files under `shared/` can resolve `@babel/runtime` (installed only in `mobile/node_modules`). **13/13 suites now execute — 57 tests, up from 31.**
- ✅ **The 4 failures that surfaced once the suites ran were fixed.** Both were stale test scaffolding, not product bugs: `book-confirm-copy` mocked `useAuth()` without the terms-acceptance members `book.tsx` has required since `e883ddc`, and its two per-test overrides rebuilt the object from scratch — all three now spread one hoisted `mockAuth()` factory, which is what stops this recurring. `adminRevenue` fed May-2026 fixtures to a function that breaks down *the current* month, so it only ever passed during May 2026; its clock is now pinned.
- ✅ **All 15 type errors cleared**, at the source rather than papered over:
  - `shared/api/core.ts` — `normalizeCourtAddResponse` had no declared return type, so callers got a union with the un-flattened input and couldn't read `requiresPayment` / `checkoutUrl`. Now returns a declared `NormalizedCourtAddResponse<T>`.
  - `shared/utils/operatingHours.ts` — `CourtScheduleRowInput` declared `is_open`/`day_of_week` as `boolean`/`number`, while the normalizers parse the string forms JSON actually delivers. The runtime defense was dead code against the declared type; the type is now honest.
  - `shared/constants/facilityTypes.ts` — a non-canonical stored type couldn't be prepended to an `as const` literal tuple.
  - `mobile/src/types/database.ts` — `BulletinPost` declared its dates as `Date`; they are ISO strings off the API.
  - Plus `useSegments` 1-tuple inference (2 layouts), a `styles.subtitle` that never existed (the "Validating reset link…" text was rendering unstyled), and a type-predicate mismatch in `adminPaymentLockout.ts`.
- ✅ **`typecheck` script added** to `mobile/package.json`, with `typecheck:mobile` / `test:mobile` passthroughs at the repo root.
- ✅ **CI added** — `.github/workflows/ci.yml`. The repo had **no CI at all**, which is the direct reason a broken mobile suite and 15 type errors could sit unnoticed. Two jobs: web tests, and mobile typecheck + tests.

**Verified green:** mobile 13/13 suites, 57/57 tests · mobile `tsc --noEmit` 0 errors · web 34/34 suites, 197/197 tests.

> **Found along the way, not fixed:** the web app has **no `tsconfig.json`** — `tsc` has never run against `src/`, and Vite's SWC plugin strips types without checking them. `shared/` is currently typechecked only by way of mobile's config. Standing up web typechecking is its own piece of work (it will surface a backlog) and is not on the release path, but it's worth scheduling.
>
> Also noted: `mobile/src/types/database.ts` tells the same `Date`-vs-string lie on the `Booking` interface, where `book.tsx` works around it with three `as any` casts. Not error-producing, so left alone to keep this phase tight.

### Phase 1 — Feature-flag awareness ✅ *(plumbing complete, 2026-09-15)*

*Everything in Phase 3 depends on this.*

- ✅ **`FeatureFlagContext` added** (`mobile/src/contexts/FeatureFlagContext.tsx`), provided inside `AuthProvider` so it resolves per selected facility. Exposes `isFeatureEnabled(key)`, `enabledFeatures`, `flagsLoaded`, `flagsFromCache`, `refreshFlags`. Re-resolves on login, on facility switch, and on app foreground.
- ✅ **Keys imported from `shared/constants/featureFlags.ts`.** No flag strings are re-typed in mobile.
- ✅ **Resolution order documented** in `docs/mobile-web-sync.md`: live fetch → last known good cached set (**including stale**) → nothing. Flags **fail closed**. The stale tolerance is deliberate and needed its own cache primitive (`getStaleCachedData`), because the ordinary 30-minute TTL would strip a member's features mid-session while offline.
- ✅ **8 tests** covering flag-on, flag-off, fetch failure, malformed payload, offline fallback to cache, facility switch, no-facility, and the stale-response race — a slow answer for a facility the member already left must not repaint the new one. That last test was verified to fail with the guard removed, so it is not vacuous.

**Deferred to Phase 3, deliberately:** the flag-driven **"More" tab**. There is currently nothing to put in it — mobile has no flagged player feature today. (Checked: the ball-machine UI in `book.tsx` is driven by a per-court `ballMachineFeeCents`, not the `st_marlow_ball_machine` flag, which covers passes and access codes; and the General Rules gate is already filtered by flag in server-side SQL, so it needs no client gating.) The tab should land with the first flagged screen rather than shipping empty.

**Verified green:** mobile 14/14 suites, 65/65 tests, 0 type errors.

### Phase 2 — Sync the screens that already exist ✅ *(complete)*

*Catching up existing surfaces to 240 commits of web change. Do this before adding new screens — it's where silent breakage lives.*

#### Drift sweep — done first, because it sets the real worklist

73 commits since `9bf2fd2` touch the core player-facing web components (`BookingWizard`, `QuickReservePopup`, `CourtCalendarView`, `MyReservations`, `ClubInfo`, `BulletinBoard`, `ReservationManagementModal`, `PlayerProfile`). Triaged:

**Intentionally web-only — no mobile work.** Admin drag-to-reassign (`d3a8e5e`), reschedule attribution (`7357844`), kiosk midnight rollover (`e5b077e`), admin booking attribution (`5f82e78`), `:15`/`:45` clickability and blocked/shadow card styling (`900471b`, `c50d985`, `fbdeb01`, `c6e1df8`), drag-to-book fixes (`c45dae6`, `50d68e0`, `fcf463b`), 30-min grid + tooltips (`7d69b34`), post-play close-out (`b7fe7a4`, `747e718`, `f8209ca`), web responsive/viewport fixes (`e0a4dc0`, `1931ea0`, `d31ba23`), date-picker fix (`82da94e`). Mobile has its own calendar grid and no admin console.

**Already ported.** `0066ec3`, `0c2867d`, `a3664ac`, `e883ddc`, `16da84b`, `127ab61`, `ddf91d8`, `acbfd88`, `f73ea3e`, `825970c`.

**Needs porting**, ordered by risk:

| # | Item | Flag | Why it matters |
|---|------|------|----------------|
| 1 | ~~Additional courts + recurring gated on `isAdmin` alone~~ ✅ **done** | `player_multiple_courts`, `player_recurring_bookings` | Mobile was *stricter* than web: a facility that enabled either flag gave its members the feature on web and not in the app |
| 2 | ~~Court waiver acceptance~~ ✅ **done** | `court_waivers` *(default ON)* | Members were hard-blocked: the server rejects with `COURT-WAIVER-NOT-ACCEPTED` and mobile offered no way to resolve it |
| 3 | ~~Deer Lake booking type required~~ ✅ **done** | `deer_lake_reservation_types` | Mobile used the standard list and defaulted to `match`, which Deer Lake's list does not contain |
| 4 | ~~Member number prompt~~ ✅ **done** | `member_number` | Mobile never asked, so those members had no number on file |
| 5 | ~~Split court payments~~ ✅ **done** | `split_court_payments` | Entirely absent on mobile |
| 6 | ~~Guest count + names~~ ✅ **done** | — | Mobile sent a bare `bringGuest` boolean, so admins saw nameless guests |
| 7 | ~~Club Info: rules, General Rules, per-court-type max duration~~ ✅ **done** | `general_rules`, `court_type_max_duration` | `a603537`, `c3f6971`, `84d61a0` |
| 8 | ~~Week/month calendar overview~~ ✅ **done** | `week_month_view` *(default ON)* | `b89a408`; mobile was day-view only |
| 9 | ~~University Club "pay at front desk"~~ ✅ **done** | `university_club_guest_fee` | `85545f8` |
| 10 | ~~Daily vs. hourly court billing~~ ✅ **done** | `court_daily_billing` | A daily-rate court read as **free** on mobile |
| 11 | ~~BHR "Party" reservation type~~ ✅ **done** (with item 3) | `bhr_reservation_types` | `bc5e401` |
| 12 | ~~Multiple named ball machines~~ ✅ **done** | `st_marlow_ball_machine` | With 2+ machines the server rejected every mobile booking that added one |
| 13 | ~~Reservation type when editing~~ ✅ **done** | — | Mobile already preserved it; it could not be *changed* |
| 14 | ~~Default booking length 2h~~ ✅ **done** | — | Mobile tapped to a 30-minute row, not 1h as first triaged |
| 15 | ~~Custom court type labels~~ ✅ **already correct** | — | Mobile renders the stored type verbatim; no filter to break |
| 16 | ~~Bulletin min-participant messaging~~ ✅ **done** | — | Withdrawal already existed; the minimum was never shown |

Lessons, Pro Shop, Padel and My Level Group appear in this window too, but they are new screens and belong to Phase 3.

**Phase 2 complete — all 16 items.**

**Item 16 — bulletin minimums.** Half of this item was a mis-triage: mobile *already had* signup withdrawal, in `handleCancelEventSignup`, which my original grep missed because of the naming. The real gap was the minimum-participant information — mobile showed spots and waitlist but never the minimum, so a member could not tell an event was short of the number it needs to run. `minParticipantsNotice` (shared, 5 tests) states the minimum, and where the organiser has opted to cancel below it, how many more are needed.

**Item 9 — pay at front desk.** A second booking button, under web's conditions, sending `payAtFrontDesk`. The server validates the flag and the guest fee itself ("never trust the client alone"), so an unmet condition falls through to Stripe rather than booking free.

**Item 10 — daily billing.** This was a live bug, not a display gap: `courtRequiresPayment` read only `bookingAmountCents`, so a court billed daily — whose price sits in `dailyRateCents` — **read as free**. Mobile offered "Confirm Booking" on a reservation the server charges for. Now mirrors web's `billingMode` check, with 10 tests.

**Item 12 — multiple ball machines.** Also a hard failure, not a gap. `resolveSelectedMachine` throws "Choose which ball machine to add" when a facility has 2+ active machines and the client names none — so at those facilities *every* mobile booking that added a ball machine failed. Mobile now fetches the machines, auto-selects when there is one, shows a picker at two or more, and blocks the submit rather than sending a request the server will reject.

**Item 13 — reservation type on edit.** Mobile already carried the type through the recreate path, so web's "drops the type" bug never existed here. What was missing was the other half: the type could not be *changed*. `EditBookingModal` now has the same flag-aware chip row as the Book tab, including the Deer Lake required rule.

**Item 14 — default booking length.** My triage had this backwards: `434fb6e` moved *web* to 2 hours to match mobile. But mobile's calendar tap actually selects a single 30-minute row, so the two still diverged. A single-row tap now requests `DEFAULT_BOOKING_DURATION_MINUTES` (shared constant), which the booking screen clamps to real availability — a court with 30 minutes free still opens at 30 minutes. A deliberate drag is untouched.

**Item 15 — custom court labels.** No work needed. Mobile renders `court.courtType` verbatim through the shared subtitle helper, so a custom label like "Clubhouse" already displays; mobile never had the court-type filter that web's `courtTypeLabel` serves.

**Item 7 — Club Info rules.** The max-duration precedence was worth sharing rather than porting: three generations of key names plus the tennis/pickleball split, mirroring the rules engine. It now lives in `shared/utils/clubInfoRules.ts` with 26 tests, **web was refactored onto it** (67 lines of duplicated logic deleted from `ClubInfo.tsx`), and mobile renders the same rows. Also shared: `parseBookingRules`, which handles the booking rules arriving as an object *or* a JSON string with `peakHoursSlots` itself sometimes double-encoded. Mobile gates the section on membership and General Rules text on its flag, as web does, rendering the HTML through `htmlToDisplayText`.

**Item 8 — week/month overview.** A 7-column time grid is unreadable on a phone, so mobile shows the same information in two shapes that suit the screen: a **week agenda** (seven days, each listing its bookings) and a **month grid** of per-day booking counts. Tapping any day hands the date back and switches to the day view — the equivalent of web's "switch to court view". Range maths live in `shared/utils/scheduleOverview.ts` (23 tests) so both clients agree on what a week is; the Monday anchoring and the month-step-from-the-31st case are both covered.

One thing to watch: the month mode issues **one request per day**, 31 on a long month, because that is what the existing `/api/bookings/facility/:id?date=` endpoint allows — web does the same. It is worth a date-range endpoint before this sees heavy mobile use on cellular.

**Items 3 + 11 — reservation type lists.** `reservationTypeKeys` now follows web's precedence (Deer Lake replaces the standard list, BHR appends "Party"), the type is required where Deer Lake requires it, and the label drops "(Optional)" accordingly. The subtle part: mobile defaults `bookingType` to `match`, which Deer Lake's list does not contain — so the chip row would have shown nothing selected while still submitting `match`, and the new required-type check would have waved it through. An effect clears a selection the active list does not offer.

**Item 4 — member number.** `MemberNumberGate`, rendered over the app rather than as an early return like the terms and rules gates, because it depends on the selected facility, which the member changes from inside the tabs. Deliberately not dismissible: no cancel, and Android back is a no-op. `memberNumbers` already reached mobile in the auth payload (it is on `AuthUserShape`, not `User`) and was simply being ignored; mobile's `AuthUser` now declares it.

**Item 5 — split court payments.** `SplitPaymentPicker` mirroring web's, shown under the same five conditions (flag, paid court, single court, not recurring, not post-play settlement), with `splitParticipantIds` reaching the booking payload. The split response flows through the same `requiresPayment` / `checkoutUrl` path mobile already handles, so no new payment plumbing was needed.

**Item 6 — guests.** Replaced the `bringGuest` boolean with web's 0–3 count selector plus a required name per guest, sending `guestCount` and `guestNames`, and the fee total now scales with the count.

**Landed earlier:** items 1–2.

**Item 1** — `canBookAdditionalCourts` / `canUseRecurring` in `book.tsx` now mirror web's `isAdmin || flag`, the submit path uses the same capability as the UI that offered it, and the "(Admin)" label is gone from the recurring control. Three tests, two of which were confirmed to fail against the old gating. This is also the first production consumer of the Phase 1 flag context.

**Item 2 — court waivers.** This was a hard block, not a missing nicety: `buildCourtWaiverBookingBlocker` rejects the booking server-side, so a member at a `court_waivers` facility could not book a waiver-required court from the app at all. Added `useCourtWaiverGate` + `CourtWaiverAcceptanceModal` (mirroring web's hook/dialog pair), wired into the booking submit before any booking call, covering every court in the request including additional ones. Acceptance is per booking — the server only counts one recorded in the last 15 minutes — so the gate runs on every attempt. No client-side flag check is needed: the flag is enforced in the server's SQL, so the pending list comes back empty when it's off.

Two notes on this one:

- **Waivers render as text, not HTML.** Mobile has no HTML renderer and no WebView, and adding one would force a new native build. `htmlToDisplayText` converts admin-authored HTML for display under one rule — *never drop text*; unknown tags are unwrapped rather than removed, since these are consent documents. Formatting is lost, wording is not.
- **It replaced three duplicates.** `TermsAcceptanceGate`, `GeneralRulesAcceptanceGate` and `profile.tsx` each carried their own weaker `htmlToPlainText` (no script/style stripping, no numeric or hex entities). All three now use the shared util, which also upgrades them. 13 tests on the converter, 7 on the gate.

- **Booking flow:** court waiver acceptance (`court_waivers`, default ON — a booking on a waiver-required court today has no consent path), member number prompt (`member_number`), split payments (`split_court_payments`), per-court-type max duration (`court_type_max_duration`), Deer Lake / BHR reservation-type variants, University Club "pay guest fee at front desk", daily vs. hourly billing display, peak/prime-hour indication.
- **Club Info:** add the booking-rules section, General Rules rendering, and the tennis/pickleball max-duration split that web gained in `a603537` / `c3f6971` / `84d61a0`.
- **Community / bulletin:** signup withdrawal, minimum-participant messaging and cancellation notices, parity check on share behavior.
- **Calendar:** week/month overview (`week_month_view`, default ON).
- **Systematic drift sweep:** walk `git log 9bf2fd2..HEAD -- "CourtTime Player View/src"` and triage every player-visible commit as *ported / intentionally web-only / needs porting*. Record the verdicts in `docs/mobile-web-sync.md` so the next sync starts from a known line rather than a 240-commit diff.

### Phase 3 — Build the missing flagged features

Each is a self-contained screen behind its flag, consuming existing endpoints. Suggested order by member impact:

1. **Ball machine** — complete it: passes, access codes, multiple named machines (`GET /api/ball-machine/status/:facilityId`, `/access-code/:facilityId/:machineId`, `/purchase/:facilityId`).
2. **Lessons** — `GET /api/lessons/:facilityId`, sign-up flow.
3. **Pro Shop** — products, checkout, my orders (`/api/pro-shop/products|checkout|my-orders/:facilityId`). Note the App Store consideration in Risks below.
4. **My Level Group** — `GET /api/player-level-groups/:facilityId/me`, plus the group conversation entry point.
5. **Padel** — largest of the five: session list, create social play, join/leave, standings, drop-in payment (`/api/padel/*`). Reuse `shared/utils/padelPairing.ts` rather than reimplementing pairing logic.

Rule for the whole phase: business logic goes in `shared/` and is consumed by both clients. Resist re-implementing web logic in React Native — that's how this drift happened.

### Phase 4 — Store-compliance blockers *(start in parallel with Phase 2)*

- **Account deletion, end to end.** This is a three-part build: a `DELETE /api/users/me` (or equivalent) server endpoint honoring the retention rules already written in `legal/ACCOUNT_DELETION.md`; a Profile → Settings → Delete Account flow on mobile with a confirmation step; and the matching web flow the policy also promises. Handle the edge cases the policy implies — active bookings, outstanding balances, facility memberships, sole-admin accounts.
- **Finalize the legal documents.** Fill `[ENTITY NAME]`, `[BUSINESS ADDRESS]`, `[EFFECTIVE DATE]`, `[STATE]`; remove the DRAFT banners; get the review the banners ask for. Verify `/privacy`, `/terms`, `/support`, `/delete-account` all render publicly on `courttimeapp.com` — reviewers open these.
- **Privacy disclosures.** Apple privacy nutrition labels and Google Play Data Safety must match reality: account data, contact info, photos (`expo-image-picker`), calendar (`expo-calendar`), push tokens, Stripe payment flows, Sentry crash data.
- **Permission strings.** Audit every `app.json` permission prompt for the specific, plain-language phrasing Apple expects.

### Phase 5 — Release engineering

- Create the EAS project; commit `EXPO_PUBLIC_EAS_PROJECT_ID` handling and set `extra.eas.projectId`.
- Fill in the empty `eas.json` `production` and `submit` profiles (bundle IDs, Apple team, ASC app ID, Play service-account key).
- Add `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` (assuming only standard HTTPS) so every upload stops asking.
- Stand up Sentry: set `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` so `app.config.js` wires the source-map plugin. Verify a test crash arrives.
- Install and configure `expo-updates` with release channels — this is what lets you fix a launch bug in hours instead of a review cycle.
- Confirm production API resolution (`https://www.courttimeapp.com`) in a real release build, not just Expo Go.
- Produce preview builds for both platforms and install them on real hardware.

### Phase 6 — QA on real devices

*This phase compresses the least. Everything above is code; this is hands on phones.*

- Run the QA checklist in `docs/mobile-web-sync.md` plus new rows for every Phase 2/3 feature.
- Flag-matrix testing: pick 3–4 real facilities with different flag combinations and verify each member sees exactly their facility's features — including a multi-facility user switching between a flag-on and flag-off club mid-session.
- Money paths on real devices: Stripe checkout return, guest fees, split payments, ball machine purchase, bulletin paid signup, Pro Shop checkout, payment lockout paywall.
- Account deletion tested to completion on both platforms (reviewers *will* test this one).
- Push delivery in a production build, offline/airplane-mode behavior, token expiry mid-session, timezone handling, tablet layout, small-screen (iPhone SE) layout.

### Phase 7 — Assets, listing, submission

- Produce the assets per `appstore/ASSETS.md`: verify/replace `icon.png` (1024×1024, sRGB, **no alpha**), `adaptive-icon.png`, five screenshots each for iOS 6.9", iOS 6.5", and Android, plus the 1024×500 Play feature graphic and 512×512 Play icon. Screenshots must show real-looking data and must not show a feature the reviewer's test account can't reach.
- Finalize listing copy from `appstore/LISTING.md`.
- Complete Apple Developer and Play Console enrollment if not already done (both have approval lag — start early).
- **Give reviewers a working demo account** seeded at a facility with the flags you want shown, pre-loaded with bookings and messages. Put the credentials in App Review notes. An app whose content is invisible behind a club membership is a classic "incomplete functionality" rejection.
- Submit iOS and Android. Start Play on internal testing → closed → production.

---

## 3. Risks

- **Pro Shop and Apple's 30%.** If the Pro Shop sells physical goods (racquets, strings, apparel), Stripe is correct and permitted. If any Pro Shop or Lessons item is a *digital* good or service consumed in-app, Apple will demand In-App Purchase. Audit the catalog before submitting; the safe path is to keep digital-goods purchases web-only.
- **Reviewer can't see the app.** Every meaningful screen requires facility membership. Mitigated by the seeded demo account above — treat it as a launch blocker, not a nicety.
- **The flag surface is wide.** 24 flags × facility combinations is a large test matrix. The "More" tab approach keeps the UI honest, but budget real QA time for the combinations your actual clubs use.
- **Legal review is a human dependency** with no engineering workaround. Start Phase 4 the same day as Phase 2.
- **Drift returns the moment this ships.** The 240-commit gap happened because nothing made web changes consider mobile. Recommended countermeasure: a PR checklist item asking "does this change player-facing behavior? if so, is there a mobile issue?", plus keeping shared logic in `shared/`.

## 4. Sequencing

```
Phase 0 ──▶ Phase 1 ──▶ Phase 2 ──▶ Phase 3 ──┐
                                               ├──▶ Phase 6 ──▶ Phase 7 ──▶ submit
           Phase 4 (start early, parallel) ────┤
           Phase 5 (after Phase 1) ────────────┘
```

Critical path runs through Phase 3 (Padel and Pro Shop are the two largest builds) and Phase 6 (device QA can't be compressed). Phases 4 and 7 carry human wait time — legal review, developer-account approval, store review — so start them before the code is finished, not after.
