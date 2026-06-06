# Nexo Catalog Proxy

Cloudflare Worker that keeps TMDB and RAWG keys out of the Vite bundle. The web app calls this proxy through `VITE_CATALOG_PROXY_URL`; Open Library, AniList and Wikidata remain direct client-side sources because they do not need secrets.

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
npm run worker:deploy
```

After deploy, set this public GitHub Actions variable for the Pages build:

```txt
VITE_CATALOG_PROXY_URL=https://nexo-catalog-proxy.<your-subdomain>.workers.dev
```

Do not add TMDB or RAWG keys to GitHub variables or Vite env vars.

The Worker can be deployed before secrets exist; TMDB and RAWG searches simply return no proxy results until those secrets are configured.
