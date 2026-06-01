# Nexo 1.0 Release Checklist

## Required Gate

- `npm ci`
- `npm --prefix functions ci`
- `npm run lint`
- `npm run test`
- `npm run test:rules`
- `npm run build:functions`
- `npm run build`
- `npm run test:e2e`
- `npm audit --audit-level=high`

`npm run release:check` covers the full local gate and expects Java/Firebase emulators to be available for Firestore rules tests.

## Firebase

- Confirm GitHub Pages variables match `.env.example`.
- Confirm Firebase Auth Google provider is enabled.
- Confirm Firestore rules and indexes are deployed.
- Confirm Functions are deployed with `TMDB_TOKEN` and `RAWG_API_KEY`.
- Create moderator marker documents manually at `moderators/{uid}`.
- Seed or curate initial `publicItems` entries before sharing beta access.

## Release Steps

- Verify package versions are `1.0.0`.
- Review `CHANGELOG.md`.
- Run the required gate.
- Build with `GITHUB_PAGES=true`.
- Tag `v1.0.0`.
- Create a GitHub Release from the tag.
- Watch GitHub Pages deploy and smoke-test login, Biblioteca, Dado, Explorador and Curacion.

## Known Launch Notes

- The production bundle currently crosses Vite's 500 kB warning because Firebase, React and the single-screen app shell are bundled together. This is accepted for 1.0 beta, but the next performance task should split Firebase/auth and moderator curation code behind lazy imports.
- `npm audit --audit-level=moderate` reports transitive `uuid` advisories through Firebase Admin/Tools dependency chains. High severity audit is clean-gated for 1.0; revisit after Firebase packages publish non-breaking patched dependency trees.
