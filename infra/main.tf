terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.19"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google" {
  alias                 = "billing"
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}

data "google_project" "current" {}

# --- APIs ---
resource "google_project_service" "apis" {
  for_each = toset([
    "compute.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudbilling.googleapis.com",
    "billingbudgets.googleapis.com",
    "pubsub.googleapis.com",
    "cloudfunctions.googleapis.com",
    "cloudbuild.googleapis.com",
    "eventarc.googleapis.com",
    "iamcredentials.googleapis.com",
    "iam.googleapis.com",
  ])
  service            = each.key
  disable_on_destroy = false
}

# --- GCS Bucket ---
resource "google_storage_bucket" "data" {
  name                        = "cinema-scheduler-${var.project_id}"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true

  lifecycle_rule {
    condition {
      num_newer_versions = 3
    }
    action {
      type = "Delete"
    }
  }

  versioning {
    enabled = true
  }
}

# --- Secret Manager ---
resource "google_secret_manager_secret" "api_keys" {
  secret_id = "cinema-scheduler-api-keys"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

# --- Service Account (VM) ---
resource "google_service_account" "vm" {
  account_id   = "cinema-scheduler-vm"
  display_name = "Cinema Scheduler VM"
}

# VM SA → GCS read/write
resource "google_storage_bucket_iam_member" "vm_gcs_admin" {
  bucket = google_storage_bucket.data.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.vm.email}"
}

# VM SA → Secret Manager
resource "google_secret_manager_secret_iam_member" "vm_secret_accessor" {
  secret_id = google_secret_manager_secret.api_keys.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.vm.email}"
}

# --- GCE Instance (e2-micro, free tier) ---
resource "google_compute_address" "main" {
  name   = "cinema-scheduler-ip"
  region = "us-central1"
}

resource "google_compute_instance" "main" {
  name         = "cinema-scheduler"
  machine_type = "e2-micro"
  zone         = var.vm_zone

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 30
      type  = "pd-standard"
    }
  }

  network_interface {
    network = "default"
    access_config {
      nat_ip = google_compute_address.main.address
    }
  }

  service_account {
    email  = google_service_account.vm.email
    scopes = ["cloud-platform"]
  }

  metadata = {
    gcs-bucket          = google_storage_bucket.data.name
    scrape-days         = tostring(var.scrape_days)
    scrape-areas        = var.scrape_areas
    scrape-concurrency  = tostring(var.scrape_concurrency)
  }

  metadata_startup_script = file("${path.module}/scripts/startup.sh")

  tags = ["cinema-scheduler", "http-server"]

  depends_on = [google_project_service.apis]
}

# --- Firewall ---
resource "google_compute_firewall" "allow_http" {
  name    = "cinema-scheduler-allow-http"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["8080"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["http-server"]
}

# --- Budget Alert ---
resource "google_pubsub_topic" "budget_alerts" {
  name       = "budget-alerts"
  depends_on = [google_project_service.apis]
}

resource "google_billing_budget" "monthly" {
  provider = google.billing
  count    = var.billing_account_id != "" ? 1 : 0

  billing_account = var.billing_account_id
  display_name    = "Cinema Scheduler Monthly Budget"

  budget_filter {
    projects = ["projects/${data.google_project.current.number}"]
  }

  amount {
    specified_amount {
      currency_code = "JPY"
      units         = tostring(var.budget_amount)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 0.8
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }

  all_updates_rule {
    pubsub_topic                    = google_pubsub_topic.budget_alerts.id
    schema_version                  = "1.0"
    enable_project_level_recipients = true
  }
}

# --- Budget Shutdown Function ---
resource "google_service_account" "budget_shutdown" {
  account_id   = "budget-shutdown-fn"
  display_name = "Budget Shutdown Cloud Function"
}

resource "google_project_iam_member" "budget_shutdown_compute_admin" {
  project = var.project_id
  role    = "roles/compute.instanceAdmin.v1"
  member  = "serviceAccount:${google_service_account.budget_shutdown.email}"
}

data "archive_file" "budget_shutdown" {
  type        = "zip"
  source_dir  = "${path.module}/functions/budget-shutdown"
  output_path = "${path.module}/.terraform/tmp/budget-shutdown.zip"
}

resource "google_storage_bucket_object" "budget_shutdown_source" {
  name   = "functions/budget-shutdown-${data.archive_file.budget_shutdown.output_md5}.zip"
  bucket = google_storage_bucket.data.name
  source = data.archive_file.budget_shutdown.output_path
}

resource "google_cloudfunctions2_function" "budget_shutdown" {
  name        = "budget-shutdown"
  location    = var.region
  description = "Stops GCE instance when budget is exceeded"

  build_config {
    runtime     = "python312"
    entry_point = "handle_budget_notification"

    source {
      storage_source {
        bucket = google_storage_bucket.data.name
        object = google_storage_bucket_object.budget_shutdown_source.name
      }
    }
  }

  service_config {
    available_memory               = "256Mi"
    timeout_seconds                = 120
    max_instance_count             = 1
    min_instance_count             = 0
    service_account_email          = google_service_account.budget_shutdown.email
    all_traffic_on_latest_revision = true
    ingress_settings               = "ALLOW_INTERNAL_ONLY"

    environment_variables = {
      GCP_PROJECT_ID = var.project_id
      GCE_ZONE       = var.vm_zone
      GCE_INSTANCE   = google_compute_instance.main.name
    }
  }

  event_trigger {
    trigger_region        = var.region
    event_type            = "google.cloud.pubsub.topic.v1.messagePublished"
    pubsub_topic          = google_pubsub_topic.budget_alerts.id
    retry_policy          = "RETRY_POLICY_DO_NOT_RETRY"
    service_account_email = google_service_account.budget_shutdown.email
  }

  depends_on = [
    google_project_service.apis,
    google_storage_bucket_object.budget_shutdown_source,
  ]
}

# --- Workload Identity Federation (GitHub Actions CI/CD) ---
resource "google_service_account" "github_actions" {
  count        = var.github_repo != "" ? 1 : 0
  account_id   = "github-actions-deploy"
  display_name = "GitHub Actions Deploy"
}

resource "google_iam_workload_identity_pool" "github" {
  count                     = var.github_repo != "" ? 1 : 0
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
  depends_on                = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  count                              = var.github_repo != "" ? 1 : 0
  workload_identity_pool_id          = google_iam_workload_identity_pool.github[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }

  attribute_condition = "assertion.repository == \"${var.github_repo}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# GitHub Actions SA → GCS write (upload deploy.tar.gz)
resource "google_storage_bucket_iam_member" "github_gcs_writer" {
  count  = var.github_repo != "" ? 1 : 0
  bucket = google_storage_bucket.data.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.github_actions[0].email}"
}

# GitHub Actions SA → Compute instance admin (SSH + manage)
resource "google_project_iam_member" "github_compute_admin" {
  count   = var.github_repo != "" ? 1 : 0
  project = var.project_id
  role    = "roles/compute.instanceAdmin.v1"
  member  = "serviceAccount:${google_service_account.github_actions[0].email}"
}

# GitHub Actions SA → IAP tunnel access (for gcloud compute ssh)
resource "google_project_iam_member" "github_iap_tunnel" {
  count   = var.github_repo != "" ? 1 : 0
  project = var.project_id
  role    = "roles/iap.tunnelResourceAccessor"
  member  = "serviceAccount:${google_service_account.github_actions[0].email}"
}

# GitHub Actions SA → act as VM service account
resource "google_service_account_iam_member" "github_act_as_vm" {
  count              = var.github_repo != "" ? 1 : 0
  service_account_id = google_service_account.vm.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_actions[0].email}"
}

# WIF → GitHub Actions SA impersonation
resource "google_service_account_iam_member" "github_wif_binding" {
  count              = var.github_repo != "" ? 1 : 0
  service_account_id = google_service_account.github_actions[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.repository/${var.github_repo}"
}
