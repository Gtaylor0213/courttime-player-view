# Changes Summary

## Task 1 — Fix Guest Fee Save Bug

### Root Cause
`CourtTime Player View/src/components/admin/CourtManagement.tsx` — `handleSave` blocked saving any court with a guest fee when Stripe Connect was not yet configured (`stripeOnboarded === false`). The original condition was `if ((wantsPayment || hasGuestFee) && stripeOnboarded === false)`, which made it impossible to save a guest fee on any dev/test environment without Stripe wired up.

### Fix
- **`src/components/admin/CourtManagement.tsx`**: Removed `hasGuestFee` from the Stripe gate — only `wantsPayment` (paid court booking) requires Stripe to be configured. Guest fees are saved regardless; a non-blocking `toast.info` informs the admin that Stripe must still be set up before members can actually be charged. Removed all debug `console.log` statements added during investigation.
- **`src/api/client.ts`** (`adminApi.createCourt`): Added missing `guestFeeCents?: number | null` and `guestFeeDollars?: string` to the TypeScript type so new court creation also carries guest fee fields.
- **`src/database/migrations/042_guest_fee.sql`** (pre-existing): Migration was already applied — `guest_fee_cents` column confirmed present in `courts` table.

---

## Task 2 — Payment Lockout

Adds a "payment lockout" flag that an admin can toggle on any member. When locked, the member is blocked from all player-action API endpoints and sees a full-screen lockout wall in the browser.

### Database
- **`src/database/migrations/044_payment_lockout.sql`**: Adds `is_payment_locked BOOLEAN NOT NULL DEFAULT FALSE` and `payment_locked_at TIMESTAMP` to `facility_memberships`. Applied to production DB.

### Backend
- **`src/services/memberService.ts`**:
  - Added `isPaymentLocked` and `paymentLockedAt` to `MemberWithProfile` interface and both `SELECT` queries.
  - Added `isPaymentLocked` to `MemberUpdateData` interface.
  - `updateMemberMembership` now sets `is_payment_locked` and stamps/clears `payment_locked_at` atomically.
- **`server/routes/members.ts`**:
  - Added `isPaymentLocked` to the `PATCH /:facilityId/:userId` valid-fields whitelist.
  - Added `PUT /:facilityId/:userId/payment-lockout` dedicated endpoint.
- **`server/middleware/auth.ts`**: Added `requireNotPaymentLocked` middleware — queries `facility_memberships` for any locked row and returns **HTTP 402** with `{ error: 'payment_locked', lockout: { facilityId, facilityName, lockedAt } }` if found. Admin accounts bypass this check via route ordering.
- **`server/index.ts`**: Admin routes (`/api/admin`, `/api/members`) are mounted first and are **not** subject to lockout. Player-action routes (`/api/bookings`, `/api/bulletin-board`, `/api/hitting-partner`, `/api/messages`, `/api/strikes`, `/api/court-config`, `/api/rules`, `/api/households`) now include `requireNotPaymentLocked` middleware after `requireAuth`.

### Frontend
- **`src/api/client.ts`**:
  - Wrapped `buildApiRequest` output to intercept `error === 'payment_locked'` responses and dispatch a `window.CustomEvent('payment-locked', { detail: lockoutInfo })`. This means any API call anywhere in the app will trigger the lockout screen mid-session.
  - Added `membersApi.setPaymentLockout(facilityId, userId, isPaymentLocked)`.
- **`src/components/PaymentLockoutScreen.tsx`** _(new)_: Full-screen lockout wall shown to locked members. Displays facility name, lock date, and a refresh button.
- **`src/components/ProtectedRoute.tsx`**: Listens for the `payment-locked` event and renders `PaymentLockoutScreen` instead of the app content. Admin users (`userType === 'admin'`) are exempt.
- **`src/components/admin/MemberManagement.tsx`**:
  - Added `isPaymentLocked` and `paymentLockedAt` to the `Member` interface.
  - Added `handleTogglePaymentLockout` handler.
  - Added "Payment Locked" badge in member list and member detail dialog.
  - Added lockout toggle button (Lock/LockOpen icon) in desktop action row, mobile dropdown, and member detail dialog action strip.

### Decision: lockout scope
A user locked at **any** facility is blocked across all player endpoints. Given users typically belong to one facility and the middleware queries all memberships, this is the safest default. An admin who is also locked as a player at another facility is still exempt because admin routes bypass the lockout middleware.

---

## Task 3 — Revenue Tracking

All successful Stripe payments now record in a `facility_revenue_log` table. The admin dashboard reflects real revenue instead of a hardcoded `0`.

### Database
- **`src/database/migrations/045_revenue_log.sql`** _(new)_: Creates `facility_revenue_log` table with columns: `id`, `facility_id`, `amount_cents`, `payment_type` (`COURT_BOOKING | BULLETIN_SIGNUP | PAYMENT_ITEM | GUEST_FEE | PLATFORM_SUBSCRIPTION`), `source_id`, `source_type` (`connect_payment | platform_invoice`), `member_id`, `paid_at`, `created_at`. Indexed on `(facility_id, paid_at DESC)` for fast dashboard queries. Applied to production DB.

### Payment flow wiring
- **`src/services/stripeConnectService.ts`** (`markCheckoutSessionPaid`):
  - Added `club_id` and `amount_cents` to `RETURNING` clause of both UPDATE paths so the payment type can be determined without a second query.
  - After finalizing court booking or signup, inserts a row into `facility_revenue_log` with the correct `payment_type` (`COURT_BOOKING`, `BULLETIN_SIGNUP`, or `PAYMENT_ITEM`). Uses `ON CONFLICT DO NOTHING` and a `.catch()` so a log failure never breaks the payment flow.
- **`server/routes/webhook.ts`** (`handleInvoicePaymentSucceeded`):
  - After recording into `payment_history`, also inserts into `facility_revenue_log` with `payment_type = 'PLATFORM_SUBSCRIPTION'`. Skips `$0` trial invoices. Uses `ON CONFLICT DO NOTHING` and `.catch()` for the same reason.

### API
- **`server/routes/admin.ts`**:
  - `GET /api/admin/dashboard/:facilityId` — replaced hardcoded `revenue: 0` with a live query against `facility_revenue_log` for the current month. Response now includes `revenueCents`, `revenueDollars`, and `revenueBreakdown` (per payment type).
  - `GET /api/admin/revenue/:facilityId` _(new endpoint)_ — returns `totals` (all-time, this month, last month, this year), `monthly` breakdown by payment type, and paginated `transactions` list with member names. Supports `?months=12&limit=50` query params.
- **`src/api/client.ts`**: Added `adminApi.getRevenue(facilityId, months, limit)`.

### Frontend
- **`src/components/admin/AdminDashboard.tsx`**:
  - Updated `DashboardStats` interface: replaced `revenue: number` with `revenueCents`, `revenueDollars`, and optional `revenueBreakdown`.
  - Updated initial state accordingly.
  - Revenue card now displays the real dollar amount formatted to two decimal places.
