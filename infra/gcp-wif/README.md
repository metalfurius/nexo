# GitHub Actions WIF for Nexo

This module creates the deploy service account and an OIDC provider that accepts only repository id `1255487355`, owner id `75508084`, and `refs/heads/main`.

Apply it with an IAM administrator, using the checked-in non-secret example values:

```sh
terraform init
terraform apply -var-file=terraform.tfvars.example
```

Copy the two outputs into variables on the GitHub `production` environment named `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_SERVICE_ACCOUNT`. The production workflow intentionally fails when either variable is missing.

The module never creates or stores a service-account key.
