variable "project_id" {
  description = "Firebase/Google Cloud project id."
  type        = string
  default     = "recomendaciones-78eb7"
}

variable "project_number" {
  description = "Numeric Google Cloud project number used in principalSet identifiers."
  type        = string
}

variable "runtime_service_account_email" {
  description = "Gen2 Functions runtime service account that the deploy identity may impersonate."
  type        = string
}

variable "deployment_roles" {
  description = "Project roles required by Firebase CLI for Functions, Firestore rules and indexes."
  type        = set(string)
  default = [
    "roles/artifactregistry.admin",
    "roles/cloudbuild.builds.editor",
    "roles/cloudfunctions.admin",
    "roles/datastore.indexAdmin",
    "roles/datastore.user",
    "roles/firebase.admin",
    "roles/run.admin",
    "roles/serviceusage.serviceUsageConsumer",
  ]
}
