# Catalog API WAF rate limit

This module applies the outer `100 requests / 10 seconds` limit to `catalog-api.nexo.codeoverdose.es`. The Worker rate-limit bindings remain the stricter route-specific controls.

Use a Cloudflare API token with a maximum TTL of 90 days and only `Zone WAF Write` for the required zone. Pass it through `CLOUDFLARE_API_TOKEN`; never put it in a `.tfvars` file.

```sh
terraform init
CLOUDFLARE_API_TOKEN=... terraform apply -var='zone_id=ZONE_ID'
```

Cloudflare supports one zone entry-point ruleset per phase. If the zone already has an `http_ratelimit` ruleset, import it and merge this rule into that resource before applying instead of replacing existing rules.
