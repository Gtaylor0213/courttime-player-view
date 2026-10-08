# CourtTime — App Store & Play Store Listing Copy

> Drafts. Pick your favorites, edit to taste, then paste into App Store Connect / Google Play Console. Everything below is written for the **player-facing app** (the one members install). The facility/admin web product is sold separately and isn't part of this listing.

---

## App name

- **App Store (30 char limit):** `CourtTime`
- **Play Store (30 char limit):** `CourtTime`

If you want a tagline appended to the name (Apple allows this in the **Subtitle** field, 30 chars):

- `Tennis & Pickleball Booking`
- `Book Courts. Play More.`
- `Court Time, On Demand`

---

## Short description (80 char limit — used by Google Play; also a useful elevator pitch)

Pick one:

- **Book courts, find partners, and stay on top of your tennis & pickleball game.** (78 chars)
- **Court reservations and community for tennis & pickleball club members.** (70 chars)
- **Skip the phone calls — reserve courts and message partners at your club.** (72 chars)

Recommendation: **first one** — covers both sports and three core benefits.

---

## Promotional text (170 char limit — Apple, can update without resubmitting)

Use this for time-sensitive callouts later (new features, seasonal events). For launch:

- **The fastest way to reserve a court at your tennis or pickleball club. Real-time availability, drill sign-ups, and direct messaging with other members.** (152 chars)

---

## Full description (4000 char limit — both stores accept up to ~4000)

> Lead with the benefit, then the differentiator, then the feature list. Around 2,000 chars below.
>
> **Checked against the app on 8 Oct 2026.** Every claim below is something the reviewer can see in the demo club. Apple rejects listings that describe features the app does not have (Guideline 2.3.1), so re-check this if features change. Removed in that check: booking reminders before a reservation (the app has the setting but nothing sends them yet), filtering partners by USTA rating or play style (only skill level exists), "cancel without fees" and "any time before it starts" (clubs set their own cancellation rules), and unverifiable lines such as "why members love CourtTime".

```
CourtTime is the fastest way to reserve a court at your tennis or pickleball club.

Tired of calling the front desk to find out which courts are open? CourtTime shows live availability for every court at your facility and lets you book in a couple of taps. Whether you're playing a league match, scheduling a lesson, or grabbing the next open hour, CourtTime puts your club's court schedule in your pocket.

WHAT YOU CAN DO

• See every court's schedule at a glance — no more phone tag.
• Tap an open time to book it, or use Quick Reserve to grab the next open hour today.
• Edit or cancel a reservation from your phone, within your club's rules.
• Get notified when a booking is confirmed, changed or cancelled.
• Add a booking to your phone's calendar in one tap.

FIND HITTING PARTNERS

Looking for a doubles partner or someone at your level? Post what you're looking for, browse other members' posts by skill level, and start a conversation directly in the app.

DRILLS, EVENTS, AND ANNOUNCEMENTS

Your facility's bulletin board is built right in. Sign up for drills and clinics, join the waitlist when they fill up, and see club announcements as they are posted.

MESSAGES

Message other members of your club one-to-one or in groups. You can report a message or post and block a member at any time.

MULTI-CLUB SUPPORT

Member at more than one facility? Switch between clubs from the header without signing in again. Your bookings, messages, and announcements follow whichever club you're viewing.

SECURE AND PRIVATE

Your bookings, messages, and profile are visible only to members of your facility. We never sell your data and never run third-party advertising trackers. Read our full privacy policy at courttimeapp.com/privacy.

GETTING STARTED

The CourtTime app is free to download and use. Your facility administrator will invite you, or you can request membership from the app. Some clubs charge their own fees for courts, clinics or dues, which are set by the club. If your club doesn't use CourtTime yet, ask them to check it out at courttimeapp.com.

QUESTIONS?

Email reidbissell@courttimeapp.com or visit courttimeapp.com/support.
```

---

## Keywords (App Store only — 100 char limit, comma-separated, no spaces around commas)

The Apple keyword field is invisible to users but heavily affects search. Don't repeat words from your title. Use singular forms; Apple already handles plurals.

```
tennis,pickleball,court,booking,reservation,club,schedule,player,partner,drill,USTA,member,reserve
```

(That's exactly 100 chars including commas — perfect.)

If you want to drop something to make room for `racket`, `match`, or `pro`, the lowest-value words above are `member`, `reserve`, and `schedule`.

---

## Category and tags

| Field | Value |
|---|---|
| **Primary category** | Sports |
| **Secondary category (App Store)** | Lifestyle |
| **Tags / Genre (Play Store)** | Sports → Tennis (closest match) |
| **Content rating** | Set by each store's questionnaire. Answer **yes** to user-generated content and member-to-member messaging; with those, Apple's rating is likely to come out above 4+. |

---

## Required URLs

| Field | Value |
|---|---|
| **Privacy Policy URL** | `https://courttimeapp.com/privacy` |
| **Terms of Service URL** | `https://courttimeapp.com/terms` |
| **Account Deletion URL** | `https://courttimeapp.com/delete-account` |
| **Support URL** | `https://courttimeapp.com/support` |
| **Marketing URL** | `https://courttimeapp.com/about` |
| **Support email** | `reidbissell@courttimeapp.com` |

---

## What's needed in App Store Connect / Play Console

### App Store Connect (when you create the app record)

- **Name:** CourtTime
- **Subtitle:** (one of the options above, 30 chars)
- **Bundle ID:** `com.courttime.player` (already set in mobile/app.json)
- **SKU:** anything unique to you (e.g. `COURTTIME-PLAYER-001`)
- **Primary Language:** English (U.S.)
- **Privacy Policy URL:** `https://courttimeapp.com/privacy`
- **Description:** paste the full description above
- **Keywords:** paste the keyword list above
- **Promotional Text:** paste from the section above
- **Support URL:** `https://courttimeapp.com/support`
- **Marketing URL:** `https://courttimeapp.com/about`
- **Category:** Sports / Lifestyle
- **Age rating:** complete the questionnaire honestly. The app has messaging between members and member posts, so answer yes to those questions; do not expect 4+.

### Google Play Console (when you create the app)

- **App name:** CourtTime
- **Short description (80 chars):** paste from above
- **Full description (4000 chars):** paste from above
- **App icon:** 512 × 512 PNG
- **Feature graphic:** 1024 × 500 PNG (required, shows at top of listing)
- **Phone screenshots:** 2–8 (16:9 or 9:16)
- **Category:** Sports
- **Tags:** Tennis (best match)
- **Content rating:** complete the IARC questionnaire, answering yes to user-to-user communication and user-generated content
- **Data Safety form:** required, takes ~30 min — declares what data you collect (cross-reference your Privacy Policy)
- **Privacy Policy URL:** `https://courttimeapp.com/privacy`

---

## Things to prep before you submit (not copy, but called out so you don't get rejected)

- The **demo account** and the text for the review notes are in [`REVIEW_NOTES.md`](./REVIEW_NOTES.md). Run `npm run seed:review` shortly before submitting so the demo club's bookings are in the future.
- **Screenshots** are in [`screenshots/ios-6.9/`](./screenshots/ios-6.9/) (five, 1320 × 2868, no transparency).
- **Account deletion** is in the app under Profile → Delete Account. Test it once on a real device before submitting, then re-run the seed to restore the demo account.
- The **Render production environment** must be online and reachable when reviewers test. Don't submit during a deploy or migration.

---

