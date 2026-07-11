# Nexo 1.1.50 Release Checklist

## Required Gate

- `npm ci`
- `npm --prefix functions ci`
- `npm run lint`
- `npm run test`
- `npm run test:rules`
- `npm run build`
- `npm run check:build-output`
- `npm run build:functions`
- `npm run check:release-tools`
- `npm run test:e2e`
- `npm run test:e2e:firebase`
- `npm run check:release-files`
- `npm audit --audit-level=high`

`npm run release:check` covers the full local gate and expects Java/Firebase emulators to be available for Firestore rules tests. If a Firestore emulator is already running on `127.0.0.1:8080`, `npm run test:rules` reuses it instead of trying to start a second emulator. `npm run check:build-output` validates the generated `dist` asset paths for the clean subdomain and confirms PWA/static files were copied. `npm run check:release-files` validates release metadata and static launch contracts such as CNAME, manifest shortcuts, required docs, Firebase config and the public catalog seed.

GitHub Actions mirrors the gate:

- `.github/workflows/ci.yml` runs on pull requests and manual dispatch.
- `.github/workflows/ci.yml` also gates pushes to `main` with the full release check before any Pages deploy starts.
- `.github/workflows/deploy-pages.yml` runs after successful `CI` push runs on `main`, builds the production Pages artifact, deploys GitHub Pages and runs the production smoke.
- `.github/workflows/deploy-functions.yml` deploys Firebase Functions and writes the public catalog seed when Functions/catalog paths change, and also supports manual dispatch.
- `.github/workflows/version-bump.yml` commits package, lockfile and service worker cache updates into the open PR labelled `release:1.1.50`, so the original PR is the only PR that needs normal verification.
- Repository secret `VERSION_BUMP_TOKEN` must be present with `repo` permissions so automated version commits trigger normal PR checks.

## Firebase

- Confirm GitHub Pages variables match `.env.example`.
- Confirm Firebase Auth Google provider is enabled.
- Confirm Firebase Auth Email/Password provider is enabled for admin/mod smoke accounts.
- Confirm Firestore rules and indexes are deployed.
- Bootstrap the first admin manually by setting `users/{uid}.role` to `admin`.
- Create the production smoke moderator/admin account and set `E2E_PROD_MOD_EMAIL` and `E2E_PROD_MOD_PASSWORD` as GitHub Secrets.
- Set `FIREBASE_SERVICE_ACCOUNT_RECOMENDACIONES_78EB7` as a GitHub Secret for Functions and catalog deploys.
- Confirm normal sign-in creates `users/{uid}` profiles with `role: "user"`.
- Run `npm run catalog:normalize` and review `seed/public-catalog.normalized.json`.
- Run `npm run catalog:write:prod` after reviewing seed changes, or dispatch the Functions/catalog workflow.
- Confirm `VITE_PUBLIC_CATALOG_URL?q=dune&type=any&limit=24` returns Dune before sharing beta access.

Firebase Functions are required for the anonymous public catalog endpoint. GitHub Pages deploys do not update `publicCatalog`.

## Release Steps

- Put exactly one version label on the PR before merge: `release:1.1.50`. Remove `patch`, `minor`, `major` and every other `release:*` label.
- Run `node scripts/bumpVersion.mjs 1.1.50 --dry-run --base-version 1.0.50` and confirm that any other target or downgrade is rejected.
- Verify package versions stay synchronized across root package files, functions package files and `public/sw.js`.
- Review `CHANGELOG.md`.
- Run the required gate.
- Review Home at 390x844, 768x1024, 1440x900 and 1920x1080; at 390x844, `Tu ruta` and its primary action must appear before scrolling and navigation must remain on one row.
- Exercise Home, Descubrir, Biblioteca and Dado in all seven themes and with reduced motion; Axe must report no serious/critical or new moderate violations.
- Confirm `npm run check:build-output` reports first-party initial JavaScript and CSS below 200 KiB and no public preload of Home, Biblioteca or importers.
- Confirm the wide/narrow PWA screenshots show the final `Tu ruta` surface at 1280x720 and 390x844.
- Build with `GITHUB_PAGES=true`.
- Let Deploy Pages run after CI is green on `main`, or dispatch it manually when republishing the current build.
- Deploy Functions/catalog seed when public catalog logic or seed changes.
- Tag the merged version `v1.1.50`.
- Create a GitHub Release from the tag.
- Watch GitHub Pages deploy and confirm the production smoke covers anonymous catalog search and moderator email login.
- Install from browser/PWA prompt once and confirm standalone launch reaches Inicio after authentication and Descubrir anonymously.

## Known Launch Notes

- Firebase Auth, Firestore and Analytics are split behind lazy imports. The release gate keeps the first-party entry and initial CSS each below 200 KiB, excluding vendor chunks.
- The service worker only caches same-origin app shell/assets and should not intercept Firebase or external API calls.
- `npm audit --audit-level=moderate` reports transitive `uuid` advisories through Firebase Admin/Tools dependency chains. High severity audit is clean-gated for 1.1.50; revisit after Firebase packages publish non-breaking patched dependency trees.
