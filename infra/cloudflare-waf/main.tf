resource "cloudflare_ruleset" "catalog_api_rate_limit" {
  zone_id     = var.zone_id
  name        = "Nexo catalog API rate limiting"
  description = "Outer abuse-control layer for the Nexo catalog gateway"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [{
    ref         = "nexo_catalog_api_100_per_10_seconds"
    description = "Block clients exceeding 100 catalog API requests in 10 seconds"
    expression  = "http.host eq \"catalog-api.nexo.codeoverdose.es\""
    action      = "block"
    enabled     = true

    ratelimit = {
      characteristics     = ["cf.colo.id", "ip.src"]
      period              = 10
      requests_per_period = 100
      mitigation_timeout  = 10
    }
  }]
}
