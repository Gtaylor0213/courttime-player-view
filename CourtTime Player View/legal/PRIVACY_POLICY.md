# CourtTime Privacy Policy

**Effective date:** [EFFECTIVE DATE]
**Last updated:** [EFFECTIVE DATE]

> ⚠️ **DRAFT — Requires legal review before publication.**

This Privacy Policy describes how [ENTITY NAME] ("**CourtTime**," "**we**," "**us**") collects, uses, and shares information when you use the CourtTime mobile app and website at courttimeapp.com (together, the "**Service**").

By using the Service you agree to the collection and use of information in accordance with this Policy.

---

## 1. Information We Collect

### Information you provide

- **Account information** — email, password (stored as a salted hash, never in plaintext), full name, phone number, mailing address, and gender (optional, used only for facility events with gender-restricted eligibility such as drills).
- **Player profile information** — skill level, USTA / NTRP rating, short bio, profile photo (if you upload one).
- **Booking information** — courts you reserve, dates and times, booking type, optional notes.
- **Messages** — the text content of messages you send to other facility members through the in-app messaging feature.
- **Bulletin board content** — posts, sign-ups for drills or events, and waitlist entries.
- **Membership requests** — facilities you request to join and your membership status with each.
- **Terms acceptance records** — when you accept facility-specific Terms & Conditions, we record the version you accepted, the timestamp, and your IP address.

### Information collected automatically

- **Device & app information** — device model, operating system version, app version, language, time zone.
- **Push notification token** — a device-specific identifier issued by Apple Push Notification Service or Firebase Cloud Messaging via Expo so we can deliver push notifications you have opted into.
- **Usage and log data** — IP address, request timestamps, error reports, and high-level interaction logs needed to operate and debug the Service.
- **Notification interaction** — which notifications you read or tap.

### Information from facilities you join

When you become a member of a facility on CourtTime, the facility administrator may add notes, strikes, or membership-status changes to your record at that facility.

### What we do **not** collect

- We do not collect precise location (GPS).
- We do not use third-party advertising trackers.
- We do not sell personal information to data brokers.

---

## 2. How We Use Information

We use the information described above to:

- Create and authenticate your account and keep your session secure.
- Provide core CourtTime features: booking courts, viewing reservations, messaging members, signing up for drills and events.
- Send transactional emails and push notifications (booking confirmations, reminders, strike alerts, facility announcements, weather warnings) — subject to your notification preferences.
- Enforce facility booking rules, strike policies, and account lockouts.
- Detect, investigate, and prevent fraud, abuse, and security incidents.
- Comply with legal obligations.
- Communicate with you about service updates, policy changes, and support requests.

We use **legitimate interest** and **performance of a contract** as our legal bases under GDPR for most of these uses, and **consent** for push notifications and optional profile data (such as gender).

---

## 3. How We Share Information

### With other facility members

To make CourtTime work as a community, certain profile information is visible to other active members of the same facility:

- Your name, profile photo, skill level, and USTA rating.
- Drill / event sign-ups (visible per the facility admin's settings on each post).
- Your messages, only to the recipient of each conversation.

We do not display your email address, phone number, or mailing address to other members.

### With service providers

We share information with third parties that help us operate the Service. These providers are bound to use information only to provide their services to us:

| Provider | Purpose | Data shared |
|---|---|---|
| **Supabase** (PostgreSQL hosting) | Primary database storage | All account, booking, message, and profile data |
| **Render** | Application hosting | Same data plus server logs |
| **Resend** | Transactional email delivery | Recipient email, message subject and body |
| **Stripe** | Payment processing for facility subscriptions only | Facility billing details (players are not charged via the app) |
| **Expo Push Service / Apple APNs / Google FCM** | Push notification delivery | Push token, notification title and body |
| **Sentry** | Error monitoring | Error reports, app version, device info, anonymized user identifier |

### With facility administrators

Administrators of a facility you belong to can view your profile, booking history at that facility, strike record at that facility, and issue strikes or modify your membership status at that facility. They cannot see your activity at other facilities.

### For legal reasons

We may disclose information if required by law, court order, or valid legal process, or to protect the rights, property, or safety of CourtTime, our users, or the public.

### Business transfers

If CourtTime is involved in a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction. You will be notified before your information becomes subject to a different privacy policy.

---

## 4. Your Choices and Rights

### Edit your profile

You can edit your name, contact details, gender, skill level, USTA rating, bio, and profile photo at any time from the Profile screen in the app or web.

### Notification preferences

You can turn off push notifications globally or per category (booking updates, reminders, strikes, announcements, weather) from **Profile → Notifications** in the mobile app. You can unsubscribe from non-essential email at any time from any email we send.

### Access and portability

You can request a copy of your personal data by emailing **reidbissell@courttimeapp.com**. We will respond within 30 days.

### Correction

You can correct most data yourself in the app. For data you cannot edit (such as historical booking records), email **reidbissell@courttimeapp.com**.

### Deletion

You can delete your account and associated personal data at any time. See our [Account Deletion](./ACCOUNT_DELETION.md) document for instructions and what gets deleted.

### Rights under GDPR (European users)

If you are in the European Economic Area, the United Kingdom, or Switzerland, you have additional rights including the right to object to processing, restrict processing, and lodge a complaint with your local data protection authority.

### Rights under CCPA (California users)

California residents have the right to know what personal information we collect, request deletion, and opt out of the "sale" or "sharing" of personal information. We do not sell or share personal information for cross-context behavioral advertising.

To exercise any of these rights, email **reidbissell@courttimeapp.com**.

---

## 5. Children's Privacy

CourtTime is not intended for children under 13. We do not knowingly collect personal information from children under 13. If you become aware that a child under 13 has provided us with personal information, please contact us so we can remove it.

If you are between 13 and 18, you should use the Service only with the involvement of a parent or guardian.

---

## 6. Data Retention

- **Active accounts** — we retain your data for as long as your account is active.
- **Deleted accounts** — most personal data is deleted within 30 days of your account deletion request. See the [Account Deletion](./ACCOUNT_DELETION.md) document for details on what is retained and why.
- **Server logs** — request and error logs are retained for up to 90 days.
- **Backups** — encrypted database backups are retained for up to 30 days; deleted data is purged from backups on the next backup rotation.
- **Legal & tax records** — financial records (Stripe transactions tied to facilities) are retained for as long as required by tax law (typically 7 years in the U.S.).

---

## 7. Security

We use reasonable administrative, technical, and physical safeguards to protect your information, including:

- Passwords stored as bcrypt hashes (never plaintext).
- Encryption in transit (HTTPS / TLS) for all client–server traffic.
- Encryption at rest for the production database (Supabase).
- JWT-based authentication tokens with limited lifetimes.
- Access to production data limited to a small number of authorized personnel.

No system is 100% secure. If we discover a security breach affecting your personal data, we will notify you and applicable regulators as required by law.

---

## 8. International Data Transfers

CourtTime operates in the United States and our service providers (Supabase, Render, Stripe, Resend) primarily store data in the United States. If you access the Service from outside the United States, you understand that your information will be transferred to and processed in the U.S., where data protection laws may differ from those in your country.

---

## 9. Changes to This Policy

We may update this Privacy Policy from time to time. When we make material changes, we will notify you by email or in-app notice and update the "Last updated" date at the top of this page. Continued use of the Service after the changes take effect constitutes acceptance of the revised Policy.

---

## 10. Contact Us

For privacy questions, requests, or complaints:

**Email:** reidbissell@courttimeapp.com
**Mail:** [ENTITY NAME], [BUSINESS ADDRESS]

If you are an EU/UK resident and unsatisfied with our response, you have the right to lodge a complaint with your local data protection authority.
