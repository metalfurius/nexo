# Nexo Catalog Proxy

Cloudflare Worker that keeps provider keys out of the Vite bundle and centralizes cached catalog discovery. Production is published as the custom domain `catalog-api.nexo.codeoverdose.es`.

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
VITE_CATALOG_API_URL=https://catalog-api.nexo.codeoverdose.es
```

Do not add TMDB, RAWG, or Google Books keys to GitHub variables or Vite env vars.

AniList, Jikan, Kitsu, Open Library, and Wikidata do not need secrets. Production deployment must still fail when its required Cloudflare credentials are absent; provider failures return partial results instead of failing the whole request.

The GitHub `production` environment must use an account token with a maximum TTL of 90 days, limited to this Worker and the `codeoverdose.es` zone permissions required by the custom domain. Store only `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as environment secrets.

The previous `workers.dev` endpoint remains enabled throughout v1.1.x so a failed Pages rollout cannot strand the already deployed frontend. Disable it in v1.2.0 only after the custom domain has passed production smoke and the legacy frontend variable has been removed.

## Endpoints

- `GET /health`
- `GET /v1/catalog/search?q=&type=&limit=`
- `GET /v1/catalog/discover?type=&duration=&seed=`

The legacy `/search` and `/discover` paths remain available during the v1.1.x compatibility window. Search input is limited to 120 characters and 1–48 results. Provider traffic is capped at four concurrent connections, 36 total subrequests, three seconds per provider and eight seconds per request. Internal rate-limit bindings enforce 60 searches/minute and 20 discovery requests/minute per privacy-preserving client hash.

`/discover` returns a single `{ result }` candidate with a poster when possible, using cached seeded searches across the same providers as `/search`. Seeds are grouped into short-lived buckets so "Otra" keeps variety without making every request miss the cache.

Logs contain route, status, duration, cache/partial state and failed provider names. They never include IP addresses, search text or returned user content. Configure the zone WAF separately at 100 requests per 10 seconds as the outer abuse-control layer.
