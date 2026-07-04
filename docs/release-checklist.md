# Nexo 1.0 Release Checklist

## Required Gate

- `npm ci`
- `npm --prefix functions ci`
- `npm run lint`
- `npm run test`
- `npm run test:rules`
- `npm run build`
- `npm run check:build-output`
- `npm run build:functions`
- `npm run test:e2e`
- `npm run test:e2e:firebase`
- `npm run check:release-files`
- `npm audit --audit-level=high`

`npm run release:check` covers the full local gate and expects Java/Firebase emulators to be available for Firestore rules tests. If a Firestore emulator is already running on `127.0.0.1:8080`, `npm run test:rules` reuses it instead of trying to start a second emulator. `npm run check:build-output` validates the generated `dist` asset paths for the clean subdomain and confirms PWA/static files were copied. `npm run check:release-files` validates release metadata and static launch contracts such as CNAME, manifest shortcuts, required docs, Firebase config and the public catalog seed.

GitHub Actions mirrors the gate:

- `.github/workflows/ci.yml` runs on pull requests and manual dispatch.
- `.github/workflows/deploy-pages.yml` runs on `main`, repeats the gate, deploys GitHub Pages and runs the production smoke.
- `.github/workflows/deploy-functions.yml` deploys Firebase Functions and writes the public catalog seed when Functions/catalog paths change, and also supports manual dispatch.
- `.github/workflows/version-bump.yml` opens a package version PR with `VERSION_BUMP_TOKEN` after a merged PR labelled `patch`, `minor` or `major`, lets normal PR CI run, auto-merges it, then dispatches deploy.
- Repository secret `VERSION_BUMP_TOKEN` must be present with `repo` and `workflow` permissions so automated version PRs trigger normal PR checks.

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

- Put exactly one version label on the PR before merge: `patch`, `minor` or `major`.
- Verify package versions stay synchronized across root and functions package files.
- Review `CHANGELOG.md`.
- Run the required gate.
- Build with `GITHUB_PAGES=true`.
- Deploy Functions/catalog seed when public catalog logic or seed changes.
- Tag the merged version, for example `v1.0.1`.
- Create a GitHub Release from the tag.
- Watch GitHub Pages deploy and confirm the production smoke covers anonymous catalog search and moderator email login.
- Install from browser/PWA prompt once and confirm standalone launch reaches Biblioteca.

## Known Launch Notes

- Firebase Auth, Firestore and Analytics are split behind lazy imports. `npm run build` should not emit Vite's 500 kB chunk warning; if it returns, inspect the initial `index-*.js` chunk before tagging.
- The service worker only caches same-origin app shell/assets and should not intercept Firebase or external API calls.
- `npm audit --audit-level=moderate` reports transitive `uuid` advisories through Firebase Admin/Tools dependency chains. High severity audit is clean-gated for 1.0; revisit after Firebase packages publish non-breaking patched dependency trees.
