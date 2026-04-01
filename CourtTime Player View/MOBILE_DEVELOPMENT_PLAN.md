# CourtTime Mobile App — Development Plan

**Created:** April 1, 2026
**Target:** iOS App Store + Google Play Store
**Stack:** React Native (Expo SDK 54), TypeScript, Expo Router

---

## Current State

The mobile app scaffold exists with ~82% of core features implemented. Here is what's done and what's missing:

### Already Built
- Login and registration (email/password)
- JWT auth with secure token storage and offline session caching
- Home screen with upcoming bookings, quick actions, and bulletin board preview
- Court booking flow (calendar date picker, court selector, time slot grid, booking confirmation)
- Booking cancellation with confirmation dialog
- Community tab with hitting partner posts (create, view, delete) and notifications list
- Messages tab with conversation list, threaded messages, new conversation composer, member search
- Profile tab (view-only: avatar, name, email, skill level, stats, bio)
- Bottom tab navigation (Home, Book, Community, Messages, Profile)
- Pull-to-refresh on most screens
- Expo config with bundle IDs (`com.courttime.player`)

### Not Yet Built (Gaps vs. Web App)
- ~~Password reset (forgot password / reset flow)~~ **DONE** (2026-04-01)
- ~~Profile editing (name, phone, address, skill level, USTA rating, bio)~~ **DONE** (2026-04-01)
- ~~Profile picture upload~~ **DONE** (2026-04-01)
- ~~Facility membership management (request to join, leave facility)~~ **DONE** (2026-04-01)
- ~~Facility selector (switching between multiple facilities)~~ **DONE** (2026-04-01)
- ~~Club/facility info screen~~ **DONE** (2026-04-01)
- Booking editing (change date/time/court on existing booking)
- ~~Booking type selection and notes~~ **DONE** (2026-04-01)
- ~~Rule violation display when booking fails~~ **DONE** (2026-04-01)
- Recurring booking support
- Quick reserve popup alternative
- ~~Bulletin board post creation (for admins logged in on mobile)~~ **DONE** (2026-04-01)
- ~~Bulletin board post deletion~~ **DONE** (2026-04-01)
- ~~Hitting partner post editing~~ **DONE** (2026-04-01)
- ~~Hitting partner filtering (skill level, play style, search)~~ **DONE** (2026-04-01)
- ~~Hitting partner "Message this player" action~~ **DONE** (2026-04-01)
- ~~Notification type icons and priority styling~~ **DONE** (2026-04-01)
- Notification settings/preferences
- ~~Strike/lockout status display~~ **DONE** (2026-04-01)
- ~~Admin privilege passthrough (admin can book outside rules)~~ **DONE** (2026-04-01) — bulletin posts TBD in 1.9
- ~~Push notifications (currently polling only)~~ **DONE** (2026-04-01)
- ~~Offline support (cached data, queue actions for when back online)~~ **DONE** (2026-04-01)
- Deep linking (open specific booking/message from notification)
- App Store assets (screenshots, description, privacy policy)
- App icon and splash screen finalization

---

## Development Phases

### Phase 1 — Complete Core Player Features (Days 1-5)

These are the missing features that directly block a usable player experience. Every player needs these.

#### 1.1 Profile Editing (Day 1)
- Add edit mode to Profile tab
- Editable fields: first name, last name, phone, street address, city, state, zip, skill level, USTA rating, bio
- Profile picture upload using `expo-image-picker`
- Save via `PATCH /api/player-profile/{userId}` and `PATCH /api/users/{id}`
- Update cached user data in AuthContext after save
- **Dependency:** Install `expo-image-picker`

#### 1.2 Password Reset Flow (Day 1)
- "Forgot Password?" link on login screen
- Forgot password screen: email input, calls `POST /api/auth/forgot-password`
- Success message telling user to check email
- Reset password screen (opened via deep link `courttime://reset-password?token=...`): new password + confirm, calls `POST /api/auth/reset-password`
- **Dependency:** Deep linking setup (already have `scheme: "courttime"` in app.json)

#### 1.3 Facility Selector (Day 2)
- If user is member of 2+ facilities, show facility selector on Home, Book, Community, and Messages screens
- Store selected facility ID in context (new AppContext or extend AuthContext)
- All data fetches use selected facility ID
- Persist last selected facility in secure storage
- **Dependency:** None (API already supports facility filtering)

#### 1.4 Facility Membership Management (Day 2)
- "Find Facilities" button on Profile tab
- Search facilities by name/location via `GET /api/facilities?search=...`
- "Request to Join" button per facility
- "Leave Facility" button on current memberships
- Show membership status (active, pending, suspended) per facility
- **Dependency:** None

#### 1.5 Booking Enhancements (Day 3)
- Booking type selector (practice, match, lesson, league, etc.) in booking flow
- Notes/special requests text field
- Rule violation display: when `POST /api/bookings` returns violations, show a modal listing each violation with rule name, message, and severity
- Edit existing booking: change date, time, duration, or court via `ReservationManagementModal` equivalent
- Admin override: if logged-in user is admin of the facility, skip rule violation blocking (backend already handles this — just don't block the submit on the client)
- **Dependency:** Need booking type constants (already in `src/constants/bookingTypes.ts` on web — copy to mobile)

#### 1.6 Club Info Screen (Day 3)
- New screen accessible from Home or Profile
- Shows facility details: name, type, address, phone, email, website, operating hours, description
- Court listing with type, surface, indoor/outdoor, lights, status
- Member count
- **Dependency:** None (uses existing `GET /api/facilities/{id}` and `GET /api/facilities/{id}/courts`)

#### 1.7 Strike/Lockout Display (Day 4)
- Show lockout status on Profile tab per facility
- If player has active strikes, show warning banner on Home and Book screens
- Check via `GET /api/strikes/check/{userId}?facilityId={facilityId}`
- Show strike history list with reason, date, expiration
- **Dependency:** None

#### 1.8 Hitting Partner Improvements (Day 4)
- Filter by skill level, play style, search query
- Edit own posts
- "Message this player" button that opens Messages tab with that player pre-selected as recipient
- **Dependency:** None

#### 1.9 Bulletin Board Improvements (Day 5)
- Full bulletin board screen (not just preview on Home)
- Filter by post type (event, clinic, tournament, social, announcement)
- Admin users can create and delete posts from mobile
- Pinned posts appear at top
- Event date/time, location, max participants display
- **Dependency:** None

#### 1.10 Notification Improvements (Day 5)
- Type-specific icons (booking confirmed, cancelled, reminder, court change, payment, announcement, weather)
- Priority-based styling (high/medium/low)
- Related booking details shown inline
- Tap notification to navigate to relevant screen (booking details, messages, etc.)
- **Dependency:** Deep linking between screens

---

### Phase 2 — Polish & Platform Features (Days 6-8)

#### 2.1 Push Notifications (Day 6)
- Install and configure `expo-notifications`
- Register device push token on login, send to backend
- Backend changes: store push tokens per user, send push via Expo Push API when creating notifications
- New backend endpoint: `POST /api/notifications/register-device`
- Handle notification received while app is open (in-app banner)
- Handle notification tap when app is backgrounded (navigate to relevant screen)
- Badge count on app icon
- **Dependency:** New backend endpoint + Expo Push API integration

#### 2.2 Offline Support (Day 7)
- Cache recent bookings, messages, and profile data locally
- Show cached data when network unavailable with "offline" indicator
- Queue booking creation/cancellation for when network returns
- Retry failed API calls with exponential backoff
- **Dependency:** Install `@react-native-async-storage/async-storage` or use `expo-sqlite` for structured cache

#### 2.3 Deep Linking (Day 7)
- Handle `courttime://booking/{bookingId}` — open booking details
- Handle `courttime://messages/{conversationId}` — open conversation
- Handle `courttime://reset-password?token=...` — open reset form
- Handle `courttime://facility/{facilityId}` — open club info
- Register URL scheme handling in Expo Router
- **Dependency:** Phase 1.2 (password reset deep link)

#### 2.4 UI Polish (Day 8)
- Loading skeletons on all screens (replace bare spinners)
- Error boundary screens with retry buttons
- Empty state illustrations (no bookings, no messages, etc.)
- Haptic feedback on booking confirmation and important actions
- Smooth transitions between screens
- Keyboard avoidance on all forms
- Accessibility labels on all interactive elements
- Dark mode support (match system setting)
- **Dependency:** Install `expo-haptics`

#### 2.5 Performance Optimization (Day 8)
- Lazy load heavy screens (Messages, Booking)
- Image caching for profile pictures and facility logos
- Reduce unnecessary re-renders with `React.memo` and `useMemo`
- Measure and optimize startup time
- FlatList optimization for long lists (messages, notifications)
- **Dependency:** None

---

### Phase 3 — Testing & Quality Assurance (Days 9-13)

This phase compresses the least. You need human hands on real devices to find real bugs.

#### 3.1 Device Testing (Days 9-10)
- Test on physical iPhone (current and previous generation)
- Test on physical Android device (mid-range and high-end)
- Test on iPad/tablet (layout should still work in portrait)
- Test on different screen sizes (SE, standard, Pro Max)
- Test with slow/unreliable network (airplane mode toggle)
- Test with no network (offline mode)
- Test timezone handling (Eastern, Central, Pacific)

#### 3.2 User Flow Testing (Days 10-11)
- Complete registration → facility join → first booking → cancellation flow
- Password reset full flow (request → email → reset → login)
- Multi-facility user switching between facilities
- Message a hitting partner → conversation created → reply received
- Admin logs in → books outside rules → creates bulletin post
- User with strikes → sees lockout banner → can't book at locked facility
- Push notification received → tap → navigates to correct screen
- Offline → make booking → go online → booking synced

#### 3.3 Edge Case Testing (Day 12)
- Token expiration while using app (should redirect to login)
- Concurrent booking conflict (two users book same slot)
- Very long text in messages, bios, bulletin posts
- Rapid button taps (double-submit prevention)
- App backgrounded during booking flow → resumed
- Network timeout during payment/booking
- User removed from facility while browsing that facility

#### 3.4 Bug Fixing (Days 12-13)
- Fix all issues found during testing
- Re-test fixed issues
- Performance profiling and optimization pass

---

### Phase 4 — App Store Preparation (Days 14-16)

#### 4.1 App Store Assets (Day 14)
- App icon (1024x1024 for iOS, adaptive icon for Android)
- Splash screen finalization
- Screenshot set for iPhone 6.7" (required), 6.5", 5.5"
- Screenshot set for iPad 12.9" (if supporting tablet)
- Screenshot set for Android phone
- Short description (80 chars)
- Full description (4000 chars)
- Keywords for App Store search optimization
- Category: Sports
- Feature graphic for Google Play (1024x500)

#### 4.2 Legal & Policy Documents (Day 14)
- Privacy Policy (required by both stores) — what data is collected, how it's used, third-party services (Stripe, Resend)
- Terms of Service
- EULA (End User License Agreement) — Apple requires this
- Data deletion process documentation (required by both stores — users must be able to request account deletion)
- Host privacy policy and ToS on a public URL (e.g., courttimeapp.com/privacy)

#### 4.3 Apple Developer Account Setup (Day 15)
- Enroll in Apple Developer Program ($99/year) if not already
- Create App ID in App Store Connect
- Create provisioning profiles
- Configure app signing (EAS Build handles most of this)

#### 4.4 Google Play Console Setup (Day 15)
- Enroll in Google Play Developer Program ($25 one-time) if not already
- Create app listing in Google Play Console
- Set up app signing (upload key)
- Complete Data Safety section (required — declares what data your app collects)

#### 4.5 EAS Build Configuration (Day 15)
- Install and configure `eas-cli`
- Create `eas.json` with build profiles (development, preview, production)
- Configure code signing for iOS (certificates + provisioning)
- Configure code signing for Android (keystore)
- Test production build locally
- Run `eas build --platform all` for production builds

#### 4.6 API Environment (Day 16)
- Ensure production API URL is set in mobile `.env` / app config
- Verify all API endpoints work with production database
- Test JWT auth against production server
- Verify push notification delivery in production

#### 4.7 App Store Submission (Day 16)
- **iOS:** Upload build via EAS Submit or Transporter → submit for App Review
  - Apple review typically takes 24-48 hours
  - Common rejection reasons: crashes, broken links, missing privacy policy, incomplete functionality
  - Be prepared for 1-2 rounds of review feedback
- **Android:** Upload AAB via EAS Submit or Play Console → submit for review
  - Google review typically takes a few hours to 3 days
  - Requires complete Data Safety form
  - Start with "Internal testing" track, then promote to "Production"

---

### Phase 5 — Post-Launch (Ongoing)

#### 5.1 Monitoring (Day 17+)
- Monitor crash reports (Expo Updates or Sentry integration)
- Monitor API error rates for mobile-specific endpoints
- Watch App Store reviews for user-reported issues
- Monitor push notification delivery rates

#### 5.2 Over-the-Air Updates
- Configure `expo-updates` for OTA JavaScript updates
- Minor bug fixes can be pushed without new App Store review
- Native dependency changes still require new build + review

#### 5.3 Feature Iteration
- Recurring bookings (weekly/biweekly repeat)
- Booking reminders (push notification 1 hour before)
- Quick rebook (rebook same court/time next week)
- Court favorites (pin preferred courts)
- Availability alerts (notify when preferred slot opens up)
- Social features (friend list, activity feed)
- In-app rating prompts (after 5+ bookings)

---

## Timeline Summary

> **Note:** This timeline assumes Claude Code is writing the code. Code generation and implementation are fast — the bottleneck shifts to testing on physical devices and waiting for App Store review.

| Phase | Duration | What Gets Done |
|-------|----------|---------------|
| Phase 1 — Core Features | Days 1-5 | Profile editing, password reset, facility selector, membership management, booking enhancements, club info, strikes, hitting partner/bulletin improvements, notification improvements |
| Phase 2 — Polish & Platform | Days 6-8 | Push notifications, offline support, deep linking, UI polish, performance optimization |
| Phase 3 — Testing & QA | Days 9-13 | Device testing, user flow testing, edge cases, bug fixing. This phase compresses the least — real devices and real user flows require human hands. |
| Phase 4 — App Store Prep | Days 14-16 | Assets, legal docs, developer accounts, EAS builds, submission |
| Phase 5 — Post-Launch | Ongoing | Monitoring, OTA updates, feature iteration |

**Total time to App Store submission: ~16 working days (~3 weeks)**
**Total time to App Store availability: ~3.5 weeks** (accounting for Apple/Google review, possible 1 round of feedback)

---

## Key Decisions & Notes

1. **Player-only app, admin privileges honored.** The app has no admin management screens (no facility management, member management, court management, billing). But when an admin user logs in, the backend already recognizes their admin role — they can book outside rules, create bulletin posts, delete any post, etc. The mobile app just needs to not block these actions on the client side.

2. **No payment/billing in mobile.** Facility registration and subscription management remain web-only. Players don't pay — facilities do.

3. **Expo Managed Workflow.** Using EAS Build for production builds. No need to eject. This keeps the build process simple and handles code signing.

4. **Push notifications require backend work.** This is the only feature that needs new backend endpoints (device token registration + Expo Push API calls when creating notifications). Everything else uses existing API endpoints.

5. **Start testing on physical devices early.** Don't wait until Phase 3 to first run on a real phone. Build preview APK/IPA during Phase 1 and test each feature as it's built.

6. **App Store review can be unpredictable.** Budget a few extra days. Apple in particular may reject for UI/UX reasons, missing features in the description, or privacy policy issues. The first submission often takes longer.

7. **Claude Code compresses coding, not testing.** Phases 1 and 2 are primarily code generation — Claude Code handles these fast. Phase 3 requires you physically using the app on real phones to find bugs. Phase 4 has human wait times (account approvals, store review). Plan accordingly.
