# CourtTime

Court-booking web app for swim/tennis clubs and HOAs ([courttimeapp.com](https://www.courttimeapp.com)).
Members reserve courts, sign up for clinics and lessons, find hitting partners, message each
other and pay club fees. Club admins manage courts, members, rules, communication and payments.

## Stack

| Layer | Technology |
|---|---|
| Web frontend | React 18 + TypeScript, Vite, Tailwind CSS 4, shadcn/Radix components, react-router |
| API | Express 5 + TypeScript, run with `tsx` |
| Database | PostgreSQL (Supabase), hand-written SQL migrations, `pg` driver |
| Payments | Stripe (platform subscriptions) and Stripe Connect (member → club payments) |
| Email | Resend |
| Mobile | Separate Expo / React Native app in [`mobile/`](mobile/README.md) sharing `shared/` and the same API |
| Hosting | Render (see `../render.yaml`), GitHub Actions CI (`../.github/workflows/ci.yml`) |

## Repository layout

```
src/
  api/          browser-side API client (one exported object per domain, e.g. bookingApi)
  components/   web UI. admin/, developer/ (support console), facility-registration/, ui/ (shadcn)
  contexts/     React contexts: auth, app state, notifications
  services/     SERVER-side business logic (imported by server/routes, never by the browser)
  database/     pg connection pool, schema.sql and migrations/NNN_*.sql
  utils/        browser-side helpers
server/
  index.ts      Express entry: CORS, route mounting, static build serving, background sweeps
  middleware/   JWT auth, facility-admin authorization helpers
  routes/       one router per API area (/api/bookings, /api/admin, ...)
shared/         pure logic, constants and types used by web, server AND mobile
mobile/         Expo app (own package.json, tests and typecheck)
scripts/        one-off ops scripts (migrations, seeding, admin grants). Not imported by the app.
docs/           API surface inventory, mobile parity plan, release runbook
legal/          privacy policy, terms, account deletion, support pages (source of the /privacy etc. routes)
appstore/       store listing copy and assets
```

## Getting started

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL, JWT_SECRET, Stripe and Resend keys
npm run dev               # API on :3001 + Vite on :5173 (Vite proxies /api to the API)
```

Other useful scripts:

| Script | What it does |
|---|---|
| `npm run dev:server` / `npm run dev:client` | run only the API or only the web app |
| `npm run dev:alt` | a second local stack on ports 3002 / 5174 |
| `npm run build` | production web build into `build/` |
| `npm start` | serve API + built web app (what Render runs) |
| `npm test` | vitest (web, server and shared unit tests) |
| `npm run db:migrate [file.sql]` | apply pending migrations, or one specific file |
| `npm run db:check` | verify the DB connection and list tables |
| `npm run mobile:install`, `npm run expo:start`, `npm run test:mobile`, `npm run typecheck:mobile` | mobile app |

## Environment variables

See [`.env.example`](.env.example) for the full annotated list. Required to boot the API:
`DATABASE_URL`, `JWT_SECRET`. Payments need `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`
and the two webhook secrets. Email needs `RESEND_API_KEY`. Leave `VITE_API_BASE_URL` unset for
the normal same-origin deployment.

`server/index.ts` loads `.env`, then fills gaps from `.env.development`, then lets `.env.local`
override both.

## Database and migrations

Migrations live in `src/database/migrations/` and are numbered `NNN_description.sql`.
`scripts/run-migration.js` records applied files in a `schema_migrations` table, so re-running is
safe. Render runs `node scripts/run-migration.js --pending` before every deploy, so a migration
committed alongside code ships with it.

**`npm run db:migrate` and every script in `scripts/` run against whatever `DATABASE_URL` points
to.** Double-check which database that is before running anything that writes.

## Authentication and authorization

Users get a 7-day JWT from `/api/auth`. `server/middleware/auth.ts` verifies it and rejects
deleted accounts. Facility-level authorization (is this user an admin of *this* club?) is in
`server/middleware/facilityAdmin.ts`; platform super admins pass every facility check there.

## Testing

`npm test` runs vitest over `src/**`, `shared/**` and `server/**` `*.test.ts` files. CI runs the
same plus the mobile typecheck and tests. There is no `tsconfig.json` for the web/server code, so
the Vite build is the import-level safety net.

## More documentation

- [`docs/api.md`](docs/api.md): endpoint inventory shared by web and mobile
- [`docs/mobile-web-sync.md`](docs/mobile-web-sync.md): how web and mobile share code and the API
- [`docs/mobile-release.md`](docs/mobile-release.md): TestFlight / Play / store release runbook
- [`docs/mobile-parity-and-release-plan.md`](docs/mobile-parity-and-release-plan.md): parity status
- [`legal/README.md`](legal/README.md): status of the legal documents
