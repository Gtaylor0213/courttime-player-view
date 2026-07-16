---
name: verify
description: How to run and drive this project's API server for verification.
---

# Verifying CourtTime changes

## Launch the API server

```bash
cd "CourtTime Player View"
PORT=3199 npx tsx server/index.ts   # picks up .env automatically (dotenv)
```

Server is up when POST requests answer JSON (there is no /api/health route — a 404 there is normal).
Full stack: `npm run dev` (API on 3001 + Vite web on 5173, proxied).

## Gotchas

- **DATABASE_URL in .env points at the live Supabase database.** Do NOT drive
  flows that INSERT (bookings, payments, members) against it. Read-only probes
  (auth failures, validation failures with fake UUIDs) are safe — validation
  runs before any write and fake court/user UUIDs fail rules-engine lookups.
- No local Postgres or Docker on this machine, so write paths need explicit
  user sign-off or a scratch DATABASE_URL.
- Auth: JWTs are HS256 with JWT_SECRET from .env. Mint a short-lived test token:
  ```bash
  node -e "require('dotenv').config();const jwt=require('jsonwebtoken');
  console.log(jwt.sign({userId:'<uuid>',email:'x@test.local',userType:'admin'},process.env.JWT_SECRET,{expiresIn:'10m'}))"
  ```
  `userType` is 'admin' or 'player'; routes check `req.user.userType`.
- Tests: `npm test` (vitest, node env). Web app has no root tsconfig — Vite
  never typechecks; mobile/ has its own tsconfig with pre-existing errors.
