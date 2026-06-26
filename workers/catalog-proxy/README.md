# Nexo Catalog Proxy

Cloudflare Worker that keeps TMDB and RAWG keys out of the Vite bundle and centralizes cached catalog discovery. The web app calls this proxy through `VITE_CATALOG_PROXY_URL`.

## Local

```sh
Copy-Item workers/catalog-proxy/.dev.vars.example workers/catalog-proxy/.dev.vars
npm run worker:dev
```

Fill `workers/catalog-proxy/.dev.vars` locally. It is ignored by git and should never be committed.

## Production

```sh
npx wrangler login
npm run worker:secret:tmdb
npm run worker:secret:rawg
npm run worker:secret:google-books
npm run worker:deploy
```

After deploy, set this public GitHub Actions variable for the Pages build:

```txt
VITE_CATALOG_PROXY_URL=https://nexo-catalog-proxy.<your-subdomain>.workers.dev
```

Do not add TMDB, RAWG, or Google Books keys to GitHub variables or Vite env vars.

The Worker can be deployed before secrets exist; TMDB, RAWG, and Google Books searches simply return no proxy results until those secrets are configured. AniList, Jikan, Kitsu, Open Library, and Wikidata do not need secrets.

## Endpoints

- `GET /health`
- `GET /search?q=&type=`
- `GET /discover?type=&duration=&seed=`

`/discover` returns a single `{ result }` candidate with a poster when possible, using cached seeded searches across the same providers as `/search`. Seeds are grouped into short-lived buckets so "Otra" keeps variety without making every request miss the cache.
