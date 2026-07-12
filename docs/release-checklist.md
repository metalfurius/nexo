# Nexo release checklist

## Required gate

- `npm ci`
- `npm --prefix functions ci`
- `npm run release:check`
- `npm run worker:check`
- `npm audit --audit-level=high`
- `npm run audit:functions`

`npm run release:check` covers lint, application/test typechecks, unit and rules tests, production build validation, local Playwright, the Workbox offline smoke, Firebase emulator E2E (including a real pending Firestore write) and both dependency audits. Java and the Firebase emulators must be available. The build gate counts the entry `<script>` and every application `modulepreload`, rejects eager private/search chunks and requires initial first-party application JavaScript and CSS below 200 KiB.

GitHub Actions mirrors this gate. CI has per-PR/ref concurrency, one retry only in CI, `retain-on-failure` traces and uploads `test-results` plus `playwright-report` on failure. All external Actions are pinned to commit SHAs and Dependabot covers root npm, Functions npm and GitHub Actions.

## Production identity and credentials

Firebase deployment uses `google-github-actions/auth` with Workload Identity Federation. Configure the provider with this attribute condition before enabling production deploys:

```text
assertion.repository_id == '1255487355' &&
assertion.repository_owner_id == '75508084' &&
assertion.ref == 'refs/heads/main'
```

Set `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_SERVICE_ACCOUNT` as protected `production` environment variables. Grant the service account only the Firebase Functions, Firestore rules/indexes and seed permissions used by the workflow. Once one WIF deployment and smoke pass, remove the legacy JSON service-account secret from GitHub and Google Cloud.

Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as protected production secrets. The Cloudflare token must be account-scoped, restricted to the Nexo Worker and required zone only, and rotated with a maximum TTL of 90 days. Set the required Firebase/catalog `VITE_*` values plus `E2E_BACKEND_HEALTH_URL`, `E2E_PROD_MOD_EMAIL` and `E2E_PROD_MOD_PASSWORD`. Missing identity, backend, required frontend or smoke credentials must fail the workflow; no deployment job may be silently skipped.

`VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` is optional during the observational App Check rollout. Once configured, collect seven full days of App Check metrics without enforcement; enable enforcement for Functions first and Firestore only after Functions traffic remains healthy.

## Version and PR

- Put exactly one SemVer label on the PR: `release:x.y.z`.
- Remove legacy `patch`, `minor`, `major` and every conflicting `release:*` label.
- Confirm the version workflow synchronizes root and Functions packages and lockfiles from that label.
- Review `CHANGELOG.md` and ensure it has a heading for the package version.
- Run the required gate and resolve every high/critical root or Functions advisory.

Version tooling accepts any valid, increasing SemVer target and contains no release-specific service-worker cache constant. Workbox derives cache names from the package version during the build.

An untagged release may receive a deployment-blocker PR with the same `release:x.y.z` label as `main`. This recovery path is accepted only when every package and lockfile already matches that version and `vX.Y.Z` does not exist; a published version can never be reused.

## Functional and accessibility acceptance

- With 1,000 Biblioteca entries, confirm only 24 cards render initially and “Mostrar 24 más” is keyboard/screen-reader accessible.
- Exercise an unsaved editor through close, Escape, backdrop, browser navigation and `beforeunload`; explicitly save or discard.
- Verify a cold Biblioteca deep link waits for Firebase before deciding whether the item exists.
- Switch account A→B and verify selections, drafts, undo data and private requests from A disappear.
- Reload after a bulk roadmap mutation and verify the order/status remains persisted.
- Run Home, Descubrir, Biblioteca, Dado and Ajustes in all seven themes. Axe must report zero moderate-or-higher release violations and accent controls must meet WCAG AA.
- Exercise 390×844, 768×1024, 1440×900 and 1920×1080 with reduced motion and no horizontal overflow.

## PWA and offline acceptance

- Install the production build and wait until the generated `sw.js` controls the page.
- Confirm every Cache Storage entry starts with `nexo-` and old Nexo caches are removed without deleting unrelated origin caches.
- Reload a deep route offline and read the IndexedDB-backed private library.
- Make a Firestore write offline, observe “Sincronizando cambios”, reconnect and verify the emulator/backend document receives it.
- Confirm navigation uses `NetworkFirst` with a three-second timeout and an app-shell fallback.
- Confirm an available update is announced but activates only after the user chooses to update.
- Confirm notification clicks can focus/navigate only to same-origin Nexo URLs.

## Ordered production deployment

`.github/workflows/deploy-production.yml` runs only after successful `CI` on a push to `main`, or via `workflow_dispatch(ref, skip_seed)`. It deploys one immutable SHA in this order:

1. Functions, Firestore rules and indexes; optionally write the idempotent normalized catalog seed.
2. The Cloudflare Worker.
3. The verified GitHub Pages artifact.
4. Wait until `/version.json`, Worker `/health` and Functions `backendHealth` all expose the approved SHA.
5. Run anonymous catalog and authenticated moderator production smoke tests.
6. Create `v<version>` and its GitHub Release only after the smoke succeeds.

Any backend, credential, revision or smoke failure stops the chain and prevents tagging. A manual redeploy must be launched from `main`, must target an existing SemVer release tag reachable from `main`, and may set `skip_seed`; arbitrary branches and commit SHAs are rejected, and the workflow never performs a destructive catalog rollback.

Before restrictive rules are deployed, the Firebase job runs the idempotent Firestore normalizer and then the read-only compatibility auditor. The normalizer only fills a missing user `createdAt` from Firestore document metadata and removes the explicitly allowlisted legacy fields `repairedAt`, `repairedBy`, `genresText`, `moodText` and `tagsText`; it uses batches of at most 400 writes and never deletes documents. Any remaining incompatibility still stops the release and uploads redacted reports containing hashed paths rather than private data.

## Final production checks

- Verify `?tab=discover&mode=search&q=Dune` returns the expected catalog cards after reload.
- Verify moderator login from the top bar and open Curar through “Más secciones”.
- Confirm Worker CORS permits only the production origin, `/health` has no PII and structured logs contain no IP, query or user content.
- Confirm `version.json`, Worker health and Functions health expose the same merged revision and package version.
- Inspect Firebase/Google Cloud and Cloudflare built-in logs, traces and metrics; no paid observability dependency is required.
