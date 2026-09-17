## Summary

<!-- What changed and why. -->

## Checklist

- [ ] Player- or admin-visible change? Mobile item filed (docs/mobile-parity-and-release-plan.md) or the path is listed as `web-only` with a reason in docs/mobile-web-sync.md.
- [ ] New `/api` route or client call? `npm run parity:check` passes.
- [ ] Tests: `npm test` (web/shared) and, if `mobile/` or `shared/` changed, `npm run typecheck:mobile` + `npm run test:mobile`.
- [ ] Schema change? Migration added and noted in the PR (Render does not run migrations automatically).
