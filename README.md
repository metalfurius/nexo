# Nexo

Nexo is a public catalog plus private media library and weighted recommendation tool for games, books, movies, series, anime, manga, manhwa and comics.

Version 1.1.50 opens on public `Descubrir` for visitors and on the private `Inicio` roadmap for signed-in users. Every signed-in user gets a private library under `users/{uid}`, while the shared Nexo catalog lives in `publicItems`.

## Core Flows

- `Inicio`: private visual roadmap across Ahora, Después and Más adelante, with recent completions and activity.
- `Descubrir`: one surface for catalog search, surprise discovery and the pending candidate queue.
- `Biblioteca`: private saved-item search, status tracking, filters, JSON import/export and personal notes.
- `Dado`: weighted recommendation roll that can prioritize the roadmap's Después lane.
- `Más`: Importar, Ajustes and role-gated Curacion destinations without crowding primary navigation.
- `Ajustes`: private taste signals, default explorer type and theme.
- `Curacion`: moderator-only public catalog editing.
- `Catalog seed`: admin-side import of reviewed public catalog entries from `seed/public-catalog.seed.json`.

## Local Development

```sh
npm ci
npm --prefix functions ci
npm run dev
```

Use demo mode for local UI work without Firebase:

```sh
$env:VITE_DEMO_MODE='true'
npm run dev
```

## Firebase

Required Vite variables are listed in `.env.example`.

Nexo's default production path is Spark-compatible: Auth, Firestore and GitHub Pages are enough. Each signed-in user gets a profile at `users/{uid}` with `role: "user" | "moderator" | "admin"`. The app can create and refresh safe profile fields, but Firestore rules prevent users from changing `role`.

Bootstrap the first admin manually from Firebase Console or Admin SDK by setting `users/{uid}.role` to `admin`. After that, admins can manage roles by editing user profile documents, while `admin` and `moderator` users can curate `publicItems`.

Firebase Functions expose the public catalog read endpoint, bounded catalog search and the authenticated, idempotent `recordCatalogDemands` callable. Clients cannot create or update `publicItems` directly; Functions create demand receipts and moderators curate shared entries.

- Open Library, AniList, Jikan and Wikidata work without keys.
- TMDB improves movies/series through the Worker secret `TMDB_READ_TOKEN`.
- RAWG improves games through the Worker secret `RAWG_API_KEY`.
- Firebase Functions do not store TMDB/RAWG secrets; Cloudflare Worker is the only secret-backed catalog proxy.
- The frontend prefers `VITE_CATALOG_API_URL=https://catalog-api.nexo.codeoverdose.es`; `VITE_CATALOG_PROXY_URL` remains a v1.1.x compatibility fallback.
- Anonymous catalog pages can use `VITE_PUBLIC_CATALOG_URL`, pointing at the `publicCatalog` HTTP Function.
- Signed-in catalog searches can call `searchCatalog`; every Firestore search uses at most two bounded queries, while demand registration is fragmented into batches of at most 100 entries.
- Display ad placeholders are controlled by `VITE_ADS_ENABLED`; keep it `false` until the ad account and policy review are ready.

The app keeps provider credits in the `Fuentes` dialog. Private library copies still live under `users/{uid}`, while server-created demand entries stay in `publicItems` for later moderator curation.

## Catalog Proxy

The Worker lives in `workers/catalog-proxy`. Production deploys it before Pages and verifies `/health` exposes the same immutable revision:

```sh
npx wrangler login
npm run worker:secret:tmdb
npm run worker:secret:rawg
npm run worker:deploy
```

Set the public GitHub Actions variable:

```txt
VITE_CATALOG_API_URL=https://catalog-api.nexo.codeoverdose.es
```

Do not store provider keys as Vite variables; anything prefixed with `VITE_` is bundled for the browser. WIF and WAF infrastructure lives under `infra/`; deployment credentials remain short-lived environment secrets.

## Public Catalog Seed

```sh
npm run catalog:normalize
npm run catalog:write -- --project recomendaciones-78eb7 --actor <admin-uid>
```

The seed workflow validates and normalizes reviewed entries before writing to `publicItems` with Firebase Admin SDK credentials. See `docs/public-catalog-import.md`.

## Verification

```sh
npm run lint
npm run check:architecture
npm run typecheck:tests
npm run typecheck:e2e
npm run test:coverage
npm run test:rules
npm run build
npm run check:build-output
npm run build:functions
npm run test:e2e
npm run test:e2e:pwa
npm run test:e2e:firebase
npm run worker:check
npm run check:release-tools
npm run check:release-files
npm run audit:functions
```

`npm run test:rules` reuses a running Firestore emulator on `127.0.0.1:8080` when available, otherwise it starts one for the rules suite.

`npm run check:release-files` validates launch metadata such as package versions, PWA manifest shortcuts, CNAME, Firebase config, required docs and the public catalog seed.

`npm run check:build-output` validates the generated `dist` folder before deploy, including clean-subdomain asset paths, copied PWA files and `CNAME`. It also enforces initial first-party budgets below 200 KiB for JavaScript and CSS and rejects public-entry preloads of Home, Biblioteca or importers.

App Check is loaded in observational mode when its public reCAPTCHA Enterprise site key exists. Follow `docs/app-check-rollout.md`; enforcement must not begin until seven complete days of healthy metrics have been reviewed.

`npm run check:release-tools` verifies the exclusive dynamic `release:x.y.z` label contract, exact target updates, idempotency and downgrade protection.

`npm run release:check` runs the launch gate used before tagging a release. It gates high severity audit findings; the current moderate Firebase-tooling transitive `uuid` advisories are documented in `docs/release-checklist.md`.

GitHub Actions runs the same gate for pull requests and pushes to `main`. A successful `main` gate deploys Firebase, the catalog Worker and Pages in order, then verifies their shared revision before publishing the tag/release.

A release PR must use exactly one increasing SemVer label, `release:x.y.z`. The version script synchronizes the root and Functions packages and lockfiles; Workbox derives service-worker cache names from that package version at build time.
