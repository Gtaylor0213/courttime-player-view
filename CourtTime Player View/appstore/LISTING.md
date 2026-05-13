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
- **Reserve courts in seconds. Find hitting partners. Never miss a reminder.** (72 chars)
- **Court reservations and community for tennis & pickleball club members.** (70 chars)
- **Skip the phone calls — reserve courts, message partners, get reminders.** (71 chars)

Recommendation: **first one** — covers both sports and three core benefits.

---

## Promotional text (170 char limit — Apple, can update without resubmitting)

Use this for time-sensitive callouts later (new features, seasonal events). For launch:

- **The fastest way to reserve a court at your tennis or pickleball club. Real-time availability, drill sign-ups, and direct messaging with other members.** (152 chars)

---

## Full description (4000 char limit — both stores accept up to ~4000)

> Lead with the benefit, then the differentiator, then the feature list. Around 1,800 chars below — leaves room to grow if you want to add testimonials, club logos, or specific features.

```
CourtTime is the fastest way to reserve a court at your tennis or pickleball club.

Tired of calling the front desk to find out which courts are open? CourtTime shows real-time availability for every court at your facility, lets you book in two taps, and reminds you before your reservation. Whether you're playing a league match, scheduling a lesson, or grabbing the next open hour, CourtTime puts your club's court schedule in your pocket.

WHY MEMBERS LOVE COURTTIME

• See open courts at a glance — no more phone tag.
• Book the next available 1-hour slot with one tap.
• Cancel or change your reservation any time before it starts.
• Get a heads-up notification before your court time begins.
• Never lose a slot to a no-show again — open spots show up the moment they free up.

FIND HITTING PARTNERS

Looking for a doubles partner or someone at your level? Post what you're looking for, browse other members' posts, and start a conversation directly in the app. Filter by skill level, USTA rating, or play style.

DRILLS, EVENTS, AND ANNOUNCEMENTS

Your facility's bulletin board is built right in. RSVP for drills and clinics, join waitlists when they fill up, and never miss a tournament announcement. Some drills have gender-restricted sign-ups — your profile preferences are honored automatically.

MULTI-CLUB SUPPORT

Member at more than one facility? Switch between clubs from the header without re-signing in. All your bookings, messages, and announcements are scoped to whichever club you're viewing.

BUILT FOR PLAYERS, NOT JUST ADMINS

CourtTime was built with input from real club members. The Quick Book section surfaces the soonest open slots so you can grab a court without scrolling. Edit a reservation in seconds. Cancel without fees up until your start time. Notification preferences let you silence the categories you don't care about.

SECURE AND PRIVATE

Your bookings, messages, and profile are visible only to members of the same facility. We never sell your data and never run third-party advertising trackers. Read our full privacy policy at courttimeapp.com/privacy.

GETTING STARTED

CourtTime is free for members of participating facilities. Your facility administrator will invite you, or you can request membership directly from the app. If your club doesn't use CourtTime yet, ask them to check it out at courttimeapp.com.

QUESTIONS?

Email support@courttimeapp.com or visit courttimeapp.com/support.
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
| **Content rating** | 4+ (App Store) / Everyone (Play Store) |

---

## Required URLs

| Field | Value |
|---|---|
| **Privacy Policy URL** | `https://courttimeapp.com/privacy` |
| **Terms of Service URL** | `https://courttimeapp.com/terms` |
| **Account Deletion URL** | `https://courttimeapp.com/delete-account` |
| **Support URL** | `https://courttimeapp.com/support` |
| **Marketing URL** | `https://courttimeapp.com/about` |
| **Support email** | `support@courttimeapp.com` |

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
- **Age rating:** complete the questionnaire (you'll likely land at 4+)

### Google Play Console (when you create the app)

- **App name:** CourtTime
- **Short description (80 chars):** paste from above
- **Full description (4000 chars):** paste from above
- **App icon:** 512 × 512 PNG
- **Feature graphic:** 1024 × 500 PNG (required, shows at top of listing)
- **Phone screenshots:** 2–8 (16:9 or 9:16)
- **Category:** Sports
- **Tags:** Tennis (best match)
- **Content rating:** complete the IARC questionnaire — should land at "Everyone"
- **Data Safety form:** required, takes ~30 min — declares what data you collect (cross-reference your Privacy Policy)
- **Privacy Policy URL:** `https://courttimeapp.com/privacy`

---

## Things to prep before you submit (not copy, but called out so you don't get rejected)

- A **demo account** for Apple's reviewer to log into. They will not approve an app that requires login without working credentials. Create a `apple-reviewer@courttimeapp.com` test player at one of your facilities and put the password in the **App Review Information** field. Don't use your real account.
- Real **screenshots** that show actual data, not placeholder text. Reviewers reject apps with empty states or `Lorem ipsum`.
- A working **`/delete-account`** flow inside the app (we have this on web — confirm the mobile profile screen exposes it before submitting).
- The **Render production environment** must be online and reachable when reviewers test. Don't submit during a deploy or migration.

---

