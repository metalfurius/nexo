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

Functions secrets:

- `TMDB_TOKEN`
- `RAWG_API_KEY`

Moderators are managed manually by creating `moderators/{uid}` documents. Public catalog writes are performed through Firebase Functions, not direct client writes.

## Verification

```sh
npm run lint
npm run test
npm run test:rules
npm run build:functions
npm run build
npm run test:e2e
```

`npm run release:check` runs the launch gate used before tagging a release. It gates high severity audit findings; the current moderate Firebase-tooling transitive `uuid` advisories are documented in `docs/release-checklist.md`.
