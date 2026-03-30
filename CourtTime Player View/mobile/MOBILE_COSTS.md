# CourtTime Mobile App — Development Costs

## App Store Fees (Required)

| Item | Cost | Frequency |
|------|------|-----------|
| Google Play Developer Account | $25 | One-time |
| Apple Developer Program | $99 | Per year |

**Total to launch on both stores: $124 first year, $99/year ongoing**

## Hosting & Infrastructure (No additional cost)

- The mobile app shares the **same backend and database** already running on Render — no extra servers, databases, or hosting costs needed.
- Supabase (PostgreSQL) usage stays the same — mobile users hit the same API endpoints as web users.

## Build & Distribution — Expo EAS (Optional)

Expo Application Services (EAS) handles building and submitting your app to the stores without needing a Mac or local Android SDK.

| Plan | Cost | What you get |
|------|------|-------------|
| Free tier | $0 | 30 builds/month, standard queue (5-15 min wait) |
| Production plan | $99/month | Unlimited builds, priority queue, more OTA updates |

**The free tier is sufficient to start.** You only need the paid plan if you're pushing frequent updates or need faster build times.

## Push Notifications (Optional)

| Service | Cost |
|---------|------|
| Expo Push Notifications | Free (included with Expo) |

No additional cost — Expo provides push notification infrastructure at no charge.

## Summary

| Category | Cost |
|----------|------|
| Google Play (one-time) | $25 |
| Apple Developer (annual) | $99/year |
| Backend / hosting changes | $0 |
| EAS builds (free tier) | $0 |
| Push notifications | $0 |
| **Total to launch** | **$124** |
| **Annual recurring** | **$99/year** (Apple only) |
