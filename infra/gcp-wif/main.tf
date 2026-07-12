locals {
  github_repository_id = "1255487355"
  github_owner_id      = "75508084"
  github_main_ref      = "refs/heads/main"
  pool_id              = "github-actions"
  provider_id          = "nexo-main"
}

resource "google_project_service" "wif_apis" {
  for_each = toset([
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
  ])

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_service_account" "github_deployer" {
  project      = var.project_id
  account_id   = "github-nexo-deployer"
  display_name = "GitHub deployer for Nexo"
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = local.pool_id
  display_name              = "GitHub Actions"

  depends_on = [google_project_service.wif_apis]
}

resource "google_iam_workload_identity_pool_provider" "nexo_main" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = local.provider_id
  display_name                       = "Nexo main deployments"

  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
    "attribute.ref"                 = "assertion.ref"
  }

  attribute_condition = join(" && ", [
    "assertion.repository_id == '${local.github_repository_id}'",
    "assertion.repository_owner_id == '${local.github_owner_id}'",
    "assertion.ref == '${local.github_main_ref}'",
  ])

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_wif" {
  service_account_id = google_service_account.github_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/projects/${var.project_number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.github.workload_identity_pool_id}/attribute.repository_id/${local.github_repository_id}"
}

resource "google_project_iam_member" "deployment" {
  for_each = var.deployment_roles

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.github_deployer.email}"
}

resource "google_service_account_iam_member" "runtime_act_as" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${var.runtime_service_account_email}"
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_deployer.email}"
}

output "github_actions_workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.nexo_main.name
}

output "github_actions_service_account" {
  value = google_service_account.github_deployer.email
}
