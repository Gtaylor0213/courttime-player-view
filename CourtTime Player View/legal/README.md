# Legal Documents

> ⚠️ **NOT LEGAL ADVICE — attorney review still outstanding.** These files are tailored to CourtTime's actual data flows and third-party integrations, and the entity details are filled in, but **no attorney has reviewed them.** Apple and Google can reject submissions where the published policy does not accurately match what the app does, and inaccurate disclosures create real legal exposure (FTC, CCPA, GDPR).
>
> **Status (15 Sep 2026):** entity name, business address, governing-state and effective date are filled in, and the member-facing DRAFT banners are removed, so the pages are publishable. The remaining gate is a lawyer reading them.

## Files in this folder

| File | What it is | Required for |
|---|---|---|
| `PRIVACY_POLICY.md` | What data you collect, how it's used, who it's shared with, user rights | App Store, Play Store, GDPR/CCPA |
| `TERMS_OF_SERVICE.md` | Rules for using CourtTime, liability disclaimers, account & dispute terms | App Store, Play Store, contract enforcement |
| `ACCOUNT_DELETION.md` | How users delete their account and data | App Store, Play Store (both require this) |

## Placeholders to fill in before publishing

Search every file for these tokens and replace:

- `Georgia` — the U.S. state whose laws govern your contract (likely the state where CourtTime is incorporated or operates from)
- `CourtTimeApp LLC` — your legal entity name (e.g. "CourtTime, LLC" or "CourtTime, Inc.")
- `4239 Allenhurst Dr, Norcross, GA 30092` — physical mailing address for legal notices
- `September 15, 2026` — the date the policy/terms take effect
- `reidbissell@courttimeapp.com` — replace with your real support email if different

## Hosting requirements

Both stores require these documents at **stable, public URLs** (not links inside the app, not PDFs in a Google Drive). Recommended URLs:

- `https://courttimeapp.com/privacy`
- `https://courttimeapp.com/terms`
- `https://courttimeapp.com/delete-account`

Two options to host:

1. **Add routes to the existing web app** — convert the markdown to HTML/JSX and serve them from the same Vite app at `courttimeapp.com`. Cleanest, version-controlled with the rest of the code.
2. **External service** (Termly, iubenda, GetTerms) — they generate jurisdiction-aware policies, host them, and auto-update for new laws (~$10–30/mo). Easier compliance, but you give up customization.

If you want option 1, ask Claude to wire up the routes after the docs are reviewed.

## Submission checklist (post-review)

- [ ] Attorney has reviewed and approved final text
- [ ] All placeholders replaced
- [ ] Documents hosted at public HTTPS URLs
- [ ] URLs entered in App Store Connect (Privacy Policy URL field on app metadata)
- [ ] URLs entered in Google Play Console (Privacy Policy URL field + Data Safety section)
- [ ] Account deletion process accurately described and reachable from inside the app (Apple may test this)
- [ ] Privacy Policy URL accessible from the app's settings/profile screen (App Store soft requirement)
