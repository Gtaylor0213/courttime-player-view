# Play Console — Field-by-Field Answers

Every answer to give in **Play Console → Policy and programs → App content**, plus the store listing. Work down the page in this order; each section is one task card in the console.

**Submitted in Play Console on 8 Oct 2026; this file matches what was entered.** Verified on 14 Oct 2026 against the Oct 14 preview APK (commit `71abb39`): its merged manifest has **no** `AD_ID` permission and **no** `READ_MEDIA_IMAGES`/`READ_MEDIA_VIDEO`, sign-in is email and password only, and no Sentry DSN is set in any EAS environment. Re-check these three if dependencies change before you submit.

The reasoning behind each data answer is in [`PRIVACY_DECLARATIONS.md`](./PRIVACY_DECLARATIONS.md). If the two ever disagree, fix both in the same commit.

---

## 1. Privacy policy

| Field | Answer |
|---|---|
| Privacy policy URL | `https://courttimeapp.com/privacy` |

## 2. App access

| Field | Answer |
|---|---|
| Access | **All or some functionality is restricted** |
| Instruction name | `Member account` |
| Username | `appreview@courttimeapp.com` |
| Password | `CourtTimeReview1!` |
| Any other information | `Member of the fictional CourtTime Demo Club. No real member data is visible.` |

Click **Add instructions** again for the second account:

| Field | Answer |
|---|---|
| Instruction name | `Club admin account` |
| Username | `appreview-admin@courttimeapp.com` |
| Password | `CourtTimeAdmin1!` |
| Any other information | `Shows the Admin tab for the same demo club.` |

Run `npm run seed:review` from `courttime/` shortly before you send the build for review, so the demo bookings are in the future.

## 3. Ads

**No, my app does not contain ads.**

## 4. Content rating

Start the IARC questionnaire with email `reidbissell@courttimeapp.com`.

| Question | Answer |
|---|---|
| Category | **All Other App Types** (it is a booking utility, not a game or social network) |
| Violence, sexuality, language, controlled substances, gambling | **No** to all |
| Does the app allow users to interact or exchange content with other users? | **Yes**: messaging, bulletin and hitting-partner posts |
| Does the app share the user's current physical location with other users? | **No** |
| Does the app allow users to buy digital goods? | **No**: club fees are real-world services paid through Stripe |
| Is the app a web browser or search engine? | **No** |

Expect a Teen-ish rating because of user interaction. That is normal and fine.

## 5. Target audience and content

| Field | Answer |
|---|---|
| Target age groups | **13–15, 16–17, 18 and over**: the Terms allow members from 13. Do **not** tick anything under 13; that pulls the app into the Families policy. |
| Could the app unintentionally appeal to children? | **No** |
| Store listing appeals to children? | **No** |

If you would rather avoid the extra teen-audience scrutiny, tick **18 and over** only. It's a valid answer as long as the app isn't aimed at under-18s.

## 6. News app

**No.**

## 7. Data safety

### Overview page

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** |
| Which methods of account creation does your app support? | **Username and password** only |
| Delete account URL | `https://courttimeapp.com/delete-account` |
| Do you provide a way for users to request that some or all of their data is deleted, without requiring them to delete their account? | **No** (optional question; this is what was submitted on 8 Oct 2026) |

### Data types to tick

Tick **only** these. Leave everything else unticked: Location, Health and fitness, Audio, Files and docs, Calendar, Contacts, Web browsing, App info and performance, and the other subtypes not listed.

| Category | Tick |
|---|---|
| Personal info | Name · Email address · User IDs · Address · Phone number · Other info |
| Financial info | Purchase history |
| Messages | Other in-app messages |
| Photos and videos | Photos |
| App activity | Other user-generated content · Other actions |
| Device or other IDs | Device or other IDs |

Why some boxes stay empty:
- **Calendar**: the app writes a booking into the phone's calendar on request. Nothing from the calendar leaves the phone, so it isn't collected.
- **App info and performance**: Sentry is off (no DSN anywhere). If you switch Sentry on before submitting, tick **Crash logs** and **Diagnostics**, both not shared, required, purpose App functionality.
- **Financial info → User payment info**: card details go only to Stripe's hosted checkout and never reach the app or our servers.

### Per-type questions

Play asks the same four questions for every ticked type. Answer like this:

| Data type | Collected / shared | Processed ephemerally? | Required or optional | Purposes |
|---|---|---|---|---|
| Name | Collected, **not shared** | No | Required | App functionality · Account management |
| Email address | Collected, not shared | No | Required | App functionality · Account management |
| User IDs | Collected, not shared | No | Required | App functionality · Account management |
| Address | Collected, not shared | No | **Optional** | App functionality · Account management |
| Phone number | Collected, not shared | No | **Optional** | App functionality · Account management |
| Other info (gender, skill level) | Collected, not shared | No | **Optional** | App functionality |
| Purchase history | Collected, not shared | No | **Optional** (only clubs that charge) | App functionality |
| Other in-app messages | Collected, not shared | No | **Optional** | App functionality |
| Photos | Collected, not shared | No | **Optional** | App functionality |
| Other user-generated content (posts, bio, reports) | Collected, not shared | No | **Optional** | App functionality |
| Other actions (reservations, sign-ups) | Collected, not shared | No | Required | App functionality |
| Device or other IDs (push token) | Collected, not shared | No | **Optional** (only if notifications are allowed) | App functionality |

**"Not shared" is correct for everything.** Stripe, Resend and Expo's push service process data on CourtTime's behalf, and Play's definition excludes service providers from "sharing". Data shown to other members of the same club is part of the app's function, not sharing with a third party.

## 8. Government apps

**No.**

## 9. Financial features

**My app doesn't provide any financial features.** Members pay their club through Stripe Checkout; the app isn't a payment service, lender or wallet.

## 10. Health apps

**My app does not have any health features.** Skill level and NTRP rating are sporting ability, not health data.

## 11. Advertising ID

**No.** The manifest has no `com.google.android.gms.permission.AD_ID` permission, so the console should accept this without a warning. If it warns anyway after the upload, a new dependency added the permission. Block it in `app.json` rather than changing the answer.

---

## Store listing (Grow users → Store presence → Main store listing)

| Field | Value |
|---|---|
| App name | `CourtTime` |
| Short description | `Book courts, find partners, and stay on top of your tennis & pickleball game.` |
| Full description | The block under "Full description" in [`LISTING.md`](./LISTING.md) |
| App icon | `marketing/play-icon-512.png` |
| Feature graphic | `marketing/play-feature-graphic-1024x500.png` |
| Phone screenshots | `screenshots/android/01-home.png` … `05-messages.png`, in that order (945 × 1837, taken on a Samsung on 19 Oct 2026) |

**Store settings** (Store presence → Store settings):

| Field | Value |
|---|---|
| App category | Application · **Sports** |
| Tags | Tennis (closest match) |
| Email | `reidbissell@courttimeapp.com` |
| Website | `https://courttimeapp.com` |
| Phone | Optional; leave blank unless you want it public |
