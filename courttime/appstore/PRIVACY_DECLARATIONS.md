# Privacy Declarations — App Store & Play Store

What to enter in **App Store Connect → App Privacy** and **Play Console → Data safety**.

Derived from what the code actually does, not from intent. Both stores reject listings whose declarations contradict the app's behavior, and a declaration that contradicts `legal/PRIVACY_POLICY.md` is worse than either alone. If you change what the app collects, change this file and the policy in the same commit.

**Verified against the app on 8 Oct 2026** (previously 15 Sep 2026). Re-check before each submission.

Changed in the October check: reports and blocks added under User Content, the photo row and permission string widened to cover club admins, crash data made conditional on Sentry being switched on, and a note on the push token.

---

## What the app does *not* collect

Worth stating plainly, because every one of these is a question the forms ask:

| Not collected | Evidence |
|---|---|
| Location | No `expo-location`, no geolocation call anywhere. Facility addresses are club data, not the member's location. |
| Contacts | No `expo-contacts`. |
| Advertising / tracking identifiers | No ad SDK, no analytics SDK, no attribution SDK. |
| Card numbers | Payment happens in **Stripe-hosted checkout opened in the browser**. Card details never pass through the app or our servers. |
| Device identifiers | `expo-device` is used only for `Device.isDevice`, to detect a simulator. |
| Browsing history, search history, audio, biometrics | No such feature exists. |

**Tracking: No.** The app does not track users across apps or websites owned by other companies, so **App Tracking Transparency is not required** and "Used for Tracking" is No for every data type below.

---

## App Store Connect — App Privacy

For each type: collected, **linked to the user's identity**, **not** used for tracking, purpose **App Functionality** unless noted.

### Contact Info
| Data | Linked | Purpose | Why the app has it |
|---|---|---|---|
| Name | Yes | App Functionality | Shown to facility staff and other members on reservations and messages |
| Email Address | Yes | App Functionality | Account identity, sign-in, password reset, booking confirmations |
| Phone Number | Yes | App Functionality | Optional profile field; facilities contact members about reservations |
| Physical Address | Yes | App Functionality | Optional; some facilities verify residency (HOA address rules) |

### User Content
| Data | Linked | Purpose | Why the app has it |
|---|---|---|---|
| Photos or Videos | Yes | App Functionality | A profile picture chosen by the member from their library. Club admins can also choose a club logo and pro-shop product photos. |
| Customer Support | Yes | App Functionality | Support correspondence |
| Other User Content | Yes | App Functionality | Messages between members, bulletin board posts, hitting-partner posts, booking notes, profile bio. Also reports a member files about a message, post or member (the reason, their note, and a copy of the reported text) and the list of members they have blocked. |

### Identifiers
| Data | Linked | Purpose | Why the app has it |
|---|---|---|---|
| User ID | Yes | App Functionality | Account identifier |
| Device ID | Yes | App Functionality | The push-notification token, stored against the account so notifications reach the member's phone |

> **Device ID is a judgment call.** Apple's form describes Device ID as a device-level identifier, and a push token fits that description, so it is declared here. Some apps list the push token under User ID only. Declaring both is the cautious answer and matches the privacy policy, which calls the token "a device-specific identifier".

### Purchases
| Data | Linked | Purpose | Why the app has it |
|---|---|---|---|
| Purchase History | Yes | App Functionality | Paid court reservations, guest fees, ball-machine rentals, pro-shop orders |

> Declare **Purchases**, not **Financial Info** — the app records *that* a purchase happened and its amount. The payment instrument is handled entirely by Stripe's hosted checkout.

### Diagnostics

> **Only declare this section if Sentry is switched on in the build you submit.** As of 8 Oct 2026 it is not: no Sentry DSN is configured, so `mobile/src/utils/sentry.ts` never starts Sentry and the app sends no crash or performance data. If you submit in that state, leave Diagnostics undeclared. If you connect Sentry first, declare the two rows below.

| Data | Linked | Purpose | Why the app has it |
|---|---|---|---|
| Crash Data | **No** | App Functionality | Sentry crash reports |
| Performance Data | **No** | App Functionality | Sentry performance traces |

> **Not linked** is correct only because `sendDefaultPii` is **off** in `mobile/src/utils/sentry.ts`. With it on, Sentry attaches IP address and request context and these become *linked* — and the privacy policy's claim of an "anonymized user identifier" becomes false. If anyone turns that flag back on, this section and the policy both have to change.

### Other Data
| Data | Linked | Purpose | Why the app has it |
|---|---|---|---|
| Other Data | Yes | App Functionality | Gender (optional profile field), skill level and USTA/NTRP rating, used for hitting-partner matching and skill groups |

> Skill and NTRP ratings are sporting ability, not health data — do **not** declare Health & Fitness.

---

## Play Console — Data safety

Google asks two extra questions per type; the answers are the same throughout:

- **Is this data collected, shared, or both?** Collected. **Not shared**, with one exception noted below.
- **Is collection optional?** Required for account data; optional for profile photo, phone, address, gender, skill level.

Global answers:

| Question | Answer |
|---|---|
| Is all data encrypted in transit? | **Yes** — HTTPS throughout |
| Can users request data deletion? | **Yes** — in-app, Profile → Delete Account, and at courttimeapp.com/delete-account |
| Do you have a data deletion URL? | `https://courttimeapp.com/delete-account` |
| Does the app contain ads? | No |
| Is data shared with third parties? | Only processors: Stripe (payments), Resend (transactional email), Sentry (crash reports). Under Play's definition, transfers to service providers processing on your behalf are **not** "sharing". |

| Play category | Data types | Purpose |
|---|---|---|
| Personal info | Name, Email address, Phone number, Address, User IDs, Other info (gender, skill level) | App functionality, Account management |
| Photos and videos | Photos | App functionality (profile picture) |
| Messages | Other in-app messages | App functionality |
| Financial info | Purchase history | App functionality |
| App activity | Other actions (reservations, sign-ups) | App functionality |
| App info and performance | Crash logs, Diagnostics | App functionality |

---

## Permission prompts

Every runtime permission, the string the member sees, and when it appears. Apple rejects vague purpose strings.

| Permission | String | Shown when |
|---|---|---|
| Photo library | "CourtTime needs access to your photos so you can choose a profile picture, or a club logo or product photo if you manage a club." | Member taps to change their profile picture; a club admin taps to choose a club logo or product photo |
| Calendar | "CourtTime can add your confirmed bookings to your calendar when you choose Add to Calendar." | Member taps **Add to Calendar** after booking |
| Reminders | "CourtTime can add booking reminders to your calendar when you choose Add to Calendar." | Same action |
| Notifications | System default | After sign-in, to enable booking reminders and club announcements |

All four are specific about what is accessed and why. Photos, calendar and reminders each follow a member action that explains them; the notification prompt appears after sign-in. The build requests nothing else: the camera, microphone and Face ID strings that the image-picker and secure-store plugins add by default are switched off in `mobile/app.json`, because the app uses none of them.

---

## Before you submit

- [ ] Decide whether Sentry is on in this build, and declare Diagnostics only if it is
- [ ] Confirm `sendDefaultPii` is still `false` in `mobile/src/utils/sentry.ts`
- [ ] Confirm the four legal pages load: `/privacy`, `/terms`, `/support`, `/delete-account`
- [ ] Enter the privacy policy URL in both consoles: `https://courttimeapp.com/privacy`
- [ ] Enter the deletion URL in Play Console: `https://courttimeapp.com/delete-account`
- [ ] Answer **No** to App Tracking Transparency / "Used for Tracking" everywhere
- [ ] Re-read this file against the code if any dependency was added since the date above
