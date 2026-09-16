# Mobile Release Runbook

Everything needed to get a CourtTime build onto TestFlight, Play internal testing, and then the stores. Follow it top to bottom the first time; after that, only "Ship a build" and "Ship an OTA fix" matter.

All commands run from `CourtTime Player View/mobile`.

---

## One-time setup

These steps need accounts and can't be done for you. Each writes something into the repo or into EAS that later steps depend on.

### 1. Developer accounts

| Account | Cost | Lead time |
|---|---|---|
| Apple Developer Program | $99/year | Hours to days — enrolment can require identity verification |
| Google Play Developer | $25 once | Usually hours, occasionally days |
| Expo (EAS) | Free tier builds | Immediate |

Start the Apple enrolment first: it has the longest and least predictable lead time, and nothing else on the iOS path can begin without it.

### 2. Link the EAS project

```bash
npm install -g eas-cli
eas login
eas init            # creates the project, writes extra.eas.projectId into app.json
eas update:configure  # writes expo.updates.url for OTA
```

`eas init` is what fills in the project ID. Commit the `app.json` changes it makes.

### 3. Credentials

Let EAS manage signing — it generates and stores the iOS certificates and the Android keystore for you:

```bash
eas credentials
```

For Play submissions, create a service account in the Google Cloud console, grant it release permissions in Play Console, download the JSON, and save it as `mobile/play-service-account.json`. **That file is gitignored and must stay that way** — it can publish to your Play listing.

### 4. Sentry

Create the project at sentry.io, then put these in `mobile/.env` (gitignored):

```
EXPO_PUBLIC_SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project>
SENTRY_ORG=<org-slug>
SENTRY_PROJECT=<project-slug>
SENTRY_AUTH_TOKEN=<token>       # build-time source map upload only
```

The DSN is public by design — it identifies where to send events and is embedded in the app. **`SENTRY_AUTH_TOKEN` is a real secret**: it can write to your Sentry org. Never commit it; for CI builds put it in EAS secrets:

```bash
eas secret:create --name SENTRY_AUTH_TOKEN --value <token> --scope project
```

Leave `sendDefaultPii` off in `src/utils/sentry.ts` — see `appstore/PRIVACY_DECLARATIONS.md` for why the privacy labels depend on it.

---

## Ship a build

```bash
eas build --profile preview --platform all      # internal testing
eas build --profile production --platform all   # store submission
```

`production` auto-increments the build number (`appVersionSource: remote`, so EAS is the source of truth — don't hand-edit build numbers).

To change the marketing version, edit `expo.version` in `app.json`.

Then submit:

```bash
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

`eas.json` deliberately carries **no** Apple ID, ASC app ID or team ID. Placeholder credentials fail at submit time with a confusing error, so `eas submit` prompts for them on the first run and remembers the answers. Android is set to the `internal` track — promote from Play Console once it looks good.

---

## Ship an OTA fix

JavaScript-only fixes reach members without a store review:

```bash
eas update --branch production --message "Fix booking confirmation copy"
```

**What OTA can and cannot do.** It ships JS and assets. It cannot ship a change to native code — a new Expo module, a permission, anything in `app.json` that affects the native project. `runtimeVersion` uses the **fingerprint** policy, which hashes the native dependency set: if you change native dependencies, the fingerprint changes and older builds stop receiving the update instead of crashing on a missing module. That is the desired behavior. When the fingerprint changes, ship a new build.

---

## Before the first submission

- [ ] Run on a **physical iPhone and Android device**, not just a simulator — nothing in this repo has been device-tested, including the Expo SDK 57 upgrade
- [ ] Verify the app talks to production (`https://www.courttimeapp.com`) in a release build, not just Expo Go
- [ ] Confirm `/privacy`, `/terms`, `/support`, `/delete-account` all load on the live site
- [ ] Trigger a test crash and confirm it reaches Sentry
- [ ] Walk the deletion flow end to end on a real device — reviewers do
- [ ] **Refresh the reviewer demo account** — `npm run seed:review` from `CourtTime Player View`. Re-run it before *every* submission so the demo bookings stay in the future; a reviewer who opens the app to an empty calendar is the same problem as no account at all.
  - Credentials to paste into App Review notes: `appreview@courttimeapp.com` / `CourtTimeReview1!`
  - It builds an isolated **CourtTime Demo Club**, never a membership at a real club — a reviewer placed in a live club would see your members' real names, reservations and messages
  - `npm run seed:review -- --remove` tears it down
- [ ] Assets per `appstore/ASSETS.md`, listing copy from `appstore/LISTING.md`
- [ ] Privacy answers from `appstore/PRIVACY_DECLARATIONS.md` in both consoles

---

## Review expectations

- **Apple:** usually 24–48 hours. Common rejections here would be an unreachable demo account, a broken legal URL, or privacy answers that contradict app behavior. Budget a round of feedback on a first submission.
- **Google:** hours to about 3 days. The Data safety form must be complete or the listing cannot publish.
