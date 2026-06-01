# Nexo

Nexo is a private media library and weighted recommendation tool for games, books, movies, series, anime, manga, manhwa and comics.

Version 1.0 is a soft beta behind Google login. Every signed-in user gets a private library under `users/{uid}`, while the shared Nexo catalog lives in `publicItems` and is readable by signed-in users.

## Core Flows

- `Biblioteca`: private items, status tracking, JSON import/export and personal notes.
- `Dado`: weighted recommendation roll using time, energy, novelty and surprise preferences.
- `Explorador`: searches the curated Nexo catalog and external providers, then queues candidates to save or dismiss.
- `Ajustes`: private taste signals, default explorer type and theme.
- `Curacion`: moderator-only public catalog editing.

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

Firebase Functions are optional for a future Blaze-backed upgrade if server-side API keys are needed for providers like TMDB or RAWG. The Spark-compatible explorer uses the public Nexo catalog plus browser-callable providers such as Open Library and AniList.

## Verification

```sh
npm run lint
npm run test
npm run test:rules
npm run build
npm run test:e2e
```

`npm run release:check` runs the launch gate used before tagging a release. It gates high severity audit findings; the current moderate Firebase-tooling transitive `uuid` advisories are documented in `docs/release-checklist.md`.
