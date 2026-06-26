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
- `npm run check:release-files`
- `npm audit --audit-level=high`

`npm run release:check` covers the full local gate and expects Java/Firebase emulators to be available for Firestore rules tests. If a Firestore emulator is already running on `127.0.0.1:8080`, `npm run test:rules` reuses it instead of trying to start a second emulator. `npm run check:build-output` validates the generated `dist` asset paths for the clean subdomain and confirms PWA/static files were copied. `npm run check:release-files` validates release metadata and static launch contracts such as CNAME, manifest shortcuts, required docs, Firebase config and the public catalog seed.

GitHub Actions mirrors the gate:

- `.github/workflows/ci.yml` runs on pull requests and manual dispatch.
- `.github/workflows/deploy-pages.yml` runs on `main`, repeats the gate, then deploys GitHub Pages.
- `.github/workflows/version-bump.yml` opens a package version PR after a merged PR labelled `patch`, `minor` or `major`, runs CI against the strict PR merge ref, auto-merges it, then dispatches deploy.

## Firebase

- Confirm GitHub Pages variables match `.env.example`.
- Confirm Firebase Auth Google provider is enabled.
- Confirm Firestore rules and indexes are deployed.
- Bootstrap the first admin manually by setting `users/{uid}.role` to `admin`.
- Confirm normal sign-in creates `users/{uid}` profiles with `role: "user"`.
- Run `npm run catalog:normalize` and review `seed/public-catalog.normalized.json`.
- Seed or curate initial `publicItems` entries before sharing beta access.

Functions are optional for a Blaze-backed provider upgrade. The 1.0 Spark-compatible path should not require Firebase Functions.

## Release Steps

- Put exactly one version label on the PR before merge: `patch`, `minor` or `major`.
- Verify package versions stay synchronized across root and functions package files.
- Review `CHANGELOG.md`.
- Run the required gate.
- Build with `GITHUB_PAGES=true`.
- Tag the merged version, for example `v1.0.1`.
- Create a GitHub Release from the tag.
- Watch GitHub Pages deploy and smoke-test login, Biblioteca, Dado, Explorador and Curacion.
- Install from browser/PWA prompt once and confirm standalone launch reaches Biblioteca.

## Known Launch Notes

- Firebase Auth, Firestore and Analytics are split behind lazy imports. `npm run build` should not emit Vite's 500 kB chunk warning; if it returns, inspect the initial `index-*.js` chunk before tagging.
- The service worker only caches same-origin app shell/assets and should not intercept Firebase or external API calls.
- `npm audit --audit-level=moderate` reports transitive `uuid` advisories through Firebase Admin/Tools dependency chains. High severity audit is clean-gated for 1.0; revisit after Firebase packages publish non-breaking patched dependency trees.
