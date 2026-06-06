# Nexo

Nexo is a private media library and weighted recommendation tool for games, books, movies, series, anime, manga, manhwa and comics.

Version 1.0 is a soft beta behind Google login. Every signed-in user gets a private library under `users/{uid}`, while the shared Nexo catalog lives in `publicItems` and is readable by signed-in users.

## Core Flows

- `Biblioteca`: private items, status tracking, JSON import/export and personal notes.
- `Dado`: weighted recommendation roll using time, energy, novelty and surprise preferences.
- `Explorador`: searches the curated Nexo catalog and external providers, then queues candidates to save or dismiss.
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

Firebase Functions are optional for a future Blaze-backed upgrade. The low-cost production path uses the public Nexo catalog plus browser-callable providers, and routes secret-backed providers through a tiny Cloudflare Worker:

- Open Library, AniList and Wikidata work without keys.
- TMDB improves movies/series through the Worker secret `TMDB_READ_TOKEN`.
- RAWG improves games through the Worker secret `RAWG_API_KEY`.
- The frontend only receives `VITE_CATALOG_PROXY_URL`, which is safe to expose.

The app keeps provider credits in the `Fuentes` dialog and only stores user-selected private copies.

## Catalog Proxy

The Worker lives in `workers/catalog-proxy` and is deployed separately from GitHub Pages:

```sh
npx wrangler login
npm run worker:secret:tmdb
npm run worker:secret:rawg
npm run worker:deploy
```

Then add `VITE_CATALOG_PROXY_URL` as a GitHub Actions variable, for example:

```txt
https://nexo-catalog-proxy.<your-subdomain>.workers.dev
```

Do not store TMDB or RAWG keys as Vite variables; anything prefixed with `VITE_` is bundled for the browser.

## Public Catalog Seed

```sh
npm run catalog:normalize
npm run catalog:write -- --project recomendaciones-78eb7 --actor <admin-uid>
```

The seed workflow validates and normalizes reviewed entries before writing to `publicItems` with Firebase Admin SDK credentials. See `docs/public-catalog-import.md`.

## Verification

```sh
npm run lint
npm run test
npm run test:rules
npm run build
npm run check:build-output
npm run build:functions
npm run test:e2e
npm run check:release-files
```

`npm run test:rules` reuses a running Firestore emulator on `127.0.0.1:8080` when available, otherwise it starts one for the rules suite.

`npm run check:release-files` validates launch metadata such as package versions, PWA manifest shortcuts, CNAME, Firebase config, required docs and the public catalog seed.

`npm run check:build-output` validates the generated `dist` folder before deploy, including clean-subdomain asset paths, copied PWA files and `CNAME`.

`npm run release:check` runs the launch gate used before tagging a release. It gates high severity audit findings; the current moderate Firebase-tooling transitive `uuid` advisories are documented in `docs/release-checklist.md`.

GitHub Actions runs the same gate for pull requests and repeats it before deploying `main` to GitHub Pages.
