# CourtTime - Future TODO List

This document tracks features and improvements that need to be completed in future development cycles.

---

## All items complete!

No remaining TODO items. All features have been implemented.

---

## Completed Items

### Server-Side (Pre-existing)
- [x] Create database migration file (007_booking_rules_engine.sql)
- [x] Create rules engine types (src/services/rulesEngine/types.ts)
- [x] Create RuleContext builder for fetching booking context
- [x] Create RulesEngine core class
- [x] Implement Court Rule evaluators (CRT-001 to CRT-012)
- [x] Implement Account Rule evaluators (ACC-001 to ACC-011)
- [x] Implement Household Rule evaluators (HH-001 to HH-003)
- [x] Integrate rules engine into bookingService.ts
- [x] Add new API routes (tiers, strikes, court config, rules, households)
- [x] Make rules engine graceful when tables don't exist (temporary fix)

### Phase 1-2: Court Config & Basic Rules Admin UI
- [x] Discovery + DB migration 007
- [x] Court config panel (operating hours, blackouts, buffer time)
- [x] Basic rule wiring to FacilityManagement

### Phase 3: Account Rules Admin UI
- [x] ACC-001 through ACC-011 admin UI controls in Booking Rules tab
- [x] Tier CRUD (create/edit/delete tiers in FacilityManagement)
- [x] Strike management dialog in MemberManagement (issue/revoke strikes)
- [x] Tier assignment per member in MemberManagement

### Phase 4: Court/Household Rules + Booking Flow
- [x] CRT-003, CRT-010, CRT-011 admin UI controls (Court Scheduling Rules card)
- [x] HH-002, HH-003 admin UI controls (Household Rules card)
- [x] Fix apiRequest to pass through ruleViolations/warnings/isPrimeTime
- [x] Add bookingApi.validate method
- [x] BookingWizard: rule violation display (red errors, amber warnings, prime-time badge)
- [x] QuickReservePopup: rule violation display (red errors, amber warnings, prime-time badge)

### Phase 5: Player Profile Strike History
- [x] Add householdsApi to client.ts (11 methods for Phase 6 prep)
- [x] PlayerProfile: strike history with expandable list
- [x] PlayerProfile: lockout banners (red warning per locked facility)
- [x] PlayerProfile: per-facility summary badges (green/amber/red)
- [x] PlayerProfile: empty state ("No strikes on your account")

### Phase 6: Household Management Admin UI
- [x] Run migration 007 (verified already applied — all 26 rules seeded)
- [x] HouseholdManagement.tsx — full CRUD admin page
- [x] Household list with search, expandable rows showing members
- [x] Auto-Create from HOA addresses button
- [x] Create/Edit/Delete household dialogs
- [x] Add member dialog with facility member search
- [x] Member verification (verify/reject), set primary, remove
- [x] Route, sidebar nav, page mapping, dashboard quick action

### Phase 7: Calendar Prime-Time Visualization
- [x] Fetch court operating configs (prime_time_start/end per court per day)
- [x] isPrimeTimeSlot() helper for 12h→24h time comparison
- [x] Purple tint (bg-purple-50) on empty prime-time calendar slots
- [x] Purple hover (hover:bg-purple-100) for prime-time slots
- [x] Prime-time legend indicator in calendar header

### Phase 8: Rate Limiting + Email Notifications
- [x] Install express-rate-limit, add tiered middleware (global 100/15min, auth 10/15min, sensitive 20/15min)
- [x] Create centralized emailService.ts (sendStrikeIssuedEmail, sendStrikeRevokedEmail, sendLockoutEmail)
- [x] Add strike notification helpers to notificationService.ts (in-app notifications)
- [x] Hook email + in-app notifications into bookingService.ts issueStrike() (auto strikes)
- [x] Hook email + in-app notifications into strikes.ts routes (manual issue + revoke)
- [x] Lockout detection: send lockout email when strike count crosses ACC-009 threshold

### UI/UX Fixes
- [x] Fix notification service priority column error
- [x] Make court calendar header sticky with only calendar scrolling
- [x] Change zoom control to +/- buttons
- [x] Update Quick Reserve button to green with black text

---

## Notes

### Running the Migration

**Option A: Using psql (command line)**
```bash
psql -h your-host -d your-database -U your-user -f src/database/migrations/007_booking_rules_engine.sql
```

**Option B: Using a database GUI**
Copy the contents of `007_booking_rules_engine.sql` and run it in your database tool (pgAdmin, DBeaver, Supabase SQL editor, etc.)

**Option C: Via Render Dashboard**
If deployed on Render, use the database shell in the Render dashboard.

### Rule Codes Reference

**Account Rules (ACC-001 to ACC-011):**
- ACC-001: Max Active Reservations
- ACC-002: Max Reservations Per Week
- ACC-003: Max Hours Per Week
- ACC-004: No Overlapping Reservations
- ACC-005: Advance Booking Window
- ACC-006: Minimum Lead Time
- ACC-007: Cancellation Cooldown
- ACC-008: Late Cancellation Policy
- ACC-009: No-Show Strike System
- ACC-010: Prime-Time Per Week Limit
- ACC-011: Rate Limit Actions

**Court Rules (CRT-001 to CRT-012):**
- CRT-001: Prime-Time Schedule
- CRT-002: Prime-Time Max Duration
- CRT-003: Prime-Time Eligibility
- CRT-004: Court Operating Hours
- CRT-005: Reservation Slot Grid
- CRT-006: Blackout Blocks
- CRT-007: Buffer Time
- CRT-008: Allowed Activities
- CRT-009: Sub-Amenity Inventory
- CRT-010: Court-Specific Weekly Cap
- CRT-011: Court Release Time
- CRT-012: Court Cancellation Deadline

**Household Rules (HH-001 to HH-003):**
- HH-001: Max Members Per Address
- HH-002: Household Max Active Reservations
- HH-003: Household Prime-Time Cap

### Admin UI Rule Coverage

**Rules with full admin UI controls (19):**
ACC-001, ACC-002, ACC-003, ACC-004, ACC-005, ACC-006, ACC-007, ACC-008, ACC-009, ACC-010, ACC-011, CRT-001, CRT-002, CRT-003, CRT-005, CRT-010, CRT-011, HH-002, HH-003

**Rules configured via Court Management panel (3):**
CRT-004 (operating hours), CRT-006 (blackouts), CRT-007 (buffer time)

**Rules evaluated server-side only — no admin config needed (4):**
CRT-008 (allowed activities — niche), CRT-009 (sub-amenity inventory — niche), CRT-012 (cancellation deadline — informational during booking), HH-001 (max members — informational during booking)
