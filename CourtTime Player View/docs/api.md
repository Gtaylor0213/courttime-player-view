# Shared API Surface

## Endpoint Inventory Matrix

| Endpoint | Web caller file:line | Mobile caller file:line | Status |
|---|---|---|---|
| `/api/address-whitelist/:id` | `src/api/client.ts:983; src/api/client.ts:991` | `-` | ❌ web-only |
| `/api/address-whitelist/:id/:id` | `src/api/client.ts:998; src/api/client.ts:1004` | `-` | ❌ web-only |
| `/api/address-whitelist/:id/bulk` | `src/api/client.ts:1021` | `-` | ❌ web-only |
| `/api/address-whitelist/:id/check/:id:id` | `src/api/client.ts:1012` | `-` | ❌ web-only |
| `/api/address-whitelist/:id/count/:id:id` | `src/api/client.ts:1017` | `-` | ❌ web-only |
| `/api/address-whitelist/:id/with-members` | `src/api/client.ts:987` | `-` | ❌ web-only |
| `/api/admin/analytics/:id` | `src/api/client.ts:721` | `-` | ❌ web-only |
| `/api/admin/booking-series/:id` | `src/api/client.ts:686; src/api/client.ts:693` | `-` | ❌ web-only |
| `/api/admin/booking-series/:id/instances` | `src/api/client.ts:706; src/api/client.ts:713` | `-` | ❌ web-only |
| `/api/admin/bookings/:id${queryString ` | `src/api/client.ts:669` | `-` | ❌ web-only |
| `/api/admin/bookings/:id/status` | `src/api/client.ts:673` | `-` | ❌ web-only |
| `/api/admin/courts/:id` | `src/api/client.ts:596; src/api/client.ts:649` | `-` | ❌ web-only |
| `/api/admin/courts/:id/bulk` | `src/api/client.ts:611` | `-` | ❌ web-only |
| `/api/admin/dashboard/:id` | `src/api/client.ts:553` | `-` | ❌ web-only |
| `/api/admin/email-blast/:id` | `src/api/client.ts:726` | `-` | ❌ web-only |
| `/api/admin/email-templates/:id` | `src/api/client.ts:734` | `-` | ❌ web-only |
| `/api/admin/email-templates/:id/:id` | `src/api/client.ts:742; src/api/client.ts:749` | `-` | ❌ web-only |
| `/api/admin/email-templates/:id/:id/preview` | `src/api/client.ts:758` | `-` | ❌ web-only |
| `/api/admin/facilities/:id` | `src/api/client.ts:575` | `-` | ❌ web-only |
| `/api/admin/terms/:id` | `src/api/client.ts:766; src/api/client.ts:770` | `-` | ❌ web-only |
| `/api/admin/terms/:id/acceptance` | `src/api/client.ts:777` | `-` | ❌ web-only |
| `/api/auth/me/:id` | `src/api/client.ts:65` | `-` | ❌ web-only |
| `/api/auth/validate-reset-token` | `src/api/client.ts:87` | `-` | ❌ web-only |
| `/api/bookings/:id` | `src/api/client.ts:488; src/api/client.ts:528` | `mobile/src/components/EditBookingModal.tsx:181; mobile/app/(tabs)/index.tsx:105` | ⚠️ shape mismatch |
| `/api/bookings/court/:id` | `src/api/client.ts:480` | `-` | ❌ web-only |
| `/api/bookings/facility/:id` | `src/api/client.ts:476` | `mobile/src/components/CourtCalendarGrid.tsx:89` | ✅ identical |
| `/api/bookings/user/:id` | `src/api/client.ts:484` | `mobile/app/(tabs)/profile.tsx:89` | ✅ identical |
| `/api/bulletin-board/:id` | `src/api/client.ts:406; src/api/client.ts:434` | `mobile/app/(tabs)/community.tsx:104; mobile/app/(tabs)/community.tsx:252` | ⚠️ shape mismatch |
| `/api/bulletin-board/:id/pin` | `src/api/client.ts:448` | `-` | ❌ web-only |
| `/api/bulletin-board/:id/signup` | `src/api/client.ts:455; src/api/client.ts:461` | `mobile/app/(tabs)/community.tsx:263; mobile/app/(tabs)/community.tsx:281` | ✅ identical |
| `/api/bulletin-board/:id/signup/:id` | `src/api/client.ts:467` | `-` | ❌ web-only |
| `/api/court-config/:id/availability` | `src/api/client.ts` (courtConfigApi.getAvailability); BookingWizard; QuickReservePopup | `mobile/app/(tabs)/book.tsx`; EditBookingModal | ✅ both |
| `/api/court-config/:id/schedule` | `src/api/client.ts:784; src/api/client.ts:801` | `-` | ❌ web-only |
| `/api/court-config/blackouts/:id` | `src/api/client.ts:846; src/api/client.ts:853` | `-` | ❌ web-only |
| `/api/court-config/facility/:id` | `-` | `mobile/src/components/CourtCalendarGrid.tsx:90` | ❌ mobile-only |
| `/api/court-config/facility/:id/blackouts${qs ` | `src/api/client.ts:817` | `-` | ❌ web-only |
| `/api/facilities/:id` | `src/api/client.ts:109` | `mobile/app/club-info.tsx:79; mobile/src/contexts/AuthContext.tsx:154` | ✅ identical |
| `/api/facilities/:id/courts` | `src/api/client.ts:113` | `mobile/app/club-info.tsx:80; mobile/src/components/EditBookingModal.tsx:76` | ✅ identical |
| `/api/facilities/search` | `src/api/client.ts:105` | `mobile/app/(tabs)/profile.tsx:218` | ✅ identical |
| `/api/hitting-partner/:id` | `src/api/client.ts:390; src/api/client.ts:397` | `mobile/app/(tabs)/community.tsx:206; mobile/app/(tabs)/community.tsx:217` | ✅ identical |
| `/api/hitting-partner/facility/:id` | `src/api/client.ts:361` | `mobile/app/(tabs)/community.tsx:91` | ✅ identical |
| `/api/hitting-partner/user/:id` | `src/api/client.ts:365` | `-` | ❌ web-only |
| `/api/households/:id` | `src/api/client.ts:1113; src/api/client.ts:1145` | `-` | ❌ web-only |
| `/api/households/:id/bookings:id` | `src/api/client.ts:1188` | `-` | ❌ web-only |
| `/api/households/:id/members` | `src/api/client.ts:1163` | `-` | ❌ web-only |
| `/api/households/:id/members/:id` | `src/api/client.ts:1174; src/api/client.ts:1181` | `-` | ❌ web-only |
| `/api/households/:id:id` | `src/api/client.ts:1153` | `-` | ❌ web-only |
| `/api/households/facility/:id` | `src/api/client.ts:1109` | `-` | ❌ web-only |
| `/api/households/user/:id:id` | `src/api/client.ts:1118` | `-` | ❌ web-only |
| `/api/members/:id` | `src/api/client.ts:302` | `mobile/app/(tabs)/messages.tsx:154` | ⚠️ shape mismatch |
| `/api/members/:id/:id` | `src/api/client.ts:275; src/api/client.ts:285` | `mobile/app/(tabs)/profile.tsx:251` | ⚠️ shape mismatch |
| `/api/members/:id/:id/admin` | `src/api/client.ts:309` | `-` | ❌ web-only |
| `/api/members/:id/:id/is-admin` | `src/api/client.ts:316` | `-` | ❌ web-only |
| `/api/members/:id:id` | `src/api/client.ts:271` | `-` | ❌ web-only |
| `/api/messages/:id` | `src/api/client.ts:1037` | `mobile/app/(tabs)/messages.tsx:108` | ⚠️ shape mismatch |
| `/api/messages/:id/read` | `src/api/client.ts:1050` | `mobile/app/(tabs)/messages.tsx:116` | ⚠️ shape mismatch |
| `/api/messages/conversations/:id/:id` | `src/api/client.ts:1032` | `mobile/app/(tabs)/messages.tsx:80` | ✅ identical |
| `/api/notifications/:id` | `src/api/client.ts:1061; src/api/client.ts:1100` | `mobile/app/(tabs)/community.tsx:119` | ⚠️ shape mismatch |
| `/api/notifications/:id/read` | `src/api/client.ts:1071` | `mobile/app/(tabs)/community.tsx:307` | ⚠️ shape mismatch |
| `/api/notifications/:id/read-all` | `src/api/client.ts:1078` | `mobile/app/(tabs)/community.tsx:312` | ⚠️ shape mismatch |
| `/api/notifications/:id/unread-count` | `src/api/client.ts:1066` | `mobile/app/(tabs)/community.tsx:120` | ⚠️ shape mismatch |
| `/api/payments/history/:id` | `src/api/client.ts:1234` | `-` | ❌ web-only |
| `/api/payments/subscription/:id` | `src/api/client.ts:1230` | `-` | ❌ web-only |
| `/api/player-profile/:id` | `src/api/client.ts:323; src/api/client.ts:336` | `mobile/app/(tabs)/profile.tsx:88; mobile/app/(tabs)/profile.tsx:156` | ✅ identical |
| `/api/player-profile/:id/bookings` | `src/api/client.ts:350` | `-` | ❌ web-only |
| `/api/player-profile/:id/request-membership` | `src/api/client.ts:343` | `mobile/app/(tabs)/profile.tsx:231` | ✅ identical |
| `/api/rules/definitions:id` | `src/api/client.ts:863` | `-` | ❌ web-only |
| `/api/rules/facility/:id` | `src/api/client.ts:867; src/api/client.ts:881` | `-` | ❌ web-only |
| `/api/rules/facility/:id/:id` | `src/api/client.ts:893; src/api/client.ts:900` | `-` | ❌ web-only |
| `/api/rules/facility/:id/bulk` | `src/api/client.ts:912` | `-` | ❌ web-only |
| `/api/rules/facility/:id/disable-all` | `src/api/client.ts:925` | `-` | ❌ web-only |
| `/api/rules/facility/:id/effective` | `src/api/client.ts:871` | `-` | ❌ web-only |
| `/api/rules/facility/:id/enable-all` | `src/api/client.ts:919` | `-` | ❌ web-only |
| `/api/strikes/:id` | `src/api/client.ts:969` | `-` | ❌ web-only |
| `/api/strikes/:id/revoke` | `src/api/client.ts:962` | `-` | ❌ web-only |
| `/api/strikes/check/:id:id` | `src/api/client.ts:976` | `-` | ❌ web-only |
| `/api/strikes/facility/:id${qs ` | `src/api/client.ts:938` | `-` | ❌ web-only |
| `/api/strikes/user/:id` | `src/api/client.ts` (strikesApi.getByUser) | `mobile/app/(tabs)/profile.tsx` | ✅ both |
| `/api/strikes/check/:userId` | `src/components/CourtCalendarView.tsx`; PlayerProfile | `mobile/app/(tabs)/index.tsx`; book; profile | ✅ both |
| `/api/strikes/user/:id:id` | `src/api/client.ts:943` | `-` | ❌ web-only |
| `/api/users/:id` | `src/api/client.ts:252; src/api/client.ts:260` | `-` | ❌ web-only |
| `/api/users/:id/memberships` | `src/api/client.ts:256` | `-` | ❌ web-only |

## Notes on Mismatches

Path patterns below aggregate **different operations** on similar routes (not necessarily bugs).

- `/api/auth/me` — mobile uses Bearer `GET /api/auth/me`; web uses `GET /api/auth/me/:userId`.
- `/api/bookings/:id` — web may `GET` or `DELETE`; mobile often `DELETE` only from player screens.
- `/api/bulletin-board/:id` — web admins use `PATCH` (pin/edit); mobile uses `GET`/`POST`/`DELETE` for player flows.
- `/api/members/:id` — web `POST` (create); mobile `GET` (list for messages).
- Notification read routes: **both clients use `PATCH`** for `/read` and `/read-all` (community tab on mobile).
- See [`docs/mobile-web-sync.md`](mobile-web-sync.md) for intentional web-only admin routes and mobile-only push device registration.

## Shared Response Envelope

- `success`: boolean
- `data`: endpoint payload
- `error`/`errorMessage`: user-facing failure string
- `errorCategory`: `offline`, `unauthorized`, `forbidden`, `not_found`, `server`, `timeout`, `unknown`
- `ruleViolations`, `warnings`, `isPrimeTime`: booking-rule metadata passthrough

## Sync Strategy

- Current: polling transport (`shared/api/sync.ts`) at 5s on active booking/feed views.
- Future-ready: same transport interface can be swapped for SSE (`/api/bookings/stream`) without screen-level API changes.

## Error Categories

- `offline`: device has no network route
- `timeout`: request exceeded client timeout
- `unauthorized`/`forbidden`/`not_found`/`server`: mapped from HTTP status
- `unknown`: fallback for uncategorized failures
