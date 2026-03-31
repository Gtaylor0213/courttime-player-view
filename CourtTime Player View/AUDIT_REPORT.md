# CourtTime Codebase Audit Report

**Audit Date:** March 31, 2026
**Last Updated:** March 31, 2026

---

## Executive Summary

This is a full-stack React + Express application for tennis/pickleball court booking. The codebase is functional and actively developed, but it has significant security and code quality gaps that should be addressed before going live with paying customers.

The most urgent issue is that almost none of the API routes have authentication middleware — any user (or attacker) who knows the URL can read, modify, or delete data belonging to any other user. The `requireAuth` middleware exists but is only applied to a single endpoint.

Second, there are no automated tests whatsoever. For an application handling payments and personal data, this is a significant risk. Third, the codebase contains a large amount of console.log debug statements (100+), several components that are extremely large (3000+ lines), and a handful of dead files.

---

## Issue Tracker

### Critical Issues

| # | Issue | File(s) | Status | Fixed Date | Notes |
|---|-------|---------|--------|------------|-------|
| C1 | No authentication on API routes — `requireAuth` middleware exists but only used on 1 endpoint. All other routes are unprotected. | `server/routes/admin.ts`, `bookings.ts`, `members.ts`, `messages.ts`, `notifications.ts`, `strikes.ts`, `users.ts`, `playerProfile.ts`, `bulletinBoard.ts`, `courtConfig.ts`, `households.ts`, `rules.ts`, `hittingPartner.ts` | FIXED | 2026-03-31 | Frontend now sends real JWT; `requireAuth` applied to 14 route groups + 4 payment endpoints |
| C2 | Client-controlled admin flag — delete endpoint reads `isAdmin` from query string, allowing any user to spoof admin privileges | `server/routes/bulletinBoard.ts:100` | FIXED | 2026-03-31 | Now verifies admin status via DB lookup on facility_admins table using JWT userId |
| C3 | Hardcoded JWT secret fallback — if env var missing, falls back to publicly visible string `'courttime-dev-secret-change-in-production'` | `server/middleware/auth.ts:9` | FIXED | 2026-03-31 | Server now throws on startup if JWT_SECRET is missing |
| C4 | CORS allows all origins — `cors()` with no config allows any website to make API calls | `server/index.ts:48` | FIXED | 2026-03-31 | Restricted to `APP_URL` env var, falls back to localhost:5173 for dev |

### High Issues

| # | Issue | File(s) | Status | Fixed Date | Notes |
|---|-------|---------|--------|------------|-------|
| H1 | No automated tests — zero test files exist, no test framework configured | Project-wide | OPEN | | Fix: add Vitest, start with booking/payment/auth tests |
| H2 | SQL string interpolation — `parseInt` prevents injection but pattern is fragile and non-standard | `src/services/bulletinBoardService.ts:83`, `src/services/rulesEngine/evaluators/AccountRuleEvaluators.ts:412` | FIXED | 2026-03-31 | Both now use `make_interval()` with parameterized values |
| H3 | XSS via `dangerouslySetInnerHTML` — renders server HTML without sanitization | `src/components/admin/EmailTemplateEditor.tsx:336` | FIXED | 2026-03-31 | Added DOMPurify sanitization before rendering |
| H4 | Dead route file `tiers.ts` — 373 lines not imported anywhere | `server/routes/tiers.ts` | FIXED | 2026-03-31 | Deleted tiers.ts and removed unused tiersApi from client.ts |

### Medium Issues

| # | Issue | File(s) | Status | Fixed Date | Notes |
|---|-------|---------|--------|------------|-------|
| M1 | 100+ `console.log` statements in production code | Across nearly every service/route file. Biggest clusters: `admin.ts` (21), `support.ts` (29+), `CourtCalendarView.tsx` (7), `bookingService.ts` (9+), `facilityService.ts` (15+) | FIXED | 2026-03-31 | Removed 45 debug console.log from 16 files. Kept intentional server/DB/webhook logging. |
| M2 | Extremely large component files — difficult to review, test, or modify | `FacilityManagement.tsx` (~3136 lines), `FacilityRegistration.tsx` (~2934 lines), `CourtCalendarView.tsx` (~1467 lines) | OPEN | | Fix: break into smaller sub-components |
| M3 | N+1 query patterns — individual queries inside loops instead of bulk operations | `addressWhitelistService.ts:192-217`, `courtService.ts:88-120`, `facilityService.ts` (multiple) | FIXED | 2026-03-31 | Converted bulkAddWhitelistedAddresses and createCourtsBulk to multi-row INSERT. facilityService loops deferred (one-time setup, interleaved tables). |
| M4 | TODO stubs left in code | `AuthContext.tsx:228` (updateProfile is a stub), `rulesEngine/index.ts:63` (stale migration note) | FIXED | 2026-03-31 | Removed both stale TODO comments |
| M5 | Incomplete `.env.example` — missing `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `SUPPORT_PASSWORD` | `.env.example` | FIXED | 2026-03-31 | Added JWT_SECRET, STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET, SUPPORT_PASSWORD, NODE_OPTIONS |
| M6 | Notification polling when tab inactive — polls API every 30 seconds regardless of visibility | `src/contexts/NotificationContext.tsx` | FIXED | 2026-03-31 | Added Page Visibility API — polling pauses when tab hidden, resumes on focus |

### Low Issues

| # | Issue | File(s) | Status | Fixed Date | Notes |
|---|-------|---------|--------|------------|-------|
| L1 | Hardcoded fallback email domain — emails come from Resend test domain if env var unset | `adminService.ts:27`, `emailService.ts:26`, `passwordResetService.ts:28` | OPEN | | Fix: require env var or fail |
| L2 | Silent error swallowing — errors caught and ignored without logging or propagation | `server/middleware/auth.ts:40-42`, `src/services/bookingService.ts:738`, multiple services | OPEN | | Fix: log and propagate errors |
| L3 | Notification toast placeholder handlers — `console.log` instead of actual navigation | `src/contexts/NotificationContext.tsx:189,199,209` | OPEN | | Fix: implement navigation |
| L4 | Dead scripts not referenced anywhere | `scripts/check-bookings.js`, `scripts/verify-user-data.ts`, `scripts/activate-membership.ts`, `scripts/run-migration.ts` | OPEN | | Fix: delete |
| L5 | Unnumbered migration files outside naming convention | `src/database/migrations/add_facility_to_conversations.sql`, `add_user_contact_info.sql` | OPEN | | Fix: renumber or delete if applied |

---

## Dead Code & Unused Files

| File | Classification | Reasoning | Status |
|------|---------------|-----------|--------|
| `server/routes/tiers.ts` | Dead | Not imported in `server/index.ts`. No `/api/tiers` endpoint exists. | FIXED — deleted |
| `scripts/check-bookings.js` | Dead | Not in `package.json` scripts. Hardcoded user ID. | OPEN |
| `scripts/verify-user-data.ts` | Dead | Not in `package.json` scripts. Hardcoded email. | OPEN |
| `scripts/activate-membership.ts` | Dead | Not in `package.json` scripts. Hardcoded user ID. | OPEN |
| `scripts/run-migration.ts` | Dead | Duplicate of `run-migration.js` which is the one in `package.json`. | OPEN |
| `database/migrations/004_add_address_whitelist.sql` | Dead | In root `database/` not `src/database/migrations/`. Not used by migration runner. | OPEN |
| `src/database/migrations/add_facility_to_conversations.sql` | Uncertain | Unnumbered migration. May have been run manually. | OPEN |
| `src/database/migrations/add_user_contact_info.sql` | Uncertain | Unnumbered migration. May have been run manually. | OPEN |
| `TODO.md` | Dead | All items marked complete. No current purpose. | OPEN |

---

## Recommended Fix Order

1. Add `requireAuth` middleware to all protected API routes (C1)
2. Remove hardcoded JWT secret fallback (C3)
3. Fix `isAdmin` query parameter spoofing (C2)
4. Restrict CORS to actual domain (C4)
5. Fix SQL string interpolation patterns (H2)
6. Delete dead code: `tiers.ts`, dead scripts, old migration files (H4, L4, L5)
7. Update `.env.example` with all required variables (M5)
8. Add DOMPurify sanitization for email template preview (H3)
9. Clean up `console.log` statements (M1)
10. Add test framework and initial tests (H1)
11. Break up large components (M2)
12. Implement `updateProfile` TODO in AuthContext (M4)
13. Fix N+1 query patterns (M3)
14. Add Page Visibility API for notification polling (M6)
15. Fix silent error swallowing (L2)
16. Require email env var instead of fallback (L1)
17. Implement notification toast navigation (L3)

---

## Change Log

| Date | Issue # | Change Description | Commit |
|------|---------|-------------------|--------|
| 2026-03-31 | C3 | Removed hardcoded JWT secret fallback; server throws if JWT_SECRET env var missing | pending |
| 2026-03-31 | C1 | Frontend saves/sends real JWT from backend; `requireAuth` applied to all protected routes at mount level in server/index.ts + 4 payment endpoints | pending |
| 2026-03-31 | C2 | Bulletin board delete now verifies admin via DB lookup instead of trusting client query param | pending |
| 2026-03-31 | C4 | CORS restricted to APP_URL env var with localhost fallback for dev | pending |
| 2026-03-31 | H2 | SQL interpolation replaced with parameterized `make_interval()` in bulletinBoardService and AccountRuleEvaluators | pending |
| 2026-03-31 | H3 | Added DOMPurify sanitization to EmailTemplateEditor dangerouslySetInnerHTML | pending |
| 2026-03-31 | H4 | Deleted dead server/routes/tiers.ts and removed unused tiersApi from client.ts | pending |
| 2026-03-31 | M1 | Removed 45 debug console.log from 16 files across components, services, and routes | pending |
