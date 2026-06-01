# Public Catalog Import

Nexo can seed its shared catalog without Firebase Functions or paid Blaze features.

The recommended path is curated import, not uncontrolled scraping:

- Keep reviewed drafts in `seed/public-catalog.seed.json`.
- Normalize them into full `PublicCatalogItem` documents.
- Write to Firestore with Admin SDK credentials only when the normalized output looks right.
- Keep provider licenses and terms under review before expanding the seed massively.

## Normalize

```sh
npm run catalog:normalize
```

This reads `seed/public-catalog.seed.json` and writes `seed/public-catalog.normalized.json`.

The normalizer:

- validates required fields;
- rejects unknown item types;
- rejects duplicate `type:title` canonical keys;
- generates ids, `searchTokens`, `canonicalKey`, timestamps and actor metadata.

## Write To Firestore

```sh
npm run catalog:write -- --project recomendaciones-78eb7 --actor <admin-uid>
```

The script writes to `publicItems/{publicItemId}` using Admin SDK credentials and merge writes.

For local machines, authenticate the Firebase Admin SDK with:

```sh
gcloud auth application-default login
```

or set `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON path.

## Role Model

Client users cannot import catalog data directly. The app reads roles from `users/{uid}.role`:

- `user`: private library only;
- `moderator`: can curate public catalog from the app;
- `admin`: can curate and, later, manage roles.

The import script bypasses client rules because it uses Admin SDK, so treat seed edits as release/admin operations.
