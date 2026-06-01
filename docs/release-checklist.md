# Nexo 1.0 Release Checklist

## Required Gate

- `npm ci`
- `npm --prefix functions ci`
- `npm run lint`
- `npm run test`
- `npm run test:rules`
- `npm run build`
- `npm run build:functions`
- `npm run test:e2e`
- `npm audit --audit-level=high`

`npm run release:check` covers the full local gate and expects Java/Firebase emulators to be available for Firestore rules tests. If a Firestore emulator is already running on `127.0.0.1:8080`, `npm run test:rules` reuses it instead of trying to start a second emulator.

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

- Verify package versions are `1.0.0`.
- Review `CHANGELOG.md`.
- Run the required gate.
- Build with `GITHUB_PAGES=true`.
- Tag `v1.0.0`.
- Create a GitHub Release from the tag.
- Watch GitHub Pages deploy and smoke-test login, Biblioteca, Dado, Explorador and Curacion.
- Install from browser/PWA prompt once and confirm standalone launch reaches Biblioteca.

## Known Launch Notes

- Firebase Auth, Firestore and Analytics are split behind lazy imports. `npm run build` should not emit Vite's 500 kB chunk warning; if it returns, inspect the initial `index-*.js` chunk before tagging.
- The service worker only caches same-origin app shell/assets and should not intercept Firebase or external API calls.
- `npm audit --audit-level=moderate` reports transitive `uuid` advisories through Firebase Admin/Tools dependency chains. High severity audit is clean-gated for 1.0; revisit after Firebase packages publish non-breaking patched dependency trees.
